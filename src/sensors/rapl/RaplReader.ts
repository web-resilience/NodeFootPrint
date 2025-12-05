import { RaplPackageInfo, RaplProbeResult } from './rapl-probe.js';
import { readFile } from 'fs/promises';


interface RaplReaderOptions {
    probe?: RaplProbeResult;
    log: 'silent' | 'debug';
}

export function clampDt(dt: number, min = 0.2, max = 5) {
    if (!Number.isFinite(dt) || dt <= 0) {
        return min;
    }
    if (dt < min) return min;
    if (dt > max) return max;
    return dt;
}

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

export class RaplReader {
    state;
    log;
    constructor(options: RaplReaderOptions) {
        const { probe, log } = options;
        if (!probe) {
            //silently fail for now
            console.error('RAPL reader initialized without probe data');
            return;
        }
        if (probe.status !== 'OK') {
            console.error('RAPL reader initialized with invalid probe status:', probe.status);
            if (probe.hint) {
                console.info('RAPL reader hint:', probe.hint);
            }
            return;
        }
        const packages: RaplPackageInfo[] = (probe?.packages || []).filter((p: RaplPackageInfo) => p.hasEnergyReadable && p.files.energyUj);
        if (packages.length === 0) {
            console.error('RAPL reader initialized without readable packages');
            return;
        }
        this.state = {
            lastNs: null as bigint | null,
            packages: packages.map((p) => ({
                node: p.node,
                path: p.path,
                name: p.name,
                file: p.files.energyUj,
                lastUj: BigInt(0),
                maxEnergyUj: (p.maxEnergyUj !== null && Number.isFinite(p.maxEnergyUj)) ? BigInt(p.maxEnergyUj) : null,
            })),
        };
        this.log = log ?? 'silent';

    }
    async sample(nowNs: bigint) {
        if (!this.state) {
            return;
        }
        // counter wraparounds
        let wraps = 0n;
        //total delta energy in microjoules
        let totalDeltaUj = 0n;

        if (this.state.lastNs === null) {
            this.state.lastNs = nowNs;
        }

        if (this.log === 'debug') {
            console.log(`RAPL sample at ${nowNs} ns`);
        }

        const reads = this.state?.packages.map(async (pkg) => {
            try {
                const raw = await readFile(pkg.file, { encoding: 'utf-8' });
                const currentUJ = BigInt(raw.trim());
                return { pkg, currentUJ };
            } catch (error) {
                return { pkg, currentUJ: null };
            }
        }) ?? [];

        const results = await Promise.all(reads);

        for (const { pkg, currentUJ } of results) {
            if (currentUJ === null) {
                continue;
            }
            //prime and do not produce delta on the first pass
            if (pkg.lastUj === BigInt(0)) {
                pkg.lastUj = currentUJ;
                continue;
            }
            let deltaUj = currentUJ - pkg.lastUj;
            //wraparound handling
            if (deltaUj < 0n && pkg.maxEnergyUj !== null) {
                //counter exceeded its max value and wrapped
                wraps += 1n;
                //calculate delta considering the wrap
                deltaUj = (pkg.maxEnergyUj - pkg.lastUj) + currentUJ;
            }
            if (deltaUj >= 0n) {
                totalDeltaUj += deltaUj;
            }
            pkg.lastUj = currentUJ;
        }

        let deltaTimeTs = Number(nowNs - this.state.lastNs) / 1e9;
        //clamp dt to [0.2,5] if server or vm freeze to avoid absurd dt if interval drifts
        deltaTimeTs = clampDt(deltaTimeTs);
        this.state.lastNs = nowNs;

        if (totalDeltaUj === 0n) {
            return {
                ok: this.state.packages.length > 0,
                deltaTimeTs,
                deltaUj: 0,
                deltaJ: 0,
                powerW: 0,
                packages: [],
                wraps: Number(wraps),
            }
        }

        const deltaUjNumber = Number(totalDeltaUj);
        const deltaJ = deltaUjNumber / 1e6;
        const powerW = deltaJ / deltaTimeTs;

        return {
            ok: this.state.packages.length > 0,
            deltaTimeTs,
            deltaUj: deltaUjNumber,
            deltaJ,//energy in joules (all packages combined)
            powerW,//power in watts
            packages: this.state.packages.map((p) => ({ node: p.node, path: p.path })),
            wraps: Number(wraps),
        }

    }
}