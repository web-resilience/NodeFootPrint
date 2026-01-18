import { collectSamples } from "../sampling/collectSamples.js";
import { AuditAccumulator } from "./AuditAccumulator.js";
import { fixedRateTicks } from "../timer/scheduler.js";
import { NS_PER_MS, nowNs } from "../timer/timing.js";


function nsToMs(ns: bigint): number {
    return Number(ns) / Number(NS_PER_MS);
}

const JOULES_PER_KWH = 3_600_000;

interface AuditOptions {
    pid: number;
    durationSeconds: number;
    tickMs?: number;

    samplers: {
        energyReader?: any;
        cpuReader?: any;
        processCpuReader?: any;
    };

    emissionFactor_gCO2ePerKWh: number;
    debugTiming: boolean;

    signal?:AbortSignal
}

interface AuditResult {
    pid: number;
    durationSeconds: number;

    hostCpuEnergyJoules: number;
    processCpuEnergyJoules: number;
    processCpuEnergyShare: number;

    hostCpuCarbon_gCO2e:number;
    processCpuCarbon_gCO2e: number;
    isActive: boolean;
}

export async function audit(options: AuditOptions):Promise<AuditResult> {
    const {
        pid,
        durationSeconds,
        tickMs = 1000,
        samplers,
        emissionFactor_gCO2ePerKWh,
        debugTiming = false,
    } = options;

    const startTimeNs = process.hrtime.bigint();
    const endTimeNsTarget = startTimeNs + BigInt(Math.floor(durationSeconds * 1e9));

    const accumulator = new AuditAccumulator(startTimeNs);

    for await (const tick of fixedRateTicks({
        periodMs: tickMs,
        overrunPolicy: "coalesce",
        t0Ns: startTimeNs
    })) {

        // condition fin de loop 
        if(options.signal?.aborted) break;
        if (tick.startNs >= endTimeNsTarget) break;

        const workStartNs = nowNs();//pour debug durée travail 

        const samples = await collectSamples(samplers, tick.startNs);

        accumulator.push({
            hostCpuEnergyJoules:
                samples.energy && samples.energy.ok && samples.energy.primed
                    ? samples.energy.deltaJ
                    : undefined,

            hostCpuActiveTicks:
                samples.cpu && samples.cpu.ok && samples.cpu.primed
                    ? samples.cpu.cpuTicks.deltaActiveTicks
                    : undefined,

            processCpuActiveTicks:
                samples.processCpu && samples.processCpu.ok
                    ? samples.processCpu.cpuTicks.deltaActive
                    : undefined,
        });

        const workEndNs = nowNs();
        const workNs = workEndNs - workStartNs;

        if (debugTiming) {
            const dtMs = nsToMs(tick.dtNs);
            const lateMs = nsToMs(tick.latenessNs);
            const workMs = nsToMs(workNs);
            console.log(
                [
                    `tick=${tick.tickId}`,
                    `scheduleIndex=${tick.scheduleIndex}`,
                    `dt=${dtMs.toFixed(2)}ms`,
                    `work=${workMs.toFixed(2)}ms`,
                    `lateness=${lateMs.toFixed(2)}ms`,
                    `skippedPeriods=${tick.skippedPeriods}`,
                ].join(" | ")
            );
        }
    }

    accumulator.endTimeNs = process.hrtime.bigint();

    const totals = accumulator.finalize();

    const {
        durationSeconds: effectiveDuration,
        hostCpuEnergyJoules,
        totalHostCpuActiveTicks,
        totalProcessCpuActiveTicks,
    } = totals;

    let processCpuEnergyShare = 0;
    if (totalHostCpuActiveTicks > 0n) {
        processCpuEnergyShare =
            Number(totalProcessCpuActiveTicks) /
            Number(totalHostCpuActiveTicks);
    }

    const processCpuEnergyJoules =
        hostCpuEnergyJoules * processCpuEnergyShare;

    const isActive = totalProcessCpuActiveTicks > 0n;

    // Calcul carbone
    const processCpuEnergyKwh =
        processCpuEnergyJoules / JOULES_PER_KWH ;
    
    const hostCpuEnergyKwh = hostCpuEnergyJoules / JOULES_PER_KWH;

    const processCpuCarbon_gCO2e =
        processCpuEnergyKwh * emissionFactor_gCO2ePerKWh;
    
        const hostCpuCarbon_gCO2e = hostCpuEnergyKwh * emissionFactor_gCO2ePerKWh;

    if (debugTiming) {
        console.log(
            `Audit ended: durationTarget=${durationSeconds}s, durationEffective=${effectiveDuration.toFixed(3)}s`
        );
    }

    return {
        pid,
        durationSeconds: effectiveDuration,

        hostCpuEnergyJoules,
        processCpuEnergyJoules,
        processCpuEnergyShare,

        hostCpuCarbon_gCO2e,
        processCpuCarbon_gCO2e,
        isActive,
    };
}