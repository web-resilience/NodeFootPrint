import { RaplPackageInfo, RaplProbeResult } from './rapl-probe.js';
import { clampDt } from '../../timer/timing.js';
import { readFile } from 'fs/promises';
import * as readline from 'node:readline';

export interface RaplReaderOptions {
    probe?: RaplProbeResult;
    log?: 'silent' | 'debug';
}
export interface RaplPackageSample {
  node: string;
  path: string;
  deltaUj: number; // µJ
  deltaJ: number;  // J
  wraps: number;
  ok: boolean;     // lecture OK pour ce package sur ce tick ?
}
export interface RaplSample {
    ok: boolean;
    primed?: boolean;
    internalClampedDt: number;
    deltaUj: number;   // µJ
    deltaJ: number;    // J
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

export class RaplReader {
    private state: RaplReaderState | null = null;
    private log: 'silent' | 'debug';
    private probeStatus: string | null = null;
    private probeHints: string | null = null;

    constructor(options: RaplReaderOptions) {
        const { probe, log } = options;
        this.log = log ?? 'silent';

        if (!probe) {
            this.probeStatus = 'NO_PROBE';
            this.probeHints = 'no probe data provided';
            if (this.log === 'debug') {
                console.error('RAPL reader initialized without probe data');
            }
            return;
        }

        if (probe.status !== 'OK') {
            this.probeStatus = probe.status;
            this.probeHints = probe.hint ?? 'rapl probe failed';
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
            //probe OK But Unreadable packages 
            this.probeStatus = 'INTERNAL_ERROR';
            this.probeHints = 'Contract violation: probe.status=OK but no readable packages (this is a bug)';
            console.error('⚠️  [RaplReader] ASSERTION FAILED: probe contract violated');
            console.error('    Expected: probe.status=OK implies at least one readable package');
            console.error('    Got: 0 readable packages');
             if (this.log === 'debug') {
                console.error('    Probe data:', JSON.stringify(probe, null, 2));
            }
            return;
        }
        
        this.probeStatus = 'OK';
        this.probeHints = null;

        this.state = {
            lastNs: null,
            packages: packages.map((p) => ({
                node: p.node,
                path: p.path,
                name: p.name,
                file: p.files.energyUj!,
                lastUj: null,
                maxEnergyUj:
                    p.maxEnergyUj != null && Number.isFinite(p.maxEnergyUj) && p.maxEnergyUj > 0
                        ? BigInt(p.maxEnergyUj)
                        : null,
            })),
        };
    }

    get status() {
        return this.probeStatus;
    }

    get hint() {
        return this.probeHints;
    }

    /**
     * tell if the reader is ready to sample energy data (i.e. probe was successful)
     */
    get isReady(): boolean {
        return this.state !== null;
    }

    /**
     * do not call if isReady === false
     *
     * Samples RAPL energy data and computes deltas since last sample.
     *
     * @param nowNs  Current timestamp in nanoseconds
     * @returns      RaplSample containing energy deltas and power estimates    
     *  Consider a temporary cache if readings are very frequent
     */
    async sample(nowNs: bigint): Promise<RaplSample | null> {
        if (!this.state) {
            return null;
        }

        const state = this.state;

        // --- 1) first measure : priming ---
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
                wraps: 0,
                ok,
            }));

            const ok = primeResults.some((r) => r.ok);

            // primed = false :  not exploitable delta yet
            return {
                ok,
                primed: false,
                internalClampedDt: 0,
                deltaUj: 0,
                deltaJ: 0,
                packages,
                wraps: 0,
            };
        }

        // --- 2) true measurement: compute deltas ---

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

        let internalClampedDt = Number(nowNs - state.lastNs) / 1e9;
        internalClampedDt = clampDt(internalClampedDt);
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
            // read result for this package
            let pkgDeltaUj = 0n;
            let pkgWraps = 0n;
            let pkgOk = false;

            if (currentUJ !== null) {
                pkgOk = true;
                successfulReads++;

                if (pkg.lastUj === null) {
                    // DIDN'T HAVE HISTORY → priming for this package
                    pkg.lastUj = currentUJ;
                } else {
                    // HAD HISTORY → can compute delta
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

            packageSamples.push({
                node: pkg.node,
                path: pkg.path,
                deltaUj: deltaUjNumber,
                deltaJ,
                wraps: Number(pkgWraps),
                ok: pkgOk,
            });
        }

        const ok = successfulReads > 0;

        // if no total energy delta, avoid division by zero
        if (totalDeltaUj === 0n) {
            return {
                ok,
                primed,
                internalClampedDt,
                deltaUj: 0,
                deltaJ: 0,
                packages: packageSamples,
                wraps: Number(wraps),
            };
        }

        const totalDeltaUjNumber = Number(totalDeltaUj);
        const totalDeltaJ = totalDeltaUjNumber / 1e6;

        return {
            ok,
            primed,
            internalClampedDt,
            deltaUj: totalDeltaUjNumber,
            deltaJ: totalDeltaJ,
            packages: packageSamples,
            wraps: Number(wraps),
        };
    }

}
