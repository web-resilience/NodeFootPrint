# raplProbe

`raplProbe` est une petite fonction Node.js/TypeScript qui sonde l’interface RAPL
(**Running Average Power Limit**) exposée par le noyau Linux via `sysfs`
(`powercap`), et renvoie un état synthétique ainsi qu’une description détaillée
des paquets RAPL détectés (Intel / AMD).

Elle est pensée pour être :

- **Robuste** : aucune exception n’est levée en cas d’absence de RAPL ou de
  problèmes de permissions, tout est encapsulé dans le résultat.
- **Facile à intégrer** : un simple appel asynchrone qui renvoie un objet JSON.
- **“Green-friendly”** : elle ne fait qu’un scan léger de la hiérarchie
  `powercap` et ne lit que les fichiers nécessaires.

---

## Sommaire

- [raplProbe](#raplprobe)
  - [Sommaire](#sommaire)
  - [Prérequis](#prérequis)
  - [API détaillée](#api-détaillée)
  - [Types retournés](#types-retournés)
  - [Gestion des erreurs](#gestion-des-erreurs)
  - [Bonnes pratiques \& green coding](#bonnes-pratiques--green-coding)
---

## Prérequis

- **Système d’exploitation** : Linux
- **Kernel** : interface `powercap` disponible  
  (en général accessible via `/sys/class/powercap`)
- **CPU** : support RAPL (Intel ou AMD)
- **Runtime** : Node.js (avec support des promesses / `async`/`await`)

---

```ts
import { raplProbe } from 'rapl-probe';

async function main() {
  const result = await raplProbe(); // /sys/class/powercap par défaut

  console.log('RAPL status:', result.status);
  if (result.hint) {
    console.log('Hint:', result.hint);
  }

  if (result.status === 'FAILED') {
    console.error('RAPL non disponible sur ce système.');
    process.exit(1);
  }

  console.log('Vendor principal:', result.vendor);

  for (const pkg of result.packages) {
    console.log('---');
    console.log(`Paquet : ${pkg.name} (${pkg.vendor})`);
    console.log(`Node   : ${pkg.node}`);
    console.log(`Path   : ${pkg.path}`);
    console.log(`Energy : ${pkg.hasEnergyReadable ? 'lisible' : 'non lisible'}`);

    if (!pkg.hasEnergyReadable && pkg.reason) {
      console.log(`Raison : ${pkg.reason}`);
    }

    if (pkg.maxEnergyUj != null) {
      console.log(`Max energy (µJ) : ${pkg.maxEnergyUj}`);
    }
  }
}

main().catch((err) => {
  console.error('Erreur inattendue lors de la sonde RAPL:', err);
  process.exit(1);
});
```

---


## API détaillée

`raplProbe(basePath?)`

```ts
raplProbe(basePath?: string): Promise<RaplProbeResult>
```

**Sonde la hiérarchie RAPL sous basePath (par défaut /sys/class/powercap) et
retourne un objet décrivant :**

- le statut global de la sonde,

- le constructeur principal détecté (Intel, AMD, inconnu),

- la liste des paquets RAPL trouvés.

**Paramètres**

- basePath (optionnel)

  - Chemin racine de la hiérarchie powercap à analyser.

  - Défaut : /sys/class/powercap

**Valeur de retour**

- La fonction retourne une promesse résolue avec un objet RaplProbeResult.

---

## Types retournés

Les types ci-dessous sont donnés en notation TypeScript pour documenter la
structure des objets. En JavaScript, tu obtiendras un simple objet JSON avec
ces champs.

```ts
type RaplStatus = 'OK' | 'DEGRADED' | 'FAILED';
type RaplVendor = 'intel' | 'amd' | 'unknown';

interface RaplPackageInfo {
  /**
   * Vendor déduit du nom du nœud (intel-rapl:* / amd-rapl:*).
   */
  vendor: RaplVendor;

  /**
   * Nom du répertoire sous basePath, par ex. "intel-rapl:0".
   */
  node: string;

  /**
   * Chemin absolu du répertoire du paquet,
   * par ex. "/sys/class/powercap/intel-rapl:0".
   */
  path: string;

  /**
   * Contenu du fichier "name", par ex. "package-0".
   */
  name: string;

  /**
   * Chemin réel résolu du fichier "energy_uj" (via realpath si possible),
   * sinon le chemin nominal.
   */
  energyPath: string;

  /**
   * Indique si le fichier "energy_uj" est lisible.
   */
  hasEnergyReadable: boolean;

  /**
   * Raison de l’échec de lecture de "energy_uj" (permissions, etc.),
   * ou null si la lecture fonctionne.
   */
  reason: string | null;

  /**
   * Valeur numérique de "max_energy_uj" (wrap du compteur en microjoules),
   * ou null si le fichier est absent, illisible, ou invalide.
   */
  maxEnergyUj: number | null;

  /**
   * Chemins bruts des fichiers utilisés pour lire les valeurs.
   */
  files: {
    energyUj: string;
    maxEnergyUj: string;
  };
}

interface RaplProbeResult {
  /**
   * Statut global de la sonde :
   *
   * - "OK"       : des paquets RAPL ont été trouvés et au moins un "energy_uj"
   *                est lisible ;
   * - "DEGRADED" : des paquets sont présents mais aucun "energy_uj"
   *                n’est lisible ;
   * - "FAILED"   : aucun paquet trouvé OU basePath inaccessible.
   */
  status: RaplStatus;

  /**
   * Vendor principal détecté :
   * - vendor d’un paquet lisible si possible,
   * - sinon vendor du premier paquet trouvé,
   * - ou "unknown" si indéterminé.
   *
   * Peut être absent en cas de "FAILED".
   */
  vendor?: RaplVendor;

  /**
   * Liste des paquets RAPL détectés (peut être vide si FAILED).
   */
  packages: RaplPackageInfo[];

  /**
   * Message d’aide au diagnostic (champs manquants, permissions, etc.).
   * Null ou non défini lorsque tout va bien.
   */
  hint?: string | null;
}
```

**Statuts**

- `OK`

  - Au moins un paquet RAPL détecté.

  - Au moins un fichier energy_uj lisible.

- `DEGRADED`

  - Des paquets RAPL ont été trouvés.

  - Mais aucun fichier energy_uj n’est lisible (souvent à cause des permissions).

- `FAILED`

  - Le répertoire basePath est introuvable ou inaccessible ou

  - Aucun paquet RAPL conforme (package-*) n’a été trouvé.

---

## Gestion des erreurs

La fonction ne lève pas d’exception pour les problèmes liés au système de fichiers :

- répertoire basePath manquant,

- fichiers name, energy_uj, max_energy_uj manquants,

- permissions insuffisantes,

- liens symboliques cassés, etc.

À la place :

- le champ status est positionné à FAILED ou DEGRADED,

- le champ hint fournit un message d’aide (facultatif),

les erreurs spécifiques à chaque paquet sont exposées dans :

- hasEnergyReadable,

- reason.

on peut donc intégrer raplProbe dans un service ou un export métrique sans
risque de faire crasher un process si RAPL n’est pas disponible.

---

## Bonnes pratiques & green coding

Quelques idées pour utiliser raplProbe de manière “green” :

1. Limiter la fréquence d’appel

- Inutile de scanner la hiérarchie sysfs des centaines de fois par seconde.

- Pour un monitoring énergétique, un intervalle de l’ordre de la seconde (voire plusieurs secondes) est souvent suffisant.

2. Mutualiser la découverte

- raplProbe fait une découverte des paquets (lecture de name, max_energy_uj, etc.).

- Si besoin de lire l’énergie très fréquemment:

  - appeler raplProbe() au démarrage pour découvrir les paquets,

  - ensuite lire directement les fichiers energy_uj (en utilisant les chemins fournis) dans une boucle plus fréquente.

1. Gérer proprement les permissions

- Si DEGRADED avec reason = “permission denied”,
c’est qu’il faut ajuster les droits plutôt que réessayer en boucle.

- Logguer le problème une fois, informer l’admin, puis espacer les tentatives.

4. Éviter les logs bruyants

- Comme les erreurs sont déjà encodées dans status / hint / reason,
éviter de spammer les logs à chaque appel lorsque la situation ne change pas.

