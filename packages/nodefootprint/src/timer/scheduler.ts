import { msToNs, nowNs, sleepUntilNs } from "./timing.js";

export type OverrunPolicy = "burst" | "coalesce";

export interface TickTiming {
    tickId: number; // tick "reel" (0,1,2,3,4,...) => nb de snapshot produit
    scheduleIndex: bigint; // index théorique sur la grille t0 + n*P (peut sauter en coalesce)
    periodNs: bigint;

    t0Ns: bigint;
    deadlineNs: bigint;

    startNs: bigint; //t_start
    dtNs: bigint; //t_start[n] - t_start[n-1] (réel)
    latenessNs: bigint; //max(0, start - deadline)


    skippedPeriods: bigint;
}

export async function* fixedRateTicks(
    options: {
        periodMs: number,
        overrunPolicy?: OverrunPolicy,
        signal?: AbortSignal,
        t0Ns?:bigint, //ancrage du temps 0
    }
): AsyncGenerator<TickTiming> {
    if(!Number.isFinite(options.periodMs || options.periodMs <= 0)) {
        throw new Error("fixedRateTicks: periodMs must be a positive number");
    }
    const periodNs = msToNs(options.periodMs);
    const overrunPolicy = options.overrunPolicy ?? "coalesce";

    const t0Ns = options.t0Ns ?? nowNs();

    let tickId = 0;
    let scheduleIndex = 0n; // index sur t0 + scheduleIndex*period

    let prevStartNs: bigint | null = null;

    while (!options.signal?.aborted) {

        const deadlineNs = t0Ns + scheduleIndex * periodNs;

        //attendre jusqu'a dealine (ou immediat si retard)

        await sleepUntilNs(deadlineNs,options.signal);
        if(options.signal?.aborted) break;

        const startNs = nowNs();

        const dtNs = prevStartNs === null ? 0n : startNs - prevStartNs;
        const latenessNs = startNs > deadlineNs ? startNs - deadlineNs : 0n;

        const idealNext = scheduleIndex + 1n;

        let nextScheduleIndex = idealNext;

        if (overrunPolicy === "coalesce") {
            // Si on est "très en retard" (ex: tick long),
            // on saute directement à la prochaine deadline future.
            //
            // behind = nombre de périodes écoulées depuis t0 au moment startNs
            const behind = (startNs - t0Ns) / periodNs;
            nextScheduleIndex = behind + 1n;

            // Sécurité : ne jamais reculer
            if (nextScheduleIndex < idealNext) {
                nextScheduleIndex = idealNext;
            }
        }
        const skippedPeriods = nextScheduleIndex - idealNext;

    yield {
      tickId,
      scheduleIndex,
      periodNs,
      t0Ns,
      deadlineNs,
      startNs,
      dtNs,
      latenessNs,
      skippedPeriods,
    };

    prevStartNs = startNs;
    scheduleIndex = nextScheduleIndex;
    tickId++;

    }
}