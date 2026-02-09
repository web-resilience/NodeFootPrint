import { parseArgs } from "node:util";
import  process  from "node:process";
import path from "node:path";
import { spawnTarget, killGracefully, extractVerbosity, parsePositiveNumberFromCommand, tryReadProcComm } from "./command-utils.js";
import { audit } from "../../audit/audit.js";
import { createSamplers } from "../../sampling/sampling.js";
import { printHelp } from "./help-command.js";
import { AppConfig, loadConfig } from "../../config/config.js";
import { EmpiricalEnergyReaderOptions } from "../../sensors/rapl/EmpiricalEnergyReader.js";


//parameter resolution order

//CLIFLAGS > CONFIG > ERROR

//if rapl ok
//else
//if --pidleW and pmaxW in cli options OK
//else if tdp in cli options OK
//else search for config file with pidleW and pmaxW or tdp
//else ERROR

//TODO when -v dispaly source or options (via cli or via config)

export async function auditCommand(argv = process.argv.slice(2)) {

  const { level: verbosity, debugMetaExplicit, rest } = extractVerbosity(argv);

  const verbose = verbosity >= 1;
  const debugMeta = verbosity >= 2 || debugMetaExplicit;

  const { values } = parseArgs({
    args: rest,
    options: {
      help: { type: "boolean" },

      config: { type: "string" },

      pid: { type: "string" },
      spawn: { type: "string" },

      pidleW: { type: "string" },// mincpuW
      pmaxW: { type: "string" }, //maxcpuW
      tdp: { type: "string" }, //tdp

      duration: { type: "string" },
      tick: { type: "string" },

      ef: { type: "string" },

      json: { type: "boolean" },

      debugTiming: { type: "boolean" },
      keepAlive: { type: "boolean" }
    }
    ,
    allowPositionals: true
  });

  if (values.help) {
    printHelp();
    return;
  }

  //load config if needed
  const configPath = values.config ?? path.resolve(process.cwd(),'nodefootprint.config.json');
  const config: AppConfig | undefined | null = configPath ? await loadConfig(configPath) : null;


  const tdp = values.tdp ? Number(values.tdp) : undefined;
  const pidleWatts = values.pidleW ? Number(values.pidleW) : undefined;
  const pmaxWatts = values.pmaxW ? Number(values.pmaxW) : undefined;

  const hasIdleCli = Number.isFinite(pidleWatts);
  const hasMaxCli = Number.isFinite(pmaxWatts);

  if (hasIdleCli !== hasMaxCli) {
    throw new Error("Use both --pidleW and --pmaxW together (or none)");
  }

  if (hasIdleCli && (pidleWatts as number) <= 0) throw new Error("--pidleW must be > 0");
  if (hasMaxCli && (pmaxWatts as number) <= 0) throw new Error("--pmaxW must be > 0");
  if (hasIdleCli && (pmaxWatts as number) < (pidleWatts as number)) {
    throw new Error("--pmaxW must be >= --pidleW");
  }
  if (values.tdp && (!Number.isFinite(tdp as any) || (tdp as number) <= 0)) {
    throw new Error("--tdp must be > 0");
  }

  const durationSeconds = parsePositiveNumberFromCommand('--duration', values.duration, 10);
  const tickMs = parsePositiveNumberFromCommand('--tick', values.tick, 1000);

  const debugTiming = !!values.debugTiming;
  const jsonOutput = !!values.json;
  const keepAlive = !!values.keepAlive;

  const emissionFactor = values.ef ? parsePositiveNumberFromCommand('--ef', values.ef, 475) :
    (config?.emissionFactor?.factor ?? 475);

  //track source for debug
  const emissionFactorSource = values.ef ? "cli" : config?.emissionFactor?.factor ? "config" : "default";
  const fallbackSource =
    hasIdleCli ? "cli" :
      (isFinite(config?.fallback?.pidleWatts as number) && isFinite(config?.fallback?.pmaxWatts as number)) ? "config" :
        values.tdp ? "cli" :
          isFinite(config?.fallback?.tdpWatts as number) ? "config" :
            "missing";


  //merge with config 

  const configFallback: Partial<EmpiricalEnergyReaderOptions> = config?.fallback ?? {};
  const fallback = {
    pidleWatts: hasIdleCli ? (pidleWatts as number) : configFallback.pidleWatts,
    pmaxWatts: hasMaxCli ? (pmaxWatts as number) : configFallback.pmaxWatts,
    tdpWatts: values.tdp ? (tdp as number) : configFallback.tdpWatts,
    idleFraction: configFallback.idleFraction,
    maxFraction: configFallback.maxFraction,
  }

  const controller = new AbortController();

  let child: import("node:child_process").ChildProcess | null = null;
  let pid: number;

  if (values.spawn) {
    const spawned = await spawnTarget(values.spawn);
    child = spawned.child;

    if (!child?.pid) {
      throw new Error("spawn failed: missing pid");
    }
    pid = child.pid;

    child.once("exit", () => controller.abort());
    child.once("error", () => controller.abort());

    process.once("SIGINT", async () => {
      controller.abort();
      //kill gracefully
      await killGracefully(child!, 1500);
      process.exit(130);
    });
  } else if (values.pid) {
    pid = Number(values.pid);
    if (!Number.isFinite(pid) || pid <= 1) {
      throw new Error("--pid must be a valid process id");
    }
  } else {
    throw new Error("Missing target: use --pid <pid> or --spawn \"cmd\"");
  }

  const samplers = await createSamplers(pid, fallback);

  //--- optionnal context in verbose mode

  const energyReader = samplers.energyReader;

  //if calibration not set in options or in config file error
  if (!energyReader.isReady) {
    if (child) killGracefully(child, 1000);
    const error = `Energy measurement unavailable: 
    RAPL not available and fallback not configured.\n
    Provide --pidleW/--pmaxW (recommended), or --tdp, or use --config <file>.`
    throw new Error(error);
  }


  if (verbose) {
    if (values.config) console.log(`Config: ${values.config}`);

    const er: any = samplers.energyReader;

    console.log(`Energy source: ${String(er?.mode ?? "unknown").toUpperCase()}`);

    if (er?.mode === "fallback") {
      console.log(`Fallback params source: ${fallbackSource.toUpperCase()}`);
      // optionnel: afficher les watts choisis
      if (fallback.pidleWatts && fallback.pmaxWatts) {
        console.log(`Fallback model: P_idle=${fallback.pidleWatts}W P_max=${fallback.pmaxWatts}W`);
      } else if (fallback.tdpWatts) {
        console.log(`Fallback model: TDP=${fallback.tdpWatts}W`);
      }
    }

    console.log(
      `Emission factor: ${emissionFactor} gCO2e/kWh (source: ${emissionFactorSource.toUpperCase()})`
    );

    console.log("");
  }

  console.log(`Starting audit for PID:${pid}...please wait`);

  // run audit

  const result = await audit({
    pid,
    durationSeconds,
    tickMs,
    samplers,
    emissionFactor_gCO2ePerKWh: emissionFactor,
    debugTiming,
    debugMeta,
    signal: controller.signal
  });

  if (child && !values.keepAlive) {
    //kill
    await killGracefully(child, 2000);
  }

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }



  // 5) print result
  console.log("==============================");
  console.log("\nCPU Energy Audit (bounded)");
  console.log("\n--------------------------\n");
  console.log(new Date().toLocaleDateString());
  console.log(`PID: ${result.pid}`);
  console.log(`Duration: ${result.durationSeconds.toFixed(2)} s`);
  console.log("\n---------ENERGY-----------\n");
  console.log(`Source: ${energyReader.mode}`);
  console.log(`Host CPU energy: ${result.hostCpuEnergyJoules.toFixed(3)} J`);
  console.log(`Process CPU energy: ${result.processCpuEnergyJoules.toFixed(3)} J`);
  console.log(`Process energy share: ${(result.processCpuEnergyShare * 100).toFixed(2)} %`);
  console.log("\n-----------POWER----------\n");
  console.log(`Average CPU Power:`);
  console.log(`Host avg CPU power: ${result.hostCpuEnergyJoules / result.durationSeconds} W`);
  console.log(`Process avg CPU power: ${result.processCpuEnergyJoules / result.durationSeconds} W`);
  console.log("\n-----------CARBON---------\n");
  console.log(`CPU Carbon Footprint:`);
  console.log(`Emission Factor:475`);
  console.log(`Host CPU carbon footprint: ${result.hostCpuCarbon_gCO2e.toFixed(6)} gCO2e`);
  console.log(`Process CPU carbon footprint: ${result.processCpuCarbon_gCO2e.toFixed(6)} gCO2e`);
  console.log("\n--------------------------\n");
  console.log(`Process active: ${result.isActive ? "yes" : "no"}`);
  console.log("\n--------------------------\n");
  if (debugMeta && (result as any).meta) {
    console.log("\nDebug meta:");
    console.log(JSON.stringify((result as any).meta, null, 2));
  }
  console.log("nodefootprint v.0.0.1");
}