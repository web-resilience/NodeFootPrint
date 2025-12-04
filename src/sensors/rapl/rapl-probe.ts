import fs from "node:fs/promises";
import { Dirent } from "node:fs";
import path from "node:path";
import { accessReadable } from "../../../utils/file-utils.js";


type RaplStatus = 'OK' | 'DEGRADED' | 'FAILED';
type RaplVendor = 'intel' | 'amd' | 'unknown';

interface RaplPackageInfo {
  vendor: RaplVendor;
  node: string;
  path: string;
  name: string;
  energyPath: string;
  hasEnergyReadable: boolean;
  reason: string | null;
  maxEnergyUj: number | null;
  files: {
    energyUj: string;
    maxEnergyUj: string;
  };
}

interface RaplProbeResult {
  status: RaplStatus;
  vendor?: RaplVendor;
  packages: RaplPackageInfo[];
  hint?: string | null;
}


const DEFAULT_BASE_PATH = '/sys/class/powercap';


/**
 * Sonde l’interface RAPL (Running Average Power Limit) exposée par le noyau
 * Linux via la hiérarchie sysfs `powercap` et retourne une description des
 * paquets CPU détectés.
 *
 * La fonction inspecte le répertoire `basePath` (par défaut `/sys/class/powercap`),
 * parcourt ses sous-répertoires et sélectionne ceux dont le fichier `name`
 * contient la sous-chaîne `"package-"`. Pour chaque paquet RAPL trouvé, elle
 * essaie de récupérer :
 *
 * - le compteur d’énergie cumulée `energy_uj` (en microjoules) ;
 * - la valeur de wrap du compteur `max_energy_uj`, si disponible ;
 * - le chemin réel du fichier `energy_uj` (via `realpath`, si possible).
 *
 * Les erreurs liées au système de fichiers (répertoire absent, permissions,
 * fichiers manquants, etc.) sont **attrapées** et reflétées dans la structure
 * de retour : la fonction ne lance pas d’exception et retourne toujours
 * un objet de résultat.
 *
 * ### Statut retourné
 *
 * Le champ `status` du résultat peut prendre les valeurs suivantes :
 *
 * - `"OK"` :
 *   - au moins un paquet RAPL a été détecté ;
 *   - au moins un fichier `energy_uj` est lisible.
 *
 * - `"DEGRADED"` :
 *   - des paquets RAPL ont été détectés ;
 *   - **aucun** fichier `energy_uj` n’est lisible (par exemple permissions insuffisantes).
 *
 * - `"FAILED"` :
 *   - aucun paquet RAPL n’a été trouvé dans `basePath` **ou**
 *   - le répertoire `basePath` est inaccessible ou inexistant.
 *
 * Dans les cas `"DEGRADED"` ou `"FAILED"`, le champ `hint` fournit un message
 * textuel pour aider au diagnostic (chemin introuvable, absence de paquets,
 * problème de permissions, etc.).
 *
 * ### Structure du résultat
 *
 * L’objet retourné contient au minimum :
 *
 * - `status` : `"OK" | "DEGRADED" | "FAILED"`.
 * - `packages` : tableau d’objets décrivant les paquets RAPL détectés
 *   (éventuellement vide si `status === "FAILED"`).
 * - `hint` : chaîne explicative ou `null`/non défini lorsque tout va bien.
 * - `vendor` : le constructeur principal déduit des paquets, si connu :
 *   - `"intel"` si un paquet `intel-rapl:*` lisible est trouvé,
 *   - `"amd"` si un paquet `amd-rapl:*` lisible est trouvé,
 *   - `"unknown"` sinon.
 *
 * Chaque entrée du tableau `packages` possède les champs suivants :
 *
 * - `vendor` : `"intel" | "amd" | "unknown"` — déduit du nom de nœud
 *   (préfixe `intel-rapl` ou `amd-rapl`).
 * - `node` : nom du répertoire sous `basePath` (par ex. `"intel-rapl:0"`).
 * - `path` : chemin absolu du répertoire du paquet (par ex.
 *   `"/sys/class/powercap/intel-rapl:0"`).
 * - `name` : contenu du fichier `name` (par ex. `"package-0"`).
 * - `energyPath` : chemin réel résolu de `energy_uj` si possible, sinon
 *   le chemin nominal.
 * - `hasEnergyReadable` : `true` si `energy_uj` est lisible, `false` sinon.
 * - `reason` : message d’erreur associé (par ex. permission refusée),
 *   ou `null` si `hasEnergyReadable === true`.
 * - `maxEnergyUj` : valeur numérique de `max_energy_uj` (wrap du compteur
 *   en microjoules), ou `null` si le fichier est absent, illisible ou invalide.
 * - `files` :
 *   - `files.energyUj` : chemin utilisé pour lire `energy_uj`
 *     (souvent identique à `energyPath`),
 *   - `files.maxEnergyUj` : chemin du fichier `max_energy_uj`.
 *
 * ### Utilisation typique
 *
 * ```ts
 * const result = await raplProbe();
 *
 * if (result.status === 'OK' || result.status === 'DEGRADED') {
 *   for (const pkg of result.packages) {
 *     console.log(
 *       `Paquet ${pkg.name} (${pkg.vendor}) à ${pkg.path}, lisible:`,
 *       pkg.hasEnergyReadable
 *     );
 *   }
 * } else {
 *   console.warn('RAPL non disponible:', result.hint);
 * }
 * ```
 *
 * @param basePath
 *   Chemin racine de la hiérarchie powercap à sonder. Par défaut
 *   `/sys/class/powercap`. Peut être surchargé pour des tests
 *   (fake sysfs, chroot, etc.).
 *
 * @returns
 *   Une promesse résolue avec un objet décrivant le statut global
 *   de la sonde, les paquets RAPL détectés et des indications
 *   de diagnostic (`hint`).
 */
export async function raplProbe(basePath: string = DEFAULT_BASE_PATH): Promise<RaplProbeResult> {

    let dirEntries: Dirent[] | null;

    try {
        dirEntries = await fs.readdir(basePath, { withFileTypes: true });
    } catch (error) {
        dirEntries = null;
    }

    if (!dirEntries) {
        return { status: 'FAILED',packages:[], hint: `${basePath} not found` };
    }

    const packages:RaplPackageInfo[] = [];

    for (const entry of dirEntries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) {
            continue;
        }

        const dirname = entry.name;

        const packagePath = path.join(basePath, dirname);
        const namePath = path.join(packagePath, 'name');
        const energyPath = path.join(packagePath, 'energy_uj');
        const maxEnergyPath = path.join(packagePath, 'max_energy_uj');

        let name:string;

        try {
            name = (await fs.readFile(namePath, 'utf-8')).trim();
        } catch (error) {
            continue;
        }

        if (!name.includes('package-')) {
            continue;
        }

        const [readable, maxEnergyContent] = await Promise.all([
            accessReadable(energyPath),
            fs.readFile(maxEnergyPath, 'utf-8').catch(() => null)
        ]);

        let maxEnergyUj:number | null = null;
        if (maxEnergyContent) {
            const maxEnergyValue = Number(String(maxEnergyContent).trim());
            if (Number.isFinite(maxEnergyValue)) {
                maxEnergyUj = maxEnergyValue;
            }
        }

        let realEnergyPath = energyPath;
        try {
            realEnergyPath = await fs.realpath(energyPath);
        } catch (error) {
            // ignore
        }
        packages.push({
            vendor: dirname.startsWith('intel-rapl') ? 'intel' : (dirname.startsWith('amd-rapl') ? 'amd' : 'unknown'),
            node: dirname,
            path: packagePath,
            name,
            energyPath: realEnergyPath,
            hasEnergyReadable: readable.ok,
            reason: readable.ok ? null : readable.error,
            maxEnergyUj,
            files: {
                energyUj: realEnergyPath,
                maxEnergyUj: maxEnergyPath
            }
        });
    }

    if(packages.length === 0) {
        return { status: 'FAILED',packages:[],hint: `No RAPL packages (intel-rapl:N or amd-rapl:N) found in ${basePath}. VM without powercap ?` };
    }

    const anyReadable = packages.some(p => p.hasEnergyReadable);
    const vendor:RaplVendor = packages.find(p => p.hasEnergyReadable)?.vendor || packages[0].vendor;
    const status:RaplStatus = anyReadable ? 'OK' : 'DEGRADED';
    const hint = anyReadable ? null : 'RAPL energy_uj files are not readable (permission denied ?)';

    return {
        status,
        vendor,
        packages,
        hint
    };

}