import { readFile } from "node:fs/promises";
import { clampDt } from "../rapl/RaplReader.js";
import { accessReadable, extractErrorCode, reasonFromCode } from "../../../utils/file-utils.js";

interface CpuReaderOptions {
    log?: 'silent' | 'debug';
    statFilePath?:string;
}

export interface CpuSample {
    ok: boolean;
    primed: boolean;
    deltaTimeTs: number;
    cpuUtilization: number;//between 0 and 1
    deltaTotalTicks:bigint
}

interface CpuSampleError {
    ok:false;
    error:string
}

interface CpuReaderState {
    lastNs: bigint | null;
    lastTotal: bigint | null;
    lastIdle: bigint | null;
}

interface ProcStatSnapshot {
    ok:boolean,
    error?:string | null,
    timeStamp: string | null;
    aggregate: {
        user: bigint;
        nice: bigint;
        system: bigint;
        idle: bigint;
        iowait: bigint;
        irq: bigint;
        softirq: bigint;
        steal: bigint;
    } | null;
    perCpu: Array<{
        user: bigint;
        nice: bigint;
        system: bigint;
        idle: bigint;
        iowait: bigint;
        irq: bigint;
        softirq: bigint;
        steal: bigint;
    }>;
}

interface CpuTotal {
    idle: bigint,
    active: bigint,
    total: bigint
}



export async function parseProcStat(file:string = '/proc/stat') {
    const _file  = file ?? '/proc/stat';
    try {
        const statFile = await readFile(_file, 'utf-8');
        const lines = statFile.split('\n');

        const statSnapshot: ProcStatSnapshot = { ok:false,timeStamp: null, aggregate: null, perCpu: [] };

        for (const line of lines) {
            if (!line.startsWith('cpu')) continue;
            const parts = line.trim().split(/\s+/);
            // cpu user nice system idle iowait irq softirq steal guest guest_nice
            if (parts.length < 5) continue;
            const user = BigInt(parts[1] || '0');
            const nice = BigInt(parts[2] || '0');
            const system = BigInt(parts[3] || '0');
            const idle = BigInt(parts[4] || '0');
            const iowait = BigInt(parts[5] || '0');
            const irq = BigInt(parts[6] || '0');
            const softirq = BigInt(parts[7] || '0');
            const steal = BigInt(parts[8] || '0');
            // Determine if aggregate or per-cpu
            if (line.startsWith('cpu ')) {
                statSnapshot.aggregate = { user, nice, system, idle, iowait, irq, softirq, steal };
            } else {
                statSnapshot.perCpu.push({ user, nice, system, idle, iowait, irq, softirq, steal });
            }
        }
        // si fichier vide ou invalide
        if(!statSnapshot.aggregate && !statSnapshot.perCpu.length) {
           return { ok:false,error:'invalid_file_content',aggregate:null };
        } 
        statSnapshot.timeStamp = new Date().toISOString();
        statSnapshot.ok = true;
        return statSnapshot;
    } catch (error) {
        const code = extractErrorCode(error);
        return { ok:false,error:reasonFromCode(code) ?? 'error_accessing_file',aggregate:null}; 
    }
}

export async function computeCpuUtilization(snapshot:ProcStatSnapshot['aggregate']) {
    const _snapshot = snapshot ?? {
        user:BigInt(0),
        iowait:BigInt(0),
        idle:BigInt(0),
        nice:BigInt(0),
        system:BigInt(0),
        irq:BigInt(0),
        softirq:BigInt(0),
        steal:BigInt(0)
    };
    const idle = _snapshot.idle + _snapshot.iowait;
    const active = _snapshot.user + _snapshot.nice + _snapshot.system + _snapshot.irq + _snapshot.softirq + _snapshot.steal;
    return { idle, active, total: idle + active };
}

export class CpuReader {
    private state: CpuReaderState;
    private log: 'silent' | 'debug';
    private statFilePath:string;

    constructor(options: CpuReaderOptions) {
        this.log = options.log ?? 'silent';
        this.statFilePath = options.statFilePath ?? '/proc/stat';
        this.state = {
            lastNs: null,
            lastTotal: null,
            lastIdle: null,
        };
    }

    async sample(nowNs: bigint): Promise<CpuSample | CpuSampleError> {
        const snapshot = await parseProcStat(this.statFilePath);
        if(snapshot.error) {
            //techniquement erreur
            return {ok:false,error:String(snapshot.error)};
        }
       const aggregate = snapshot?.aggregate;
        const stats = await computeCpuUtilization(aggregate);
        if(this.log === "debug") {
            process.stdout.write(`CPU stats idle:${stats.idle} active:${stats.active}, total:${stats.total}\n`);
        }
        const { idle, total } = stats;
        const state = this.state;
        // --- 1) Première mesure : priming ---
        if (state.lastNs === null || state.lastTotal === null || state.lastIdle === null) {
            state.lastNs = nowNs;
            state.lastTotal = total;
            state.lastIdle = idle;

            // primed = false :  pas encore de delta exploitable
            return {
                ok: true,
                primed: false,
                deltaTimeTs: 0,
                cpuUtilization: 0,
                deltaTotalTicks:0n
            };
        }

        // --- 2) Mesures suivantes : vrais deltas ---

        // log debug
        if (this.log === "debug" && process.stdout.isTTY) {
            process.stdout.write(`CPU sample at ${nowNs.toString()} ns\r`);
            
        }

        const deltaNs = nowNs - state.lastNs;
        const deltaTotal = total - state.lastTotal;
        const deltaIdle = idle - state.lastIdle;

        state.lastNs = nowNs;
        state.lastTotal = total;
        state.lastIdle = idle;

        let deltaTimeTs = Number(deltaNs) / 1e9;
        deltaTimeTs = clampDt(deltaTimeTs);

        let cpuUtilization = 0;

        if (deltaTotal > 0n){
            cpuUtilization =
                Number(deltaTotal - deltaIdle) / Number(deltaTotal);
            if (cpuUtilization < 0) cpuUtilization = 0;
            if (cpuUtilization > 1) cpuUtilization = 1;
        }

        const deltaTotalTicks = deltaTotal > 0n ? deltaTotal :0n;

        return { ok: true, primed: true, deltaTimeTs, cpuUtilization,deltaTotalTicks}
    }

}