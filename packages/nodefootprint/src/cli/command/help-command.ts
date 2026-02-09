export function printHelp() {
    console.log(`
Usage:
  audit --pid <pid> [--duration 10] [--tick 1000] [--ef 475] [--json] [-v|-vv]
  audit --spawn "<cmd>" [--duration 10] [--tick 1000] [--ef 475] [--json] [-v|-vv]

Options:
  --pid <pid>            Audit an existing process id
  --spawn "<cmd>"        Spawn a command and audit its PID (best for short-lived jobs)

  --pidleW <W>          Fallback idle CPU power in Watts (calibrated)
  --pmaxW <W>           Fallback max CPU power in Watts (calibrated)

  --tdp <W>              Fallback approximate mode if watts not calibrated
  
  --duration <seconds>   Audit duration (default: 10)
  --tick <ms>            Sampling period in ms (default: 1000)
  --ef <g/kWh>           Emission factor in gCO2e/kWh (default: 475)

  --keepAlive            Do not kill spawned process after audit
  --json                 Print JSON output (machine-readable)
  --debugTiming           Print scheduler timing per tick (dev)

  -v / --verbose         More info (reader mode, target comm…)
  -vv                    Adds debug meta block (raw counters)
  --debug-meta           Same as -vv
`);
}