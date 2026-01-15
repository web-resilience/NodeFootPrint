import { nowNs, NS_PER_MS } from "./timing.js";
import { fixedRateTicks } from "./scheduler.js";
/** Convert ns(BigInt) -> ms(number) lisible */
function nsToMs(ns: bigint): number {
    return Number(ns) / Number(NS_PER_MS);
}

/** Petit "travail artificiel" pour simuler une surcharge CPU */
function burnCpuMs(ms: number) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        // boucle volontairement "bête"
        Math.sqrt(Math.random());
    }
}

async function main() {
    const controller = new AbortController();

    const periodMs = 200; // teste aussi 1000
    const maxTicks = 30;

    console.log(`\n=== Timing test ===`);
    console.log(`periodMs=${periodMs}, policy=coalesce\n`);

    let i = 0;

    let prevEndNs: bigint | null = null;

    for await (const t of fixedRateTicks({
        periodMs,
        overrunPolicy: "coalesce",
        signal: controller.signal,
    })) {
        // On simule volontairement un overrun à certains ticks
        // (ex: tick 10 et 20 prennent 600ms alors que period=200ms)
        if (i === 10 || i === 20) {
            burnCpuMs(600);
        }

        const dtMs = nsToMs(t.dtNs);
        const lateMs = nsToMs(t.latenessNs);
        const endNs = nowNs();
        const tickWorkMs = nsToMs(endNs - t.startNs);

        const gapMs = prevEndNs === null ? 0 : nsToMs(t.startNs - prevEndNs);
        prevEndNs = endNs;
        console.log(
            [
                `tick=${t.tickId}`,
                `scheduleIndex=${t.scheduleIndex}`,
                `dt=${dtMs.toFixed(2)}ms`,
                `lateness=${lateMs.toFixed(2)}ms`,
                `skippedPeriods=${t.skippedPeriods}`,
                `work=${tickWorkMs.toFixed(2)}ms`,
                `gap=${gapMs.toFixed(2)}ms`,
            ].join(" | ")
        );

        i++;
        if (i >= maxTicks) {
            controller.abort();
        }
    }

    console.log("\nDone.");
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
