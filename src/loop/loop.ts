import os from "os";
import { RaplReader } from "../index.js";

interface LoopOptions {
  periodMs?: number;
  samplers: {
    raplReader: RaplReader;
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
      const raplSample = await options.samplers.raplReader.sample(nowNs);

      if (!raplSample) {
        return;
      }

      if (!raplSample.primed || !raplSample.ok) {
        // pas encore de delta exploitable ou pas de lecture valide
        return;
      }

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



      if (options.shareData) {
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
