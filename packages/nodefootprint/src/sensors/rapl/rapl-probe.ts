import fs from "node:fs/promises";
import { Dirent } from "node:fs";
import path from "node:path";
import { accessReadable } from "../../../utils/file-utils.js";


type RaplStatus = 'OK' | 'DEGRADED' | 'FAILED';
type RaplVendor = 'intel' | 'amd' | 'unknown';

export interface RaplPackageInfo {
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

export interface RaplProbeResult {
  status: RaplStatus;
  vendor?: RaplVendor;
  packages: RaplPackageInfo[];
  hint?: string | null;
}


const DEFAULT_BASE_PATH = '/sys/class/powercap';


/**
 * Probes the RAPL (Running Average Power Limit) interface exposed by the Linux kernel
 * via the sysfs `powercap` hierarchy and returns a description of detected CPU packages.
 *
 * The function inspects the `basePath` directory (default `/sys/class/powercap`),
 * iterates through its subdirectories, and selects those whose `name` file contains
 * the substring `"package-"`. For each RAPL package found, it attempts to retrieve:
 *
 * - the cumulative energy counter `energy_uj` (in microjoules);
 * - the wrap value of the counter `max_energy_uj`, if available;
 * - the real path of the `energy_uj` file (via `realpath`, if possible).
 *
 * Filesystem errors (missing directory, permissions, missing files, etc.) are **caught**
 * and reflected in the return structure: the function never throws and always returns
 * a result object.
 *
 * ### Returned status
 *
 * The `status` field of the result can take the following values:
 *
 * - `"OK"`:
 *   - at least one RAPL package was detected;
 *   - at least one `energy_uj` file is readable.
 *
 * - `"DEGRADED"`:
 *   - RAPL packages were detected;
 *   - **no** `energy_uj` file is readable (e.g., insufficient permissions).
 *
 * - `"FAILED"`:
 *   - no RAPL package was found in `basePath` **or**
 *   - the `basePath` directory is inaccessible or does not exist.
 *
 * In `"DEGRADED"` or `"FAILED"` cases, the `hint` field provides a textual message
 * to help with diagnostics (missing path, no packages, permission issues, etc.).
 *
 * ### Result structure
 *
 * The returned object contains at least:
 *
 * - `status`: `"OK" | "DEGRADED" | "FAILED"`.
 * - `packages`: array of objects describing detected RAPL packages
 *   (possibly empty if `status === "FAILED"`).
 * - `hint`: explanatory string or `null`/undefined when all is well.
 * - `vendor`: the main vendor deduced from the packages, if known:
 *   - `"intel"` if a readable `intel-rapl:*` package is found,
 *   - `"amd"` if a readable `amd-rapl:*` package is found,
 *   - `"unknown"` otherwise.
 *
 * Each entry in the `packages` array has the following fields:
 *
 * - `vendor`: `"intel" | "amd" | "unknown"` — deduced from the node name
 *   (prefix `intel-rapl` or `amd-rapl`).
 * - `node`: directory name under `basePath` (e.g., `"intel-rapl:0"`).
 * - `path`: absolute path to the package directory (e.g.,
 *   `"/sys/class/powercap/intel-rapl:0"`).
 * - `name`: content of the `name` file (e.g., `"package-0"`).
 * - `energyPath`: resolved real path of `energy_uj` if possible, otherwise
 *   the nominal path.
 * - `hasEnergyReadable`: `true` if `energy_uj` is readable, `false` otherwise.
 * - `reason`: associated error message (e.g., permission denied),
 *   or `null` if `hasEnergyReadable === true`.
 * - `maxEnergyUj`: numeric value of `max_energy_uj` (counter wrap in microjoules),
 *   or `null` if the file is missing, unreadable, or invalid.
 * - `files`:
 *   - `files.energyUj`: path used to read `energy_uj`
 *     (often identical to `energyPath`),
 *   - `files.maxEnergyUj`: path to the `max_energy_uj` file.
 *
 * ### Typical usage
 *
 * ```ts
 * const result = await raplProbe();
 *
 * if (result.status === 'OK' || result.status === 'DEGRADED') {
 *   for (const pkg of result.packages) {
 *     console.log(
 *       `Package ${pkg.name} (${pkg.vendor}) at ${pkg.path}, readable:`,
 *       pkg.hasEnergyReadable
 *     );
 *   }
 * } else {
 *   console.warn('RAPL not available:', result.hint);
 * }
 * ```
 *
 * @param basePath
 *   Root path of the powercap hierarchy to probe. Defaults to `/sys/class/powercap`.
 *   Can be overridden for testing (fake sysfs, chroot, etc.).
 *
 * @returns
 *   A promise resolved with an object describing the overall status,
 *   detected RAPL packages, and diagnostic hints (`hint`).
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