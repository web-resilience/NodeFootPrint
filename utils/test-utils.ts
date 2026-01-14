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


export async function createStatFileUnderControl (baseDir:string,stats:{user:number,nice:number,system:number,idle:number}) {
    const _stats = {
        user:stats.user ?? 1000, 
        nice:0,
        system:500,
        idle:2000
    };

    const { user, nice,system,idle} = _stats;

    const statPath = join(baseDir,`stat-${process.pid}`);

    const cpuLine = `cpu ${user} ${nice} ${system} ${idle} 0 0 0 0 0 0\n`;
    const content = cpuLine + `cpu0 ${user} ${nice} ${system} ${idle} 0 0 0 0 0 0\n`;

    try {
        await writeFile(statPath,content,'utf-8');
        return statPath;
    } catch (error) {
        if(error instanceof Error || (error && typeof error === 'object' && 'message' in error)) {
            console.error(error.message);
        } else {
            console.error(String(error));
        }
    }
    
}

export function generateStatSample({ pid, utime, stime, starttime, delay, hz = 100 }: { pid: number; utime: number; stime: number; starttime: number; delay: number; hz?: number }) {
    const delta_ticks = Math.round(delay * hz);
    const new_utime = utime + Math.floor(delta_ticks / 2);
    const new_stime = stime + Math.ceil(delta_ticks / 2);

    const fields = [
        pid, '(node)', 'S', 52710, 52711, 52710, 34819, 52711, 4194560,
        18391, 0, 1, 0,
        new_utime, new_stime, 0, 0, 20, 0, 11, 0,
        starttime, 1278586880, 17245, '18446744073709551615', 1, 1, 0, 0, 0, 0, 0,
        16781312, 134235650, 0, 0, 0, 17, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    ];

    return fields.join(' ');
}
