import { RaplPackageInfo, RaplProbeResult } from './rapl-probe.js';
import { readFile } from 'fs/promises';
import * as readline from 'node:readline';

/**
 * RAPL Reader class to sample energy consumption from RAPL packages.
 * It uses the probe data to read energy values from the appropriate files.
 * It handles counter wraparounds and computes power consumption.
 * It provides a method to sample the energy consumption at a given time.
 * It logs debug information if enabled.
 * It returns structured data including delta energy, delta time, power, number of wraps, and package info.
 * @example
 * ```ts
 * import { raplProbe, RaplReader } from 'node-footprint';
 * const probe = await raplProbe();
 * const raplReader = new RaplReader({ probe, log: 'debug' });
 * const nowNs = BigInt(Date.now()) * 1000000n;
 * const sample = await raplReader.sample(nowNs);
 * console.log(sample);
 * ```
 * @remarks
 * ### Returned object structure
 * The `sample` method returns an object with the following properties:
 * - `ok`: boolean indicating if the sample was successful.
 * - `primed`: boolean indicating if the reader has been primed with an initial sample.
 * - `deltaTimeTs`: time difference in seconds since the last sample.
 * - `deltaUj`: total energy difference in microjoules since the last sample.
 * - `deltaJ`: total energy difference in joules since the last sample.
 * - `powerW`: average power consumption in watts since the last sample.
 * - `packages`: array of package info objects with node and path.
 * - `wraps`: number of counter wraparounds detected since the last sample.
 * 
 * ### Handling counter wraparounds
 * The class detects counter wraparounds by comparing the current energy reading
 * with the last recorded value. If the current value is less than the last value,
 * it assumes a wraparound has occurred and adjusts the delta calculation accordingly.  
 * 
 * ### Logging
 * If the `log` option is set to `'debug'`, the class logs debug information
 * to the console, including timestamps of samples and any detected wraparounds.
 * 
 * ### Usage considerations
 * - The first call to `sample` will not produce a delta value, as it is used to prime the reader.
 * - The time difference (`deltaTimeTs`) is clamped between 0.2s and 5s to avoid unrealistic values
 * caused by system freezes or delays.
 * 
 * ### Error handling   
 * If a package's energy file cannot be read, it is skipped in the delta calculation.
 * The method will still return a valid sample object, but the `ok` property will be `false`
 * if no packages could be read.
 * ### Performance
 * The class is designed to efficiently read energy values from multiple RAPL packages
 * and compute power consumption with minimal overhead.
 * ### Extensibility
 * The class can be extended to include additional features, such as
 * support for more RAPL domains or integration with other power measurement tools.
 * ### Dependencies
 * This class depends on the `fs/promises` module for file reading
 * and the structure of the `RaplProbeResult` obtained from the `raplProbe` function.
 * 
 * ### Example output
 * An example output of the `sample` method might look like:
 * ```ts
    * {
    *   ok: true,
    *  primed: true,
    *   deltaTimeTs: 1.0,
    *   deltaUj: 150000,
    *   deltaJ: 0.15,
    *   powerW: 0.15,
    *   packages: [
    *     { node: 'intel-rapl:0', path: '/sys/class/powercap/intel-rapl:0' },
    *     { node: 'intel-rapl:1', path: '/sys/class/powercap/intel-rapl:1' }
    *   ],
    *   wraps: 0
    * }
    * ```
    * ### Notes
    * - Energy values are in microjoules (µJ) as per RAPL specifications.
    * - Power is calculated in watts (W) based on the energy difference over time.  
    * 
 * 
 * 
 *  
 */

export interface RaplReaderOptions {
    probe?: RaplProbeResult;
    log?: 'silent' | 'debug';
}
export interface RaplPackageSample {
  node: string;
  path: string;
  deltaUj: number; // µJ
  deltaJ: number;  // J
  powerW: number;  // W
  wraps: number;
  ok: boolean;     // lecture OK pour ce package sur ce tick ?
}
export interface RaplSample {
    ok: boolean;
    primed?: boolean;
    deltaTimeTs: number;
    deltaUj: number;   // µJ
    deltaJ: number;    // J
    powerW: number;    // W
    packages: RaplPackageSample[];
    wraps: number;
}

interface RaplReaderPackageState {
    node: string;
    path: string;
    name: string;
    file: string;
    lastUj: bigint | null;
    maxEnergyUj: bigint | null;
}

interface RaplReaderState {
    lastNs: bigint | null;
    packages: RaplReaderPackageState[];
}

export function clampDt(dt: number, min = 0.2, max = 5): number {
    if (!Number.isFinite(dt) || dt <= 0) {
        return min;
    }
    if (dt < min) return min;
    if (dt > max) return max;
    return dt;
}

export class RaplReader {
    private state: RaplReaderState | null = null;
    private log: 'silent' | 'debug';

    constructor(options: RaplReaderOptions) {
        const { probe, log } = options;
        this.log = log ?? 'silent';

        if (!probe) {
            if (this.log === 'debug') {
                console.error('RAPL reader initialized without probe data');
            }
            return;
        }

        if (probe.status !== 'OK') {
            console.error('RAPL reader initialized with invalid probe status:', probe.status);
            if (probe.hint) {
                console.info('RAPL reader hint:', probe.hint);
            }
            return;
        }

        const packages: RaplPackageInfo[] = (probe.packages || []).filter(
            (p: RaplPackageInfo) => p.hasEnergyReadable && p.files.energyUj,
        );

        if (packages.length === 0) {
            console.error('RAPL reader initialized without readable packages');
            return;
        }

        this.state = {
            lastNs: null,
            packages: packages.map((p) => ({
                node: p.node,
                path: p.path,
                name: p.name,
                file: p.files.energyUj!,
                lastUj: null,
                maxEnergyUj:
                    p.maxEnergyUj != null && Number.isFinite(p.maxEnergyUj)
                        ? BigInt(p.maxEnergyUj)
                        : null,
            })),
        };
    }

    /**
     * Indique si le lecteur est correctement initialisé (probe OK + packages lisibles).
     */
    get isReady(): boolean {
        return this.state !== null;
    }

    /**
     * Ne pas appeler en parallèle sur la même instance.
     */
    async sample(nowNs: bigint): Promise<RaplSample | null> {
        if (!this.state) {
            return null;
        }

        const state = this.state;

        // --- 1) Première mesure : priming ---
        if (state.lastNs === null) {
            state.lastNs = nowNs;

            const primeReads = state.packages.map(async (pkg) => {
                try {
                    const raw = await readFile(pkg.file, { encoding: "utf-8" });
                    pkg.lastUj = BigInt(raw.trim());
                    return { pkg, ok: true };
                } catch {
                    pkg.lastUj = null;
                    return { pkg, ok: false };
                }
            });

            const primeResults = await Promise.all(primeReads);

            const packages: RaplPackageSample[] = primeResults.map(({ pkg, ok }) => ({
                node: pkg.node,
                path: pkg.path,
                deltaUj: 0,
                deltaJ: 0,
                powerW: 0,
                wraps: 0,
                ok,
            }));

            const ok = primeResults.some((r) => r.ok);

            // primed = false :  pas encore de delta exploitable
            return {
                ok,
                primed: false,
                deltaTimeTs: 0,
                deltaUj: 0,
                deltaJ: 0,
                powerW: 0,
                packages,
                wraps: 0,
            };
        }

        // --- 2) Mesures suivantes : vrais deltas ---

        // log debug
        if (this.log === "debug" && process.stdout.isTTY) {
            readline.clearLine(process.stdout, 0);
            readline.cursorTo(process.stdout, 0);
            process.stdout.write(`RAPL sample at ${nowNs.toString()} ns`);
        }

        let wraps = 0n;
        let totalDeltaUj = 0n;
        let primed = false;
        let successfulReads = 0;

        let deltaTimeTs = Number(nowNs - state.lastNs) / 1e9;
        deltaTimeTs = clampDt(deltaTimeTs);
        state.lastNs = nowNs;

        const readResults = await Promise.all(
            state.packages.map(async (pkg) => {
                try {
                    const raw = await readFile(pkg.file, { encoding: "utf-8" });
                    const currentUJ = BigInt(raw.trim());
                    return { pkg, currentUJ };
                } catch {
                    return { pkg, currentUJ: null as bigint | null };
                }
            })
        );

        const packageSamples: RaplPackageSample[] = [];

        for (const { pkg, currentUJ } of readResults) {
            // lecture OK pour ce package ?
            let pkgDeltaUj = 0n;
            let pkgWraps = 0n;
            let pkgOk = false;

            if (currentUJ !== null) {
                pkgOk = true;
                successfulReads++;

                if (pkg.lastUj === null) {
                    // on n'avait pas d'historique pour ce package (erreur précédente, etc.)
                    pkg.lastUj = currentUJ;
                } else {
                    // ici on a un historique → vrai delta
                    primed = true;

                    let deltaUj = currentUJ - pkg.lastUj;

                    // wraparound
                    if (deltaUj < 0n && pkg.maxEnergyUj !== null) {
                        wraps += 1n;
                        pkgWraps += 1n;
                        deltaUj = (pkg.maxEnergyUj - pkg.lastUj) + currentUJ;
                    }

                    if (deltaUj >= 0n) {
                        totalDeltaUj += deltaUj;
                        pkgDeltaUj = deltaUj;
                    }

                    pkg.lastUj = currentUJ;
                }
            }

            const deltaUjNumber = Number(pkgDeltaUj);
            const deltaJ = deltaUjNumber / 1e6;
            const powerW = deltaTimeTs > 0 ? deltaJ / deltaTimeTs : 0;

            packageSamples.push({
                node: pkg.node,
                path: pkg.path,
                deltaUj: deltaUjNumber,
                deltaJ,
                powerW,
                wraps: Number(pkgWraps),
                ok: pkgOk,
            });
        }

        const ok = successfulReads > 0;

        //si pas de delta d'énergie total, on évite les divisions par zéro
        if (totalDeltaUj === 0n) {
            return {
                ok,
                primed,
                deltaTimeTs,
                deltaUj: 0,
                deltaJ: 0,
                powerW: 0,
                packages: packageSamples,
                wraps: Number(wraps),
            };
        }

        const totalDeltaUjNumber = Number(totalDeltaUj);
        const totalDeltaJ = totalDeltaUjNumber / 1e6;
        const totalPowerW = totalDeltaJ / deltaTimeTs;

        return {
            ok,
            primed,
            deltaTimeTs,
            deltaUj: totalDeltaUjNumber,
            deltaJ: totalDeltaJ,
            powerW: totalPowerW,
            packages: packageSamples,
            wraps: Number(wraps),
        };
    }

}
