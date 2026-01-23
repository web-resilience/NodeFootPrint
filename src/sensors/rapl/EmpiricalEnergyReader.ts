import { CpuReader } from "../cpus/CpuReader.js";
import { RaplSample } from "./RaplReader.js";


// P_estimate_j = (P_idle + (P_max - p_idle) * load) * durationS

export interface EmpiricalEnergyReaderOptions {
    tdpWatts: number;
    /**
     * CPU TDP in Watts (approx)
     * idleFraction = 0.20 => p_idle =  0.20  * tdp
     * maxFraction = 1.00 => P_max = 1.00 * tdp
     */

    idleFraction?: number;
    maxFraction?: number;

    statFilePath?: string;

    log?: "silent" | "debug"
}


export class EmpiricalEnergyReader {
    public cpuReader: CpuReader;

    public isReady = true;
    public status: string | null = "FALLBACK_ESTIMATE";
    public hint: string | null = null;

    private tdpWatts: number;
    private idleFraction: number;
    private maxFraction: number;


    constructor(options: EmpiricalEnergyReaderOptions) {
        const {
            tdpWatts,
            idleFraction = 0.2,
            maxFraction = 1.00,
            statFilePath,
            log = "silent"
        } = options;

        this.tdpWatts = tdpWatts;
        this.idleFraction = idleFraction;
        this.maxFraction = maxFraction;

        if (!Number.isFinite(tdpWatts) || tdpWatts <= 0) {
            this.isReady = false;
            this.status = "invalid_tdp";
            this.hint = "tdpwatts must be a positive number to use empirical fallback";
        } else {
            this.hint = `empirical model:P_idle=${idleFraction}*TDP, P_max=${maxFraction}*TDP`
        }

        this.cpuReader = new CpuReader({
            statFilePath: statFilePath ?? '/proc/stat',
            log
        })
    }


    async sample(nowNs: bigint): Promise<RaplSample | null> {
        if (!this.isReady) return null;

        const cpuStat = await this.cpuReader.sample(nowNs);

        if(!cpuStat || cpuStat.ok === false) {
            return {
                ok:false,
                primed:true,
                internalClampedDt:0,
                deltaJ:0,
                deltaUj:0,
                packages:[],
                wraps:0
            }
        }

         if(!cpuStat.primed) {
            return {
                ok:true,
                primed:false,
                internalClampedDt:0,
                deltaJ:0,
                deltaUj:0,
                packages:[],
                wraps:0
            }
        }
        //TODO clampe value
        const cpuLoad = cpuStat.cpuUtilization ?? 0;
        const dt = cpuStat.internalClampedDt;

        const pIdle = this.tdpWatts * this.idleFraction;
        const pMax = this. tdpWatts * this.maxFraction;

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