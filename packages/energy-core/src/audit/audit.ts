import { collectSamples } from "../sampling/sampling.js";
import { AuditAccumulator } from "./AuditAccumulator.js";
import { fixedRateTicks } from "../timers/scheduler.js";
import { NS_PER_MS, nowNs } from "../timers/timing.js";


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
    debugMeta?: boolean;

    signal?: AbortSignal
}

interface AuditResult {
    pid: number;
    durationSeconds: number;

    hostCpuEnergyJoules: number;
    processCpuEnergyJoules: number;
    processCpuEnergyShare: number;

    hostCpuCarbon_gCO2e: number;
    processCpuCarbon_gCO2e: number;
    isActive: boolean;

    meta?: {
        tickMs: number;
        tickCount: number;
        skippedPeriodsTotal: bigint | string;

        energyPrimedSamples: number;
        cpuPrimedSamples: number;

        processOkSamples: number;
        processErrorSamples: number;
        firstProcessError: string | null;

        totalHostCpuActiveTicks?:bigint | string;
        totalProcessCpuActiveTicks?:bigint | string;

        endReason: "duration" | "aborted";

        // petits hints utiles pour comprendre un "0 J"
        notes?: string[];
    };
}

export async function audit(options: AuditOptions): Promise<AuditResult> {
    const {
        pid,
        durationSeconds,
        tickMs = 1000,
        samplers,
        emissionFactor_gCO2ePerKWh,
        debugTiming = false,
        debugMeta = false,
    } = options;

    //start audit
    const startTimeNs = process.hrtime.bigint();
    const endTimeNsTarget = startTimeNs + BigInt(Math.floor(durationSeconds * 1e9));

    const accumulator = new AuditAccumulator(startTimeNs);

    //debug meta init

    let tickCount = 0;
    let skippedPeriodsTotal = 0n

    let energyPrimedSamples = 0;
    let cpuPrimedSamples = 0;

    let processOkSamples = 0;
    let processErrorSamples = 0;

    let firstProcessError: string | null = null;

    let endReason: "duration" | "aborted" = "duration";

    const notes: string[] = [];
    // end debug meta init

    for await (const tick of fixedRateTicks({
        periodMs: tickMs,
        overrunPolicy: "coalesce",
        t0Ns: startTimeNs
    })) {

        // condition fin de loop 
        if (options.signal?.aborted) {
            endReason = "aborted";
            break;
        }
        if (tick.startNs >= endTimeNsTarget) {
            endReason = "duration"
            break;
        }

        //for debugMeta
        tickCount++;
        skippedPeriodsTotal += tick.skippedPeriods;
        //

        const workStartNs = nowNs();//pour debug durée travail 

        const samples = await collectSamples(samplers, tick.startNs);

        //--meta stats (for -vv)

        if (samples.energy?.ok && samples.energy.primed) energyPrimedSamples++;
        if (samples.cpu?.ok && samples.cpu.primed) cpuPrimedSamples++;

        if (samples.processCpu?.ok) {
            processOkSamples++;
        } else if (samples.processCpu && (samples.processCpu as any).ok === false) {
            processErrorSamples++;
            const error = (samples.processCpu as any).error ?? "unknown";
            if (!firstProcessError) firstProcessError = error;
        }



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
        processCpuEnergyJoules / JOULES_PER_KWH;

    const hostCpuEnergyKwh = hostCpuEnergyJoules / JOULES_PER_KWH;

    const processCpuCarbon_gCO2e =
        processCpuEnergyKwh * emissionFactor_gCO2ePerKWh;

    const hostCpuCarbon_gCO2e = hostCpuEnergyKwh * emissionFactor_gCO2ePerKWh;

    //-- in case of "0"
    if (!isActive) {

        if (processErrorSamples > 0) {
            notes.push(`Process sampling errors=${processErrorSamples} (first=${firstProcessError ?? "unkown"})`);
            if (firstProcessError === "file_not_found") {
                notes.push("process likely ended before a second sample (priming) could be taken");
                notes.push("tip: use --spawn for short-lived commands or lower --tick (e.g. 100ms)");
            }
        } else if (processOkSamples > 0) {
            notes.push("process sampled ok but stayed idle (0 active ticks) during the window");
        } else {
            notes.push("process sampler not configured or never produced samples");
        }
    }

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

        meta: debugMeta ? {
            tickMs,
            tickCount,
            skippedPeriodsTotal:skippedPeriodsTotal.toString(),

            energyPrimedSamples,
            cpuPrimedSamples,

            processOkSamples,
            processErrorSamples,
            firstProcessError,
            totalHostCpuActiveTicks:totalHostCpuActiveTicks.toString(),
            totalProcessCpuActiveTicks:totalProcessCpuActiveTicks.toString(),

            endReason

        } : undefined
    };
}