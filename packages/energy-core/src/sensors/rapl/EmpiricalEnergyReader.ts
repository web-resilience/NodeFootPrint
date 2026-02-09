import { CpuReader } from "../cpus/CpuReader";
import { RaplSample } from "./RaplReader.js";


// P_estimate_j = (P_idle + (P_max - p_idle) * load) * durationS

export interface EmpiricalEnergyReaderOptions {
    //recomanded mode
    pidleWatts?: number;
    pmaxWatts?: number;

    //TDP mode 
    tdpWatts?: number;
    /**
     * CPU TDP in Watts (approx)
     * idleFraction = 0.20 => p_idle =  0.20  * tdp
     * maxFraction = 1.00 => P_max = 1.00 * tdp
     */

    idleFraction?: number;//default 0.07
    maxFraction?: number; //0.55 as default

    statFilePath?: string;

    log?: "silent" | "debug"
}


function isPositive(n: any): n is number {
    return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function clamp01(x: number) {
    if (!Number.isFinite(x)) return 0;
    if (x < 0) return 0;
    if (x > 1) return 1;
    return x;
}


export class EmpiricalEnergyReader {
    public readonly mode = 'fallback';
    public cpuReader: CpuReader;

    public isReady = true;
    public status: string | null = "FALLBACK_ESTIMATE";
    public hint: string | null = null;

    private pidleWatts?: number;
    private pmaxWatts?: number;

    private tdpWatts?: number;
    private idleFraction: number;
    private maxFraction: number;


    constructor(options: EmpiricalEnergyReaderOptions) {
        const {
            pidleWatts,
            pmaxWatts,
            tdpWatts,
            idleFraction = 0.07,
            maxFraction = 0.55,
            statFilePath,
            log = "silent"
        } = options;

        this.pidleWatts = pidleWatts;
        this.pmaxWatts = pmaxWatts;

        this.tdpWatts = tdpWatts;
        this.idleFraction = idleFraction;
        this.maxFraction = maxFraction;

        const hasWatts = isPositive(pidleWatts) && isPositive(pmaxWatts);
        const hasTdp = isPositive(tdpWatts);

        if (hasWatts) {
            if (pmaxWatts < pidleWatts) {
                this.isReady = false;
                this.status = "INVALID_FALLBACK_WATTS";
                this.hint = "pmaxWatts must be >= pidleWatts";
            } else {
                this.hint = `empirical watts: P_idle=${pidleWatts}W P_max=${pmaxWatts}W`;
            }

        } else if (hasTdp) {
            this.hint = `empirical tdp: TDP=${tdpWatts}W (idle=${idleFraction}, max=${maxFraction})`;
        } else {
            this.isReady = false;
            this.status = "MISSING_FALLBACK_PARAMS";
            this.hint = "Provide --pidle-w/--pmax-w (recommended) or --tdp for fallback mode";
        }

        this.cpuReader = new CpuReader({
            statFilePath: statFilePath ?? '/proc/stat',
            log
        });
    }


    async sample(nowNs: bigint): Promise<RaplSample | null> {
        if (!this.isReady) return null;

        const cpuStat = await this.cpuReader.sample(nowNs);

        if (!cpuStat || cpuStat.ok === false) {
            return {
                ok: false,
                primed: true,
                internalClampedDt: 0,
                deltaJ: 0,
                deltaUj: 0,
                packages: [],
                wraps: 0
            }
        }

        if (!cpuStat.primed) {
            return {
                ok: true,
                primed: false,
                internalClampedDt: 0,
                deltaJ: 0,
                deltaUj: 0,
                packages: [],
                wraps: 0
            }
        }
        //TODO clampe value
        const cpuLoad = cpuStat.cpuUtilization ?? 0;
        const dt = cpuStat.internalClampedDt;

        let pIdle: number;
        let pMax: number;

        if (isPositive(this.pidleWatts) && isPositive(this.pmaxWatts)) {
            pIdle = this.pidleWatts;
            pMax = this.pmaxWatts;
        } else {
            //tDP mode
            const tdp = this.tdpWatts ?? 0;
            pIdle = tdp * this.idleFraction;
            pMax = tdp * this.maxFraction;
        }

        const powerW = pIdle + (pMax - pIdle) * cpuLoad;
        const deltaJ = powerW * dt;
        const deltaUj = deltaJ * 1e6;

        return {
            ok: true,
            primed: true,
            internalClampedDt: dt,
            deltaUj,
            deltaJ,
            packages: [],
            wraps: 0,
        }
    }

}