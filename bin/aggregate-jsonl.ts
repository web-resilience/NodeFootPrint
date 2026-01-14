import fs from "node:fs";
import readline from "node:readline/promises";
import path from "node:path";

/* ---------- config ---------- */

const WINDOW_SECONDS = 60;

/* ---------- helpers ---------- */

function createEmptyWindow(pid: number) {
  return {
    pid,
    startTs: null as string | null,
    endTs: null as string | null,
    durationSeconds: 0,

    samples: 0,

    processEnergyJoules: 0,
    processEnergyKwh: 0,
    carbon_gCO2e: 0,
  };
}

function flushWindow(win: ReturnType<typeof createEmptyWindow>) {
  if (win.samples === 0) return null;

  return {
    window: {
      start: win.startTs,
      end: win.endTs,
      durationSeconds: win.durationSeconds,
      samples: win.samples,
    },
    process: {
      pid: win.pid,
      energyJoules: Number(win.processEnergyJoules.toFixed(6)),
      energyKwh: Number(win.processEnergyKwh.toFixed(9)),
    },
    carbon: {
      emissions_gCO2e: Number(win.carbon_gCO2e.toFixed(6)),
    },
    quality: {
      source: "online-attribution",
    },
  };
}

/* ---------- input ---------- */

const file = path.resolve(import.meta.dirname, "..", "metrics.raw.jsonl");
const input = fs.createReadStream(file, { encoding: "utf-8" });

const rl = readline.createInterface({
  input,
  crlfDelay: Infinity,
});

/* ---------- state ---------- */

let currentWindow: ReturnType<typeof createEmptyWindow> | null = null;
let windowStartTsSec: number | null = null;

/* ---------- main loop ---------- */

for await (const line of rl) {
  if (!line.trim()) continue;

  let data: any;
  try {
    data = JSON.parse(line);
  } catch {
    continue;
  }

  if (
    !data.timestamp ||
    !data.process?.pid ||
    typeof data.process.energyJoules !== "number" ||
    typeof data.carbon?.emissions?.value !== "number"
  ) {
    continue;
  }

  const tsSec = new Date(data.timestamp).getTime() / 1000;

  if (windowStartTsSec === null) {
    windowStartTsSec = tsSec;
    currentWindow = createEmptyWindow(data.process.pid);
    currentWindow.startTs = data.timestamp;
  }

  if (tsSec - windowStartTsSec >= WINDOW_SECONDS) {
    const out = flushWindow(currentWindow!);
    if (out) {
      console.log(JSON.stringify(out));
    }

    windowStartTsSec = tsSec;
    currentWindow = createEmptyWindow(data.process.pid);
    currentWindow.startTs = data.timestamp;
  }

  if (!currentWindow) continue;

  /* ---------- accumulate ---------- */

  currentWindow.endTs = data.timestamp;
  currentWindow.samples += 1;

  const dt = typeof data.intervalSeconds === "number"
    ? data.intervalSeconds
    : 0;

  currentWindow.durationSeconds += dt;

  currentWindow.processEnergyJoules += data.process.energyJoules;
  currentWindow.processEnergyKwh += data.process.energyJoules / 3_600_000;
  currentWindow.carbon_gCO2e += data.carbon.emissions.value;
}

/* ---------- flush last window ---------- */

if (currentWindow) {
  const out = flushWindow(currentWindow);
  if (out) {
    console.log(JSON.stringify(out));
  }
}
