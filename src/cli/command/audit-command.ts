import { parseArgs } from "node:util";
import { spawnTarget, killGracefully, extractVerbosity, parsePositiveNumberFromCommand, tryReadProcComm } from "./command-utils.js";
import { audit } from "../../audit/audit.js";
import { createSamplers } from "../../sampling/sampling.js";
import { printHelp } from "./help-command.js";


export async function auditCommand(argv = process.argv.slice(2)) {

  const { level: verbosity, debugMetaExplicit, rest } = extractVerbosity(argv);

  const verbose = verbosity >= 1;
  const debugMeta = verbosity >= 2 || debugMetaExplicit;

  const { values } = parseArgs({
    args: rest,
    options: {
      help: { type: "boolean" },

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

  const tdp = values.tdp ? Number(values.tdp) : undefined;
  const pidleWatts = values.pidleW ? Number(values.pidleW) : undefined;
  const pmaxWatts = values.pmaxW ? Number(values.pmaxW) : undefined;

  const hasIdle = Number.isFinite(pidleWatts);
  const hasMax = Number.isFinite(pmaxWatts);

  if (hasIdle !== hasMax) {
    throw new Error("Use both --pidle-w and --pmax-w together (or none)");
  }

  if (hasIdle && (pidleWatts as number) <= 0) throw new Error("--pidle-w must be > 0");
  if (hasMax && (pmaxWatts as number) <= 0) throw new Error("--pmax-w must be > 0");
  if (hasIdle && (pmaxWatts as number) < (pidleWatts as number)) {
    throw new Error("--pmax-w must be >= --pidle-w");
  }
  if (values.tdp && (!Number.isFinite(tdp as any) || (tdp as number) <= 0)) {
    throw new Error("--tdp must be > 0");
  }

  const durationSeconds = parsePositiveNumberFromCommand('--duration', values.duration, 10);
  const tickMs = parsePositiveNumberFromCommand('--tick', values.tick, 1000);
  const emissionFactor = parsePositiveNumberFromCommand('--ef', values.ef, 475);

  const debugTiming = !!values.debugTiming;
  const jsonOutput = !!values.json;
  const keepAlive = !!values.keepAlive;

  const controller = new AbortController();

  let child: import("node:child_process").ChildProcess | null = null;
  let pid: number;

  if (values.spawn) {
    child = await spawnTarget(values.spawn);

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

  const samplers = await createSamplers(pid, {
    tdpWatts: values.tdp ? (tdp as number) : undefined,
    pidleWatts:hasIdle ? (pidleWatts as number) : undefined,
    pmaxWatts:hasMax ? (pmaxWatts as number) : undefined
  });

  //--- optionnal context in verbose mode


  if (verbose) {
    const comm = await tryReadProcComm(pid);
    if (comm) console.log(`Target comm: ${comm}`);
    const er = samplers.energyReader;
    if (er?.status) console.log(`Energy reader: ${er.status}`);
    if (er?.hint) console.log(`Energy hint ${er.hint}`);
    console.log(`Emission factor: ${emissionFactor} gCO2e/kWh`);
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
  console.log("\nCPU Energy Audit (bounded)");
  console.log("\n--------------------------\n");
  console.log(`PID: ${result.pid}`);
  console.log(`Duration: ${result.durationSeconds.toFixed(2)} s`);
  console.log("\n---------ENERGY-----------\n");
  console.log(`Host CPU energy: ${result.hostCpuEnergyJoules.toFixed(3)} J`);
  console.log(`Process CPU energy: ${result.processCpuEnergyJoules.toFixed(3)} J`);
  console.log(`Process energy share: ${(result.processCpuEnergyShare * 100).toFixed(2)} %`);
  console.log("\n-----------POWER----------\n");
  console.log(`Average CPU Power:`);
  console.log(`Host avg CPU power: ${result.hostCpuEnergyJoules / result.durationSeconds} W`);
  console.log(`Process avg CPU power: ${result.processCpuEnergyJoules / result.durationSeconds} W`);
  console.log("\n-----------CARBON---------\n");
  console.log(`CPU Carbon Footprint:`);
  console.log(`Emission Factor country:Global, factor:475`);
  console.log(`Host CPU carbon footprint: ${result.hostCpuCarbon_gCO2e.toFixed(6)} gCO2e`);
  console.log(`Process CPU carbon footprint: ${result.processCpuCarbon_gCO2e.toFixed(6)} gCO2e`);
  console.log("\n--------------------------\n");
  console.log(`Process active: ${result.isActive ? "yes" : "no"}`);
  if (debugMeta && (result as any).meta) {
    console.log("\nDebug meta:");
    console.log(JSON.stringify((result as any).meta, null, 2));
  }
}