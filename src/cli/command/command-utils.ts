import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";


// splitCommand.ts
export interface SplitCommandOptions {
  /**
   * If true, allow forgiving behavior in edge cases
   * (ex: tolerate single-quote escaping inside single quotes).
   */
  forgiving?: boolean;
}

type QuoteMode = "single" | "double" | null;

/**
 * Split a command string into argv tokens (safe for spawn(..., { shell:false })).
 *
 * Supports:
 * - whitespace splitting
 * - single quotes: '...'
 * - double quotes: "..."
 * - backslash escapes outside quotes and inside double quotes
 * - quotes in the middle of a token: --flag="hello world"
 * - empty quoted args: "" => ""
 *
 * Throws on unclosed quote or trailing escape.
 */
export function splitCommand(input: string, opts: SplitCommandOptions = {}): string[] {
  const forgiving = !!opts.forgiving;

  const s = input ?? "";
  const out: string[] = [];

  let buf = "";
  let quote: QuoteMode = null;

  // tokenStarted tracks empty tokens like "" (should push "")
  let tokenStarted = false;

  const isWs = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r";

  const pushToken = () => {
    if (tokenStarted) {
      out.push(buf);
      buf = "";
      tokenStarted = false;
    }
  };

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    // --- Outside quotes ---
    if (quote === null) {
      if (isWs(c)) {
        // End token
        pushToken();
        continue;
      }

      // Start quotes
      if (c === "'") {
        quote = "single";
        tokenStarted = true; // even if empty ''
        continue;
      }
      if (c === '"') {
        quote = "double";
        tokenStarted = true; // even if empty ""
        continue;
      }

      // Backslash escape outside quotes
      if (c === "\\") {
        tokenStarted = true;
        const next = s[i + 1];
        if (next === undefined) {
          throw new Error(`splitCommand: trailing escape at position ${i}`);
        }
        // Consume next char literally
        buf += next;
        i++;
        continue;
      }

      // Regular char
      tokenStarted = true;
      buf += c;
      continue;
    }

    // --- Inside single quotes ---
    if (quote === "single") {
      if (c === "'") {
        quote = null;
        // tokenStarted remains true even if empty
        continue;
      }

      // Forgiving: allow \' inside single quotes to mean literal '
      if (forgiving && c === "\\" && s[i + 1] === "'") {
        buf += "'";
        i++;
        continue;
      }

      // Everything else literal
      buf += c;
      continue;
    }

    // --- Inside double quotes ---
    if (quote === "double") {
      if (c === '"') {
        quote = null;
        continue;
      }

      // Backslash escape inside double quotes
      if (c === "\\") {
        const next = s[i + 1];
        if (next === undefined) {
          throw new Error(`splitCommand: trailing escape in double quotes at position ${i}`);
        }
        // Interpret \" \\ \n etc. as the literal escaped char
        buf += next;
        i++;
        continue;
      }

      buf += c;
      continue;
    }
  }

  if (quote !== null) {
    throw new Error(`splitCommand: unclosed ${quote} quote`);
  }

  // trailing token
  pushToken();

  return out;
}


/**
 * level : 0 | 1 | 2 
 * 0 === debug-meta (pure time debug series)
 * 1 === --verbose ou -v (human readable)
 * 2 === verbose + debug-meta 
 */

export function extractVerbosity(args:string[]) {
  let level = 0;
  let debugMetaExplicit = false;
  const rest:string[] = [];

  for(const arg of args) {
    if(arg === "--verbose") {
      level +=1;
      continue;
    }

    if(arg === "--debug-meta") {
      debugMetaExplicit = true;
      continue;
    }

    if(arg === "-v") {
      level += 1;
      continue;
    }

    if(/^-v{2,}$/.test(arg)) {
      level += arg.length - 1; // -vv
      continue;
    }

    rest.push(arg);
  }

  return { level, debugMetaExplicit, rest}
}

export async function killGracefully(child: import("node:child_process").ChildProcess, timeoutMs = 2000) {
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

export async function spawnTarget(commandStr:string) {
const argv = splitCommand(commandStr);
  if (argv.length === 0) {
    throw new Error("--spawn: command is empty");
  }
  const [cmd, ...args] = argv;

  //most generic solution using which spawn('which',[node,args])
  const executable = cmd === "node" ? process.execPath : cmd;

  //  IMPORTANT : NO SHELL HERE -> correct PID
  const child = spawn(executable, args,{
    cwd:undefined,
    shell:false,
    stdio:'inherit'
  });
  await new Promise<void>((resolve,reject) => {
    child.once('spawn', () =>  resolve());
    child.once('error', (error) => reject(error));
  })
  return child;
}

export function parsePositiveNumberFromCommand(name:string,v:string | undefined,fallback:number) {
  const n = v === undefined ? fallback : Number(v);
  if(!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return n;
}

export async function tryReadProcComm(pid:number) {
  try {
    const comm = await readFile(`/proc/${pid}/comm`,"utf-8");
    return comm.trim();
  } catch (error) {
    return null;
  }
}