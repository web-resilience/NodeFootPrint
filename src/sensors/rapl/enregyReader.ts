import { EmpiricalEnergyReader } from "./EmpiricalEnergyReader.js";
import { RaplProbeResult } from "./rapl-probe.js";
import { RaplReader, RaplReaderOptions, RaplSample } from "./RaplReader.js";

export interface EnergyReader {
    isReady: boolean;
    status: string | null;
    hint: string | null;
    sample(nowNs: bigint): Promise<RaplSample | null>;
}

export interface EnergyReaderFactoryOptions {
    probe?:RaplProbeResult;
    log?:"silent" | "debug";
    tdpWatts?:number;
    idleFraction?:number;
    maxFraction?:number;

}


export function createEnergyReader(options:EnergyReaderFactoryOptions):EnergyReader {
    const {
        probe,
        log,
        tdpWatts,
        idleFraction,
        maxFraction
    } = options;

    const rapleReader = new RaplReader({ probe,log });

    if(!rapleReader.isReady) {
        console.warn('RAPL not available, falling back to empirical estimation');
        const energyReader = new EmpiricalEnergyReader({
            tdpWatts:tdpWatts ?? 45,
            idleFraction:idleFraction ?? 0.2,
            maxFraction: maxFraction ?? 1.0,
            log
        });
        return energyReader;
    }

    return rapleReader;
}