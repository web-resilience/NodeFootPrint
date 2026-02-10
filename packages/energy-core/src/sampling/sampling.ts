import { CpuReader } from "../index";
import { ProcessCpuReader } from "../index";
import { EnergyReader, EnergyReaderFactoryOptions, createEnergyReader } from "../index";
import { raplProbe } from "../index";


export interface Samplers {
    energyReader?: EnergyReader;
    cpuReader?: CpuReader;
    processCpuReader?: ProcessCpuReader;
};

export interface Samples {
    energy: Awaited<ReturnType<EnergyReader["sample"]>> | null;
    cpu: Awaited<ReturnType<CpuReader["sample"]>> | null;
    processCpu: Awaited<ReturnType<ProcessCpuReader["sample"]>> | null;
}

type FallBackOptions = EnergyReaderFactoryOptions["fallback"];

export async function createSamplers(pid: number, fallbackOptions: FallBackOptions) {
    const probe = await raplProbe();
    const fb = fallbackOptions;
    return {
        energyReader: createEnergyReader({
            probe,
            fallback: {
                tdpWatts: Number.isFinite(fb?.tdpWatts as any) ? fb?.tdpWatts : undefined,
                pidleWatts: Number.isFinite(fb?.pidleWatts as any) ? fb?.pidleWatts : undefined,
                pmaxWatts: Number.isFinite(fb?.pmaxWatts as any) ? fb?.pmaxWatts : undefined,
            }
        }),
        cpuReader: new CpuReader({}),
        processCpuReader: new ProcessCpuReader({ pid }),
    };
}

export async function collectSamples(samplers: Samplers, nowNs: bigint): Promise<Samples> {
    const { energyReader, cpuReader, processCpuReader } = samplers;
    const [energy, cpu, processCpu] = await Promise.all(
        [
            energyReader ? energyReader.sample(nowNs) : Promise.resolve(null),
            cpuReader ? cpuReader.sample(nowNs) : Promise.resolve(null),
            processCpuReader ? processCpuReader.sample() : Promise.resolve(null)

        ]
    );

    return { energy, cpu, processCpu };
}