#!/usr/bin/env node
import process from "node:process";
import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { splitCommand } from "./splitCommand.js";
import { audit } from "../audit/audit.js";

import { createEnergyReader } from "../sensors/rapl/enregyReader.js";
import { CpuReader } from "../sensors/cpus/CpuReader.js";
import { ProcessCpuReader } from "../sensors/cpus/ProcessCpuReader.js";
import { raplProbe } from "../sensors/rapl/rapl-probe.js";


// --------------------------------------------------
// capteurs communs
// --------------------------------------------------

async function createSamplers(pid: number) {
    const probe = await raplProbe();
  return {
    energyReader: createEnergyReader({
        probe
    }),
    cpuReader: new CpuReader({}),
    processCpuReader: new ProcessCpuReader({pid}),
  };
}


async function killGracefully(child: import("node:child_process").ChildProcess, timeoutMs = 2000) {
  if (!child.pid) return;
  if (child.exitCode !== null) return;

  try {
    child.kill("SIGTERM");
  } catch {
    return;
  }

  const exited = once(child, "exit").then(() => true).catch(() => true);
  const timedOut = new Promise<boolean>((resolve) =>
    setTimeout(() => resolve(false), timeoutMs)
  );

  const ok = await Promise.race([exited, timedOut]);

  if (!ok && child.exitCode === null) {
    try {
      child.kill("SIGKILL");
    } catch {}
  }
}

function spawnTarget(commandStr:string) {
const argv = splitCommand(commandStr);

  if (argv.length === 0) {
    throw new Error("--spawn: command is empty");
  }

  const [cmd, ...args] = argv;

  console.log(cmd,args)

  //  IMPORTANT : PAS de shell ici -> PID correct
  const child = spawn(cmd, args, {
    stdio: "inherit",
  });

  return child;
}


export async function auditCommand(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args:argv,
    options:{
      pid:{type:"string"},
      spawn:{type:"string"},

      duration:{type:"string"},
      tick:{type:"string"},

      debugTiming:{type:"boolean"},
      keepAlive:{type:"boolean"}
    }
  });

  const durationSeconds = values.duration ? Number(values.duration) : 10;
  const tickMs = values.tick ? Number(values.tick) : 1000;
  const debugTiming = !!values.debugTiming;

  if(!Number.isFinite(durationSeconds) || durationSeconds <= 0n) {
    throw new Error("--duration must be > 0");
  }

  if(!Number.isFinite(tickMs) || tickMs <= 0n) {
    throw new Error("--tick must be > 0");
  }

  const controller = new AbortController();

  let child:import("node:child_process").ChildProcess | null = null;
  let pid:number;

  if(values.spawn) {
    child = spawnTarget(values.spawn);

    if(!child?.pid) {
      throw new Error("spawn failed: missing pid");
    }
    pid = child.pid;

    child.once("exit", () => controller.abort());
    child.once("error", () => controller.abort());

    process.once("SIGINT", async () => {
      controller.abort();
      //kill gracefully
      await killGracefully(child!,1500);
      process.exit(130);
    });
  } else if (values.pid) {
    pid = Number(values.pid);
    if(!Number.isFinite(pid) || pid <= 1) {
      throw new Error("--pid must be a valid process id");
    }
  } else {
    throw new Error("Missing target: use --pid <pid> or --spawn \"cmd\"");
  }

  const samplers = await createSamplers(pid);

  // run audit

  const result = await audit({
    pid,
    durationSeconds,
    tickMs,
    samplers,
    emissionFactor_gCO2ePerKWh:475,
    debugTiming,
    signal:controller.signal
  });

  if(child && !values.keepAlive) {
    //kill
    await killGracefully(child, 2000);
  }

   // 5) afficher résultat
  console.log("\nCPU Energy Audit (bounded)");
  console.log("--------------------------");
  console.log(`PID: ${result.pid}`);
  console.log(`Duration: ${result.durationSeconds.toFixed(2)} s`);
  console.log(`Host CPU energy: ${result.hostCpuEnergyJoules.toFixed(3)} J`);
  console.log(`Process CPU energy: ${result.processCpuEnergyJoules.toFixed(3)} J`);
  console.log(`Process energy share: ${(result.processCpuEnergyShare * 100).toFixed(2)} %`);
  console.log(`Carbon footprint: ${result.carbon_gCO2e.toFixed(6)} gCO2e`);
  console.log(`Process active: ${result.isActive ? "yes" : "no"}`);

}

await auditCommand();