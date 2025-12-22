import { RaplReader, RaplReaderOptions, RaplSample } from "./RaplReader.js";

export interface EnergyReader {
    isReady: boolean;
    status: string | null;
    hint: string | null;
    sample(nowNs: bigint): Promise<RaplSample | null>;
}


export function createEnergyReader(options:RaplReaderOptions):EnergyReader {
    const rapleReader = new RaplReader(options);

    if(!rapleReader.isReady) {
        console.warn('RAPL not available, falling back to empirical estimation');
        const energyReader = {
            isReady:false,
            status:'NOT_IMPLEMENTED_YET',
            hint:null,
            sample: async(nowNs:bigint) => null
        }
        return energyReader;
    }

    return rapleReader;
}