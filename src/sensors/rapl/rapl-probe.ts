import fs from "node:fs/promises";
import { Dirent } from "node:fs";
import path from "node:path";
import { accessReadable } from "../../../utils/file-utils.js";


const DEFAULT_BASE_PATH = '/sys/class/powercap';



export async function raplProbe(basePath: string = DEFAULT_BASE_PATH) {

    let dirEntries: Dirent[] | null;

    try {
        dirEntries = await fs.readdir(basePath, { withFileTypes: true });
    } catch (error) {
        dirEntries = null;
    }

    if (!dirEntries) {
        return { status: 'FAILED',packages:[], hint: `${basePath} not found` };
    }

    const packages = [];

    for (const entry of dirEntries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) {
            continue;
        }

        const dirname = entry.name;

        const packagePath = path.join(basePath, dirname);
        const namePath = path.join(packagePath, 'name');
        const energyPath = path.join(packagePath, 'energy_uj');
        const maxEnergyPath = path.join(packagePath, 'max_energy_uj');

        let name;

        try {
            name = (await fs.readFile(namePath, 'utf-8')).trim();
        } catch (error) {
            continue;
        }

        if (!name.includes('package-')) {
            continue;
        }

        const [readable, maxEnergyRangeReadable] = await Promise.all([
            accessReadable(energyPath),
            fs.readFile(maxEnergyPath, 'utf-8').catch(() => null)
        ]);

        let maxEnergyUj = null;
        if (maxEnergyRangeReadable) {
            const maxEnergyValue = Number(String(maxEnergyRangeReadable).trim());
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
    const vendor = packages.find(p => p.hasEnergyReadable)?.vendor || packages[0].vendor;
    const status = anyReadable ? 'OK' : 'DEGRADED';
    const hint = anyReadable ? null : 'RAPL energy_uj files are not readable (permission denied ?)';

    return {
        status,
        vendor,
        packages,
        hint
    };

}