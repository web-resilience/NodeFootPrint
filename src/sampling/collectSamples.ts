import { CpuReader } from "../sensors/cpus/CpuReader.js";
import { ProcessCpuReader } from "../sensors/cpus/ProcessCpuReader.js";
import { EnergyReader } from "../sensors/rapl/enregyReader.js";

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

export async function collectSamples(samplers: Samplers, nowNs: bigint): Promise<Samples> {
    const { energyReader, cpuReader, processCpuReader } = samplers;
    const [ energy, cpu, processCpu ] = await Promise.all(
        [
            energyReader ? energyReader.sample(nowNs) : Promise.resolve(null),
            cpuReader ? cpuReader.sample(nowNs) : Promise.resolve(null),
            processCpuReader ? processCpuReader.sample() : Promise.resolve(null)

        ]
    );

    return { energy,cpu, processCpu};
}