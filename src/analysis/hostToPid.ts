export interface HostToPidAttributionInput {
    hostEnergyJoules: number;
    hostCpuActiveTicks: bigint;
    processCpuActiveTicks: bigint;
}

export interface HostToPidAttributionResult {
    ok: boolean;
    reason?: string;
    cpuShare?:number;
    processEnergyJoules?: number;
}

export function attributeHostEnergyToPid(input: HostToPidAttributionInput): HostToPidAttributionResult {
    const { hostEnergyJoules, hostCpuActiveTicks, processCpuActiveTicks } = input;
    if(!Number.isFinite(hostEnergyJoules) || hostEnergyJoules < 0) {
        return {
            ok:false,
            reason:"invalid_host_energy"
        }
    }

    if(hostCpuActiveTicks <= 0n) {
        return {
            ok:false,
            reason:"no_host_cpu_activity"
        }
    }
    if(processCpuActiveTicks < 0n) {
        return {
            ok:false,
            reason:"invalid_process_cpu_activity"
        }
    }

    const cpuShare = Number(processCpuActiveTicks) / Number(hostCpuActiveTicks);
    const safeCpuShare = Math.min(Math.max(cpuShare,0),1); //clamp between 0 and 1
    const processEnergyJoules = hostEnergyJoules * safeCpuShare;

    return {
        ok:true,
        cpuShare:safeCpuShare,
        processEnergyJoules
    }
}