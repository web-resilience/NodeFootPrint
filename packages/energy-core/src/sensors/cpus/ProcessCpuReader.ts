import process from "node:process";
import { readFile } from "node:fs/promises";
import { extractErrorCode, reasonFromCode } from "@nodefootprint/shared";


interface ProcessCpuReaderOptions {
    log?: 'silent' | 'debug';
    pid?: number;
    statFilePath?: string;
}

interface ProcessCpuSample {
  ok: boolean;
  primed: boolean;
  pid: number;
  cpuTicks: {
    unit: "jiffies";
    deltaActive: bigint;
  };
}


interface ProcessStatSnapshot {
    ok: boolean,
    error?: string | null,
    timeStamp: string | null;
    pid: number | null;
    comm: string | null;
    state: string | null;
    ppid: number | null;
    utime: bigint | null;
    stime: bigint | null;
    cutime: bigint | null;
    cstime: bigint | null;
    starttime: bigint | null;
}

interface ProcessCpuReaderState {
    last_app_ticks: bigint | null;//utime + stime at last tick 
    last_start_time_ticks: bigint | null;//starttime of process at last tick
    primed: boolean;//fist read has been done
}

const STAT_FIELDS_NAME = [
    'pid', 'comm', 'state', 'ppid', 'pgrp', 'session', 'tty_nr', 'tpgid', 'flags',
    'minflt', 'cminflt', 'majflt', 'cmajflt', 'utime', 'stime', 'cutime', 'cstime',
    'priority', 'nice', 'num_threads', 'itrealvalue', 'starttime', 'vsize', 'rss',
    'rsslim', 'startcode', 'endcode', 'startstack', 'kstkesp', 'kstkeip', 'signal',
    'blocked', 'sigignore', 'sigcatch', 'wchan', 'nswap', 'cnswap', 'exit_signal',
    'processor', 'rt_priority', 'policy', 'delayacct_blkio_ticks', 'guest_time',
    'cguest_time', 'start_data', 'end_data', 'start_brk', 'arg_start', 'arg_end',
    'env_start', 'env_end', 'exit_code'
];

/**
 * check if a PID is valid
 * must exclusively be a non-negative integer
 * must exclude pid 0 (system idle process) and process.pid (current process)
 * @param pid 
 * @returns 
 */
export function pidIsValid(pid: number): boolean {
    if (pid < 0 || !Number.isInteger(pid) || pid === 0) {
        return false;
    }
    return true;
}

export async function parsePidStatFile(statFilePath: string): Promise<ProcessStatSnapshot> {
    try {
        let statContent = await readFile(statFilePath, { encoding: 'utf-8' });
        const firstParen = statContent.indexOf('(');
        const lastParen = statContent.lastIndexOf(')');
        if (firstParen === -1 || lastParen === -1 || lastParen <= firstParen) {
            throw new Error(`Malformed stat file content: ${statContent}`);
        }

        statContent = statContent.trim();

        const pid = Number(statContent.slice(0, firstParen - 1).trim());
        const comm = statContent.slice(firstParen + 1, lastParen);
        const rest = statContent.slice(lastParen + 1).trim().split(/\s+/);

        const pidStat: Record<string, string | number | bigint | undefined> = {
            pid,
            comm
        };

        const fields = STAT_FIELDS_NAME.slice(2); // skip 'pid' and 'comm' as they are already handled
        const values = rest;

        for (let i = 0; i < fields.length; i++) {
            const field = fields[i];
            const raw = values[i];
            if (i === 0) {
                // state is string
                pidStat[field] = raw ?? null;
            } else {
                const num = Number(raw);
                pidStat[field] = Math.abs(num) > Number.MAX_SAFE_INTEGER ? BigInt(raw) : num;
            }
        }
        const snapshot: ProcessStatSnapshot = {
            ok: true,
            error: null,
            timeStamp: new Date().toISOString(),
            pid: pid ?? null,
            comm: (pidStat.comm as string) ?? null,
            state: (pidStat.state as string) ?? null,
            ppid: typeof pidStat.ppid === 'number' ? (pidStat.ppid as number) : (pidStat.ppid == null ? null : Number(pidStat.ppid as string)),
            utime: pidStat.utime == null ? null : (typeof pidStat.utime === 'bigint' ? pidStat.utime as bigint : BigInt(Number(pidStat.utime))),
            stime: pidStat.stime == null ? null : (typeof pidStat.stime === 'bigint' ? pidStat.stime as bigint : BigInt(Number(pidStat.stime))),
            cutime: pidStat.cutime == null ? null : (typeof pidStat.cutime === 'bigint' ? pidStat.cutime as bigint : BigInt(Number(pidStat.cutime))),
            cstime: pidStat.cstime == null ? null : (typeof pidStat.cstime === 'bigint' ? pidStat.cstime as bigint : BigInt(Number(pidStat.cstime))),
            starttime: pidStat.starttime == null ? null : (typeof pidStat.starttime === 'bigint' ? pidStat.starttime as bigint : BigInt(Number(pidStat.starttime))),
        };

        return snapshot;
    } catch (error) {
        const code = extractErrorCode(error);
        return {
            ok: false,
            error: reasonFromCode(code),
            timeStamp: null,
            pid: null,
            comm: null,
            state: null,
            ppid: null,
            utime: null,
            stime: null,
            cutime: null,
            cstime: null,
            starttime: null
        } as ProcessStatSnapshot;
    }
}

export class ProcessCpuReader {
    log: 'silent' | 'debug';
    pid: number;
    statFilePath: string;
    state: ProcessCpuReaderState;

    constructor(options: ProcessCpuReaderOptions = {}) {
        this.log = options.log ?? 'silent';
        this.pid = options.pid ?? -1;
        if (!pidIsValid(this.pid)) {
            throw new Error(`Invalid PID: ${this.pid}`);
        }
        if (options.statFilePath) {
            const match = options.statFilePath.match(/\/proc\/(\d+)\/stat/);
            if (match) {
                const pidFromPath = Number(match[1]);
                if (pidFromPath !== this.pid) {
                    throw new Error(`PID from statFilePath (${pidFromPath}) does not match provided PID (${this.pid})`);
                }
            } else {
                throw new Error(`statFilePath does not match expected format: /proc/<pid>/stat`);
            }
        }
        this.statFilePath = options.statFilePath ?? `/proc/${this.pid}/stat`;

        this.state = {
            last_app_ticks: null,//utime + stime at last tick 
            last_start_time_ticks: null,//starttime of process at last tick
            primed: false//fist read has been done
        }
    }

    async sample(): Promise<ProcessCpuSample | { ok: false; error: string; }> {
        const pidStat = await parsePidStatFile(this.statFilePath);
        
        if(!pidStat.ok || pidStat.pid === null) {
            return {
                ok:false,
                error: pidStat.error ?? "pid_stat_read_failure",
            }
        }

        const { pid, utime, stime, starttime } = pidStat;

        const current_app_ticks = (utime ?? BigInt(0)) + (stime ?? BigInt(0));
        const current_start_time_ticks = starttime ?? BigInt(0);

        //first read/initialization
        if(!this.state.primed){
            this.state.last_app_ticks = current_app_ticks;
            this.state.last_start_time_ticks = current_start_time_ticks;
            this.state.primed = true;
            return {
                ok:true,
                primed:false,
                pid: Number(pid),
                cpuTicks: { unit:"jiffies",deltaActive: 0n },
            }
        }

        //process restart detected
        if(this.state.last_start_time_ticks !== null && current_start_time_ticks !== this.state.last_start_time_ticks){
            this.state.last_app_ticks = current_app_ticks;
            this.state.last_start_time_ticks = current_start_time_ticks;
            this.state.primed = false;
            //TODO log restart event?
            this.log === 'debug' && process.stdout.write(`ProcessCpuReader: Process restart detected for PID ${pid}\n`);
            return {
                ok:true,
                primed:false,
                pid: Number(pid),
                cpuTicks: { unit:"jiffies",deltaActive: 0n },
            }
        }
        
        let delta_active_ticks = current_app_ticks - (this.state.last_app_ticks ?? BigInt(0));

        if(delta_active_ticks < 0n) delta_active_ticks = 0n;

        this.state.last_app_ticks = current_app_ticks;

        return {
            ok:true,
            primed:this.state.primed,
            pid: Number(pid),
            cpuTicks: { unit:"jiffies", deltaActive: delta_active_ticks },
        };
    }
}