import os from "os";
import { CpuReader, RaplReader } from "../index.js";
import { EnergyReader } from "../sensors/rapl/enregyReader.js";

interface LoopOptions {
  periodMs?: number;
  samplers: {
    energyReader: EnergyReader;
    cpuReader: CpuReader;
  };
  shareData?: any;
}

export function startMainLoop(options: LoopOptions) {
  const periodMs = options.periodMs ?? 1000;
  let inFlight = false;
  const numberOfCPUs = os.cpus().length || 1;

  const tick = async () => {
    if (inFlight) {
      // skip si le tick précédent n'est pas fini
      return;
    }

    inFlight = true;
    const nowNs = process.hrtime.bigint();

    try {
      const { energyReader, cpuReader } = options.samplers;
      const [raplSample, cpuSample] = await Promise.all([
        energyReader ? energyReader.sample(nowNs) : Promise.resolve(null),
        cpuReader ? cpuReader.sample(nowNs) : Promise.resolve(null)
      ]);

      if (raplSample && raplSample.ok && raplSample.primed && options.shareData) {

        const { powerW, deltaJ, deltaTimeTs, packages } = raplSample;
        //total tous packages
        // valeurs brutes
        const hostPowerWatts = powerW;
        const hostPowerPerCpuWatts = powerW / numberOfCPUs;
        const hostEnergyJoules = deltaJ;
        const hostEnergyPerCpuJoules = deltaJ / numberOfCPUs;
        const intervalSeconds = deltaTimeTs;
        const perPackage = [];

        //par Packages
        for (const pkg of packages) {
          // traitement par package si nécessaire
          perPackage.push({
            node: pkg.node,
            deltaJ: Number(pkg.deltaJ.toFixed(3)),
            powerW: Number(pkg.powerW.toFixed(3)),
            wraps: pkg.wraps,
            hint: "Details for this CPU package",
          });
        }
        const timestamp = new Date().toISOString();
        options.shareData.timestamp = timestamp;
        options.shareData.rapl = {
          hostPowerWatts: {
            value: Number(hostPowerWatts.toFixed(3)),
            unit: "W",
            hint: "Total host power consumption as measured by RAPL",
          },
          hostPowerPerCpuWatts: {
            value: Number(hostPowerPerCpuWatts.toFixed(3)),
            unit: "W",
            hint: "Host power consumption per CPU core as measured by RAPL",
          },
          hostEnergyJoules: {
            value: Number(hostEnergyJoules.toFixed(3)),
            unit: "J",
            hint:
              "Total host energy consumption over the interval as measured by RAPL",
          },
          hostEnergyPerCpuJoules: {
            value: Number(hostEnergyPerCpuJoules.toFixed(3)),
            unit: "J",
            hint:
              "Host energy consumption per CPU core over the interval as measured by RAPL",
          },
          intervalSeconds: {
            value: Number(intervalSeconds.toFixed(3)),
            unit: "s",
            hint: "Sampling interval duration in seconds",
          },
          perPackage // détails par package si besoin
        };


      }

      //-------------cpu utilisation---------

      if (
        cpuSample &&
        cpuSample.ok &&
        cpuSample.primed &&
        options.shareData
      ) {
        const cpuUtil = cpuSample.cpuUtilization; // 0–1
        const cpuUtilPercent = cpuUtil * 100;

        options.shareData.cpu = {
          utilizationRatio: {
            value: cpuUtil,
            unit: "",
            hint: "Global CPU utilization ratio (0–1) derived from /proc/stat",
          },
          utilizationPercent: {
            value: Number(cpuUtilPercent.toFixed(2)),
            unit: "%",
            hint: "Global CPU utilization percentage derived from /proc/stat",
          },
          intervalSeconds: {
            value: Number(cpuSample.deltaTimeTs.toFixed(3)),
            unit: "s",
            hint: "Sampling interval duration in seconds for CPU metrics",
          },
          deltaTotalTicks:Number(cpuSample.deltaTotalTicks)
        };
      }

    } catch (error) {
      console.error("Error in main loop tick:", error);
    } finally {
      inFlight = false;
    }
  };

  const intervalId = setInterval(tick, periodMs);
  if (typeof (intervalId as any).unref === "function") {
    (intervalId as any).unref();
  }

  // premier tick immédiat (fire-and-forget)
  void tick();

  return {
    stop: () => clearInterval(intervalId),
    tick, // pour déclencher manuellement si besoin
  };
}
