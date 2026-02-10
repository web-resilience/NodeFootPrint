export interface SlidingWindowOptions {
    windowSize: number; // number of samples to keep
}

export interface SlidingWindowInput {
   hostEnergyJoules:number;
   hostCpuActiveTicks: bigint;
   processCpuActiveTicks: bigint;
}

export interface SlidingWindowResult {
    ok: boolean;
    cpuShare?:number;
    processEnergyJoules?: number;
    samples?: number;
    reason?:string;
    windowCpuTicks?: {
        unit:string;
        hostActive:string;
        processActive: string;
    };
    windowEnergy?:{
        unit: string;
        hostJoules: number;
    }
    isActive?: boolean;
}


export class HostToPidSlidingWindow {
    private windowSize:number;
    private buffer: SlidingWindowInput[] = [];


    constructor(options:SlidingWindowOptions) {
        if(!Number.isFinite(options.windowSize) || options.windowSize <= 0) {
            throw new Error("Sliding window size must be a positive integer");
        }
        this.windowSize = options.windowSize ??  10;


    }

    push(sample:SlidingWindowInput): SlidingWindowResult {
        
        this.buffer.push(sample);

        if(this.buffer.length > this.windowSize) {
            this.buffer.shift();
        }

        //accumulate values

        let sumEnergyJoules = 0;
        let sumHostCpuActiveTicks = 0n;
        let sumProcessCpuActiveTicks = 0n;

        for(const entry of this.buffer) {
            sumEnergyJoules += entry.hostEnergyJoules;
            sumHostCpuActiveTicks += entry.hostCpuActiveTicks;
            sumProcessCpuActiveTicks += entry.processCpuActiveTicks;
        }

        if(sumHostCpuActiveTicks === 0n) {
            return {
                ok:false,
                reason:"no_host_cpu_activity",
                samples: this.buffer.length
            }
        }
        const cpuShare = Number(sumProcessCpuActiveTicks) / Number(sumHostCpuActiveTicks);
        const safeCpuShare = cpuShare < 0 ? 0 : cpuShare > 1 ? 1 : cpuShare; //clamp between 0 and 1
        const processEnergyJoules = sumEnergyJoules * safeCpuShare;
        return {
            ok:true,
            cpuShare: safeCpuShare,
            processEnergyJoules,
            samples: this.buffer.length,
            windowCpuTicks: {
                unit:"jiffies",
                hostActive: sumHostCpuActiveTicks.toString(),
                processActive: sumProcessCpuActiveTicks.toString()
            },
            windowEnergy: {
                unit: "joules",
                hostJoules: sumEnergyJoules
            },
            isActive: sumProcessCpuActiveTicks > 0n      
        }

    }
}
    