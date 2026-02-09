import { EmpiricalEnergyReader, EmpiricalEnergyReaderOptions } from "./EmpiricalEnergyReader.js";
import { RaplReader, RaplReaderOptions, RaplSample } from "./RaplReader.js";

export interface EnergyReader {
    isReady: boolean;
    status: string | null;
    hint: string | null;
    mode:'rapl' | 'fallback';
    sample(nowNs: bigint): Promise<RaplSample | null>;
}

export type EnergyReaderFactoryOptions = RaplReaderOptions & {
    fallback?: Partial<EmpiricalEnergyReaderOptions>;
};


export function createEnergyReader(options: EnergyReaderFactoryOptions): EnergyReader {

    const probe = options?.probe;
    const log = options?.log;

    const raplReader = new RaplReader({ probe, log });

    if (raplReader.isReady) {
        return raplReader;
    }

    console.warn('RAPL not available, falling back to empirical estimation');

    const fb = options.fallback ?? {};
    
    const energyReader = new EmpiricalEnergyReader({
        pidleWatts: fb.pidleWatts,
        pmaxWatts: fb.pmaxWatts,
        tdpWatts: fb.tdpWatts,
        idleFraction: fb.idleFraction ?? 0.07,
        maxFraction: fb.maxFraction ?? 0.55,
        statFilePath: fb.statFilePath,
        log: fb.log ?? "silent"
    });
    return energyReader;
}