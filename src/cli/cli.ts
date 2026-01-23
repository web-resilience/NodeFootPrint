#!/usr/bin/env node
import process from "node:process";
//import { readFile } from "node:fs/promises";
import { printHelp } from "./command/help-command.js";
import { auditCommand } from "./command/audit-command.js";

//fallback calibrated
//audit --pid 1234 --duration 10 --pidleW 3.2 --pmaxW 25 -v
//TDP non calibrate
//audit --pid 1234 --duration 10 --pidleW 3.2 --pmaxW 25 -v

async function main(argv:string[] = process.argv.slice(2)) {
    console.log("============================");
    console.log("Nodefootprint v 0.0.1");
    console.log("============================\n");
    await auditCommand(argv);
}

await main().catch((err) => {
  console.error(err);
  process.exit(1);
});