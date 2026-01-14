import { buildJsonSnapshot, CpuReader, estimateCarbonFootprint, HostToPidSlidingWindow, ProcessCpuReader } from "../index.js";
import { EnergyReader } from "../sensors/rapl/enregyReader.js";
import { createWriteStream } from "fs";
import { once } from "events";

interface LoopOptions {
  periodMs?: number;
  slidingWindowSize?: number;
  emissionFactor?: {
    countryCode: string;
    factor_g: number;
    unit: 'gCO2e/kWh';
  }
  samplers: {
    energyReader: EnergyReader;
    cpuReader: CpuReader;
    processCpuReader?: ProcessCpuReader;
  };
  output?: {
    path?: string;//ex: './metrics.jsonl'
    flush?: boolean;//TODO:fsync for each tick (optional, default false)
  }
  shareData?: any;
}

export async function startMainLoop(options: LoopOptions) {
  const periodMs = options.periodMs ?? 1000;
  const slidingWindowSize = options.slidingWindowSize ?? 10;

  const emissionFactor = options.emissionFactor ?? {
    countryCode: 'GLOBAL',
    factor_g: 475, // global average gCO2e/kWh,
    unit: 'gCO2e/kWh'// to check consistency
  };

  let inFlight = false;
  let lastLoopMs: bigint | null = null;

  const slidingWindow = new HostToPidSlidingWindow({
    windowSize: slidingWindowSize,
  });

  let outputStream: ReturnType<typeof createWriteStream> | null = null;

  if (options.output?.path) {
    outputStream = createWriteStream(options.output.path,
      {
        flags: 'a',//append only
        encoding: 'utf-8',
        autoClose: true
      },
    );

     // wait for opening fd
    await once(outputStream, 'open');
  }

  const tick = async () => {
    if (inFlight) {
      // skip if the previous tick is not finished
      return;
    }

    inFlight = true;
    const nowNs = process.hrtime.bigint();

    // real time delta from last loop
    let intervalSeconds = 0;
    if (lastLoopMs !== null) {
      intervalSeconds = Number(nowNs - lastLoopMs) / 1e9;
    }

    lastLoopMs = nowNs;

    try {
      const { energyReader, cpuReader, processCpuReader } = options.samplers;
      const [energySample, cpuSample, processCpuSample] = await Promise.all([
        energyReader ? energyReader.sample(nowNs) : Promise.resolve(null),
        cpuReader ? cpuReader.sample(nowNs) : Promise.resolve(null),
        processCpuReader ? processCpuReader.sample() : Promise.resolve(null)
      ]);

      if (!options.shareData) {
        return;
      }

      //-------------TimeStamp---------
      options.shareData.timestamp = new Date().toISOString();
      if (intervalSeconds) {
        options.shareData.intervalSeconds = intervalSeconds;
      }
      //-------------energy consumption---------
      if (energySample && energySample.ok && energySample.primed && options.shareData) {

        const { deltaJ, packages, internalClampedDt } = energySample;
        // total across all packages
        // raw values
        const hostEnergyJoules = deltaJ;
        const perPackage = [];

        // per CPU package
        for (const pkg of packages) {
          // processing per package if needed
          perPackage.push({
            node: pkg.node,
            deltaJ: Number(pkg.deltaJ.toFixed(3)),
            wraps: pkg.wraps,
            hint: "Details for this CPU package",
          });
        }

        options.shareData.rapl = {
          hostEnergyJoules: {
            value: Number(hostEnergyJoules.toFixed(3)),
            unit: "J",
            hint:
              "Total host energy consumption over the interval as measured by RAPL",
          },
          perPackage, // details per CPU package
          meta: {
            internalClampedDt
          }
        };
      }


      //-------------cpu / host utilisation---------

      if (
        cpuSample &&
        cpuSample.ok &&
        cpuSample.primed &&
        options.shareData
      ) {

        const { deltaActiveTicks, deltaIdleTicks, deltaTotalTicks, unit } = cpuSample.cpuTicks;
        const internalCpuDt = cpuSample.internalClampedDt;
        options.shareData.cpu = {
          cpuTicks: {
            unit,
            //!!important do not convert to number, keep bigint as string
            deltaActiveTicks: deltaActiveTicks.toString(),
            deltaIdleTicks: deltaIdleTicks.toString(),
            deltaTotalTicks: deltaTotalTicks.toString()
          },
          meta: {
            internalClampedDt: internalCpuDt
          }
        };
      }
      //-------------process cpu utilisation---------
      if (processCpuSample && processCpuSample.ok && options.shareData) {
        //attribute host energy to process
        const result = slidingWindow.push({
          hostEnergyJoules: options.shareData.rapl?.hostEnergyJoules.value ?? 0,
          hostCpuActiveTicks: options.shareData.cpu?.cpuTicks.deltaActiveTicks ? BigInt(options.shareData.cpu.cpuTicks.deltaActiveTicks) : 0n,
          processCpuActiveTicks: processCpuSample.cpuTicks.deltaActive
        });

        if (result.ok) {
          options.shareData.process = {
            pid: processCpuSample.pid,
            cpuShare: result.cpuShare,
            energyJoules: result.processEnergyJoules,
            windowSamples: result.samples,
            windowCpuTicks: result.windowCpuTicks,
            windowEnergy: result.windowEnergy,
            isActive: result.isActive
          }

        } else {
          options.shareData.process = {
            ok: false,
            pid: processCpuSample.pid,
            error: result.reason || 'attribution_failed'
          }
        }
      }

      if (!options.shareData.process?.energyJoules) {
        return;
      }

      //-------------carbon emissions---------
      const carbon = estimateCarbonFootprint({
        energyJoules: options.shareData.process?.energyJoules,
        emissionFactor: emissionFactor.factor_g,
      });

      if (carbon.ok) {
        options.shareData.carbon = {
          scope: 'cpu-electricity-only',
          emissionFactor: {
            countryCode: emissionFactor.countryCode,
            unit: 'gCO2e/kWh',
            value: emissionFactor.factor_g,
            source: "electricity-mix (configured)"
          },
          energy: {
            value: carbon.energy_Kwh,
            unit: 'kWh'
          },
          emissions: {
            value: carbon.carbon_gCO2e,
            unit: 'gCO2e'
          },
        }
      }

      //-------------output to stream if needed---------
      if(outputStream && options.shareData) {
          const snapshot = buildJsonSnapshot(options.shareData);
          const line = JSON.stringify(snapshot) + "\n";

          if(!outputStream.write(line)) {
            //handle backpressure
            await once(outputStream, 'drain');
          }

          if(options.output?.flush) {
            outputStream.emit('flush');//simple, user-defined event to signal flush
          }
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

  // first immediate tick (fire-and-forget)
  void tick();

  return {
    stop: () => {
      clearInterval(intervalId);
      if (outputStream) {
        outputStream.end();
      }
    },
    tick, // to trigger manually if needed
  };
}
