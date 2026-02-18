# NodeFootPrint
![Node.js CI](https://github.com/web-resilience/NodeFootPrint/actions/workflows/nodeFootPrint.yaml/badge.svg)

# nodefootprint

> **CPU energy auditing for Node.js processes on Linux.**  
> Measure real CPU energy consumption and carbon footprint of any process, by PID or by spawning a command.

---

## What it does

`nodefootprint` measures the **CPU energy** consumed by a specific process over a given duration, and converts that into a **carbon footprint** (gCO2e).

It reads energy directly from the Linux RAPL hardware interface when available, and falls back to an empirical estimation model (based on CPU load × power profile) when RAPL is not accessible (VMs, unprivileged containers, AMD systems without RAPL exposure).

### Scope

| Measured | Not measured (yet) |
|---|---|
| ✅ CPU energy (host + process share) | ❌ RAM |
| ✅ Process CPU attribution via `/proc` | ❌ Network I/O |
| ✅ Carbon footprint (gCO2e) | ❌ Disk I/O |
| ✅ RAPL hardware source or empirical fallback | ❌ GPU |

---

## Requirements

- **Linux** (uses `/proc/stat`, `/proc/<pid>/stat`, `/sys/class/powercap`)
- **Node.js** >= 18 (ESM, `BigInt`, `node:util/parseArgs`)
- For RAPL: Intel or AMD CPU with powercap exposed, readable `energy_uj` files  
  (may require `sudo` or `chmod o+r /sys/class/powercap/*/energy_uj`)

---

## Installation

```bash
npm install -g @nodefootprint/cli
```

Or as a dev dependency in your project:

```bash
npm install --save-dev @nodefootprint/core
```

---

## CLI Usage

### Audit an existing process by PID

```bash
nodefootprint audit --pid 1234 --duration 10
```

### Spawn and audit a command

```bash
nodefootprint audit --spawn "node my-script.js --iterations 1000000" --duration 30
```

### With an empirical fallback (when RAPL is unavailable)

```bash
# Recommended: provide measured idle/max power for your CPU
nodefootprint audit --pid 1234 --pidleW 8 --pmaxW 65 --duration 10

# Or use TDP as a rough estimate
nodefootprint audit --pid 1234 --tdp 65 --duration 10
```

### Use a config file

```bash
nodefootprint audit --pid 1234 --config ./nodefootprint.config.json
```

---

## Configuration file

`nodefootprint.config.json`

```json
{
  "emissionFactor": {
    "country": "FR",
    "factor": 52
  },
  "fallback": {
    "pidleWatts": 8,
    "pmaxWatts": 65
  }
}
```

The emission factor defaults to **475 gCO2e/kWh** (EU average) if not specified.  
France-specific value: ~52 gCO2e/kWh (nuclear-heavy grid).

---

## CLI Options

| Option | Description | Default |
|---|---|---|
| `--pid <n>` | Target process PID | — |
| `--spawn "<cmd>"` | Spawn and monitor a command | — |
| `--duration <s>` | Audit duration in seconds | `10` |
| `--tick <ms>` | Sampling interval in milliseconds | `1000` |
| `--pidleW <w>` | CPU idle power in Watts (fallback) | — |
| `--pmaxW <w>` | CPU max power in Watts (fallback) | — |
| `--tdp <w>` | CPU TDP in Watts (coarse fallback) | — |
| `--ef <gCO2e/kWh>` | Emission factor override | `475` |
| `--config <path>` | Path to config file | `nodefootprint.config.json` |
| `--json` | Output raw JSON result | `false` |
| `-v` / `--verbose` | Show energy source and parameters | — |
| `-vv` | Verbose + debug metadata | — |
| `--debug-meta` | Show raw tick metadata | — |
| `--debug-timing` | Show per-tick scheduler timing | — |
| `--keep-alive` | Don't kill spawned process after audit | `false` |

---

## Example output

```
Starting audit for PID:12345...please wait
==============================

CPU Energy Audit (bounded)

--------------------------

18/01/2025
PID: 12345
Duration: 10.02 s

---------ENERGY-----------

Source: rapl
Host CPU energy: 48.321 J
Process CPU energy: 3.217 J
Process energy share: 6.66 %

-----------POWER----------

Average CPU Power:
Host avg CPU power: 4.822 W
Process avg CPU power: 0.321 W

-----------CARBON---------

CPU Carbon Footprint:
Emission Factor: 475 gCO2e/kWh
Host CPU carbon footprint: 0.006378 gCO2e
Process CPU carbon footprint: 0.000425 gCO2e

--------------------------

Process active: yes

--------------------------
nodefootprint v.0.0.1
```

---

## Programmatic API

```typescript
import { audit, createSamplers } from "@nodefootprint/core";

const samplers = await createSamplers(pid, {
  pidleWatts: 8,
  pmaxWatts: 65,
});

const result = await audit({
  pid: 1234,
  durationSeconds: 10,
  tickMs: 1000,
  samplers,
  emissionFactor_gCO2ePerKWh: 52,
  debugTiming: false,
});

console.log(`Process CPU energy: ${result.processCpuEnergyJoules.toFixed(3)} J`);
console.log(`Carbon: ${result.processCpuCarbon_gCO2e.toFixed(6)} gCO2e`);
```

---

## How it works

```
/sys/class/powercap  ──► RaplReader      ─┐
                                           ├──► EnergyReader
CPU power profile    ──► EmpiricalReader  ─┘         │
                                                      │
/proc/stat           ──► CpuReader                    │
/proc/<pid>/stat     ──► ProcessCpuReader             │
                                                      │
                         Scheduler (fixedRateTicks) ──┤
                                                      │
                         AuditAccumulator ◄───────────┘
                                │
                         AuditResult (J, gCO2e)
```

1. **RAPL probe** — detects available powercap packages at startup
2. **EnergyReader** — uses RAPL if available, empirical model otherwise
3. **CpuReader** — reads `/proc/stat` delta ticks (host CPU load)
4. **ProcessCpuReader** — reads `/proc/<pid>/stat` delta ticks (process CPU load)
5. **Scheduler** — fixed-rate tick loop with overrun coalescing
6. **Accumulator** — sums energy deltas and tick deltas across the audit window
7. **Attribution** — `process_energy = host_energy × (process_ticks / host_ticks)`

---

## RAPL permissions

On most Linux systems, RAPL energy files require elevated permissions:

```bash
# Check if readable
ls -la /sys/class/powercap/intel-rapl:0/energy_uj

# Grant read access (requires root, resets on reboot)
sudo chmod o+r /sys/class/powercap/*/energy_uj

# Permanent fix via udev rule
echo 'SUBSYSTEM=="powercap", ACTION=="add", RUN+="/bin/chmod o+r %S%p/energy_uj"' \
  | sudo tee /etc/udev/rules.d/51-rapl.rules
```

If RAPL is unavailable, the tool automatically falls back to the empirical model.

---

## Limitations

- **Linux only** — relies on `/proc` and `/sys/class/powercap`
- **CPU only** — RAM, network, disk are not measured
- **Process attribution is statistical** — based on CPU time share, not hardware-level process isolation
- **Empirical fallback accuracy** depends on the quality of `--pidleW`/`--pmaxW` values provided; TDP mode is a coarse estimate
- **RAPL measures package power** — includes uncore components (memory controller, integrated GPU on some CPUs); the process share attribution partially mitigates this
 - No lifecycle analysis
- Host energy depends on hardware and firmware support (RAPL)
- Results should not be extrapolated without context

---

## Intended Use Cases

- Eco-design audits

- Comparing implementations

- Identifying CPU-heavy workloads

- Research and experimentation

- Educational purposes

## Non-Goals

- Full application LCA

- Cloud infrastructure accounting

- Cost estimation

- User-facing carbon labels
---

## License

MIT

**This tool estimates operational CPU emissions only.**

**Results should be interpreted as indicative, not absolute.**