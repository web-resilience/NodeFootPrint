// src/monitor/runMonitor.ts

import process from "node:process";
import { collectSamples } from "../sampling/collectSamples.js";
import { HostToPidSlidingWindow } from "../analysis/HostToPidSlidingWindows.js";
interface RunMonitorOptions {
    pid: number;
    tickMs?: number;
    windowSize?: number;

    samplers: {
        energyReader?: any;
        cpuReader?: any;
        processCpuReader?: any;
    };
}

export async function runMonitor(
    options: RunMonitorOptions
): Promise<void> {
    const {
        pid,
        tickMs = 1000,
        windowSize = 10,
        samplers,
    } = options;

    const window = new HostToPidSlidingWindow({
        windowSize,
    });

    let running = true;

    process.on("SIGINT", () => {
        process.stdout.write("\r\x1b[2K");
        running = false;
        console.log("\nStopping monitor...");
        process.exit(0);
    });

    console.log(
        `Monitoring PID ${pid} (window=${windowSize}s, tick=${tickMs}ms)`
    );
    console.log(
        "time        host_J   proc_J   share_%   active"
    );

    let lastTickNs: bigint | null = null;

    while (running) {
        const nowNs = process.hrtime.bigint();

        let intervalSeconds = 0;
        if (lastTickNs !== null) {
            intervalSeconds =
                Number(nowNs - lastTickNs) / 1e9;
        }
        lastTickNs = nowNs;

        const samples = await collectSamples(samplers, nowNs);

        const hostEnergyJoules =
            samples.energy && samples.energy.ok && samples.energy.primed
                ? samples.energy.deltaJ
                : undefined;

        const hostCpuActiveTicks =
            samples.cpu && samples.cpu.ok && samples.cpu.primed
                ? samples.cpu.cpuTicks.deltaActiveTicks
                : undefined;

        const processCpuActiveTicks =
            samples.processCpu && samples.processCpu.ok
                ? samples.processCpu.cpuTicks.deltaActive
                : undefined;

        if (
            typeof hostEnergyJoules === "number" &&
            typeof hostCpuActiveTicks === "bigint" &&
            typeof processCpuActiveTicks === "bigint"
        ) {
            const result = window.push({
                hostEnergyJoules,
                hostCpuActiveTicks,
                processCpuActiveTicks,
            });

            if (result.ok) {
                const ts = new Date().toISOString().substring(11, 19);
                const line =
                    `${ts}  ` +
                    `${result.windowEnergy.hostJoules.toFixed(2).padStart(7)} J  ` +
                    `${result.processEnergyJoules.toFixed(3).padStart(7)} J  ` +
                    `${(result.cpuShare * 100).toFixed(1).padStart(6)}%  ` +
                    `${result.isActive ? "active" : "idle"}`;

                process.stdout.write("\r\x1b[2K" + line);
            }
        }

        await new Promise((r) => setTimeout(r, tickMs));
    }
}
