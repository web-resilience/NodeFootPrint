import process from "node:process";

//Base temporelle monotone + conversions sûres
export const NS_PER_MS = 1_000_000n;
export const NS_PER_S = 1_000_000_000n;


/**
 * Horloge monotone
 */

export function nowNs(): bigint {
    return process.hrtime.bigint();
}

/**
 * Convertit un nombre de milliseconde (number) en nanosecondes (bigint)
 * Arrondit pour éviter les erreur flottantes
 */

export function msToNs(ms: number) {
    return BigInt(Math.round(ms * 1e6));
}

/**
 * Convertit ns -> ms pour setTimeout.
 * On fait CEIL pour éviter un réveil "trop tôt" à cause d'une troncature.
 */
export function nsToMsCeil(ns: bigint): number {
    if (ns <= 0n) return 0;
    const ms = (ns + NS_PER_MS - 1n) / NS_PER_MS; //ceil(ns/1e6)
    return Number(ms);
}


/**
 * sleep simple en ms
 */

export function sleepMs(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 
 *  * Attend jusqu'à deadlineNs (monotone).
 * - si on est déjà après la deadline => retour immédiat
 * - sinon => setTimeout(remaining)
 *
 * Note importante :
 * setTimeout ne garantit PAS la précision, il garantit "pas avant".
 * La vérité du réveil, c'est nowNs() après l'attente.
 */

export async function sleepUntilNs(deadlineNs: bigint,signal?:AbortSignal): Promise<void> {
    const remainingNs = deadlineNs - nowNs();
    if (remainingNs <= 0n) return;

    const remainingMs = nsToMsCeil(remainingNs);

    // setTimeout a une limite max (~24,8 jours en ms),
    // pour des periods d'audit (1s, 200ms, etc.) aucun souci.
    if(!signal) {
        await sleepMs(remainingMs);
        return;
    }

    await Promise.race([
        sleepMs(remainingMs),
        new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(),{once:true}))
    ]);
    
}


export function clampDt(dt: number, min = 0.2, max = 5): number {
    if (!Number.isFinite(dt) || dt <= 0) {
        return min;
    }
    if (dt < min) return min;
    if (dt > max) return max;
    return dt;
}
