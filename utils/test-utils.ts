import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';

export function nowNs(n:number): bigint {
    return BigInt(Math.round(n * 1e9));
}

export async function createRaplPackages(baseDir:string, nodeName:string, { name = 'package-0', energy = 0n, maxRange = 0n } = {}) {
    const pkgDir = join(baseDir, nodeName);
    await mkdir(pkgDir, { recursive: true });

    const namePath = join(pkgDir, 'name');
    const energyPath = join(pkgDir, 'energy_uj');
    const maxRangePath = join(pkgDir, 'max_energy_uj');

    await Promise.all([
        writeFile(namePath, name, 'utf8'),
        writeFile(energyPath, String(energy), 'utf8'),
        maxRange > 0n ? writeFile(maxRangePath, String(maxRange), 'utf8') : null
    ]);

    return { dir: pkgDir, files: { namePath, energyPath, maxRangePath } };
}
