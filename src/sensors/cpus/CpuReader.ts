import { readFile } from "node:fs/promises";
import { clampDt } from "../rapl/RaplReader.js";

interface CpuReaderOptions {
    log?: 'silent' | 'debug';
}

export interface CpuSample {
    ok: boolean;
    primed: boolean;
    deltaTimeTs: number;
    cpuUtilization: number;//between 0 and 1
    deltaTotalTicks:bigint
}

interface CpuReaderState {
    lastNs: bigint | null;
    lastTotal: bigint | null;
    lastIdle: bigint | null;
}

interface ProcStatSnapshot {
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


async function parseProcStat() {
    try {
        const statFile = await readFile('/proc/stat', 'utf-8');
        const lines = statFile.split('\n');

        const statSnapshot: ProcStatSnapshot = { timeStamp: null, aggregate: null, perCpu: [] };

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

        statSnapshot.timeStamp = new Date().toISOString();
        return statSnapshot;
    } catch (error) {
        return null;
    }
}

async function computeCpuUtilization() {
    const snapshot = (await parseProcStat())?.aggregate;
    if (!snapshot) {
        return null;
    }
    const idle = snapshot.idle + snapshot.iowait;
    const active = snapshot.user + snapshot.nice + snapshot.system + snapshot.irq + snapshot.softirq + snapshot.steal;
    return { idle, active, total: idle + active };
}

export class CpuReader {
    private state: CpuReaderState;
    private log: 'silent' | 'debug';

    constructor(options: CpuReaderOptions) {
        this.log = options.log ?? 'silent';
        this.state = {
            lastNs: null,
            lastTotal: null,
            lastIdle: null,
        };
    }

    async sample(nowNs: bigint): Promise<CpuSample> {

        const totals = await computeCpuUtilization();
        if (!totals) {
            return {
                ok: false,
                primed: false,
                deltaTimeTs: 0,
                cpuUtilization: 0,
                deltaTotalTicks:0n
            };
        }

        const { idle, total } = totals;
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