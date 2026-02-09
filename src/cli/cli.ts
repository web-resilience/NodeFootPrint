#!/usr/bin/env node
import process from "node:process";
//import { readFile } from "node:fs/promises";
import { printHelp } from "./command/help-command.js";
import { auditCommand } from "./command/audit-command.js";

//fallback calibrated
//audit --pid 1234 --duration 10 --pidleW 3.2 --pmaxW 25 -v
//TDP non calibrate
//audit --pid 1234 --duration 10 --pidleW 3.2 --pmaxW 25 -v

const VALID_COMMANDS = new Set();

VALID_COMMANDS.add('audit');
VALID_COMMANDS.add('monitor');
VALID_COMMANDS.add('help');



async function main(argv:string[] = process.argv.slice(2)) {
    const [command = 'help',...options] = argv;
    console.log(command,options);
    console.log("============================");
    console.log("Nodefootprint v 0.0.1");
    console.log("============================\n");
    if(VALID_COMMANDS.has(command)) {
      switch(command) {
        case 'help':
          printHelp();
          break;
        case 'audit':
          await auditCommand(options);
          break;
        case 'monitor':
          console.log('monitor command');
          break;
        default:
          printHelp();
          break;
      }
    } else {
      console.log('[Message]: Invalid_command');
      printHelp();
      process.exit(1);
    }
}

await main().catch((err) => {
  console.error(err.message);
  printHelp();
  process.exit(1);
});