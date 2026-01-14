# NodeFootPrint
![Node.js CI](https://github.com/web-resilience/NodeFootPrint/actions/workflows/nodeFootPrint.yaml/badge.svg)

# Runtime Energy & Carbon Profiler (CPU-only)

## Overview

This application measures and estimates the **CPU electricity consumption** of a running system and attributes a proportional share of this energy to a **specific process (PID)**.

Based on this attribution, it computes an **estimated carbon footprint** using a configurable electricity emission factor.

The tool is designed for **eco-design audits, technical analysis, and experimentation**, not for full lifecycle assessments.

---

## Objectives

- Measure **real CPU energy consumption** at host level
- Attribute energy consumption to a process based on **actual CPU activity**
- Stabilize attribution using a **sliding window**
- Estimate **CPU-related carbon emissions** transparently
- Provide **auditable and reproducible** results

---

## Scope

### Included

- CPU electricity consumption
- Host-level energy measurement (RAPL)
- Process-level CPU activity (`/proc/<pid>/stat`)
- Energy attribution based on CPU usage
- Carbon estimation from electricity usage

### Excluded

- Memory (RAM) consumption
- Disk / storage I/O
- Network activity
- GPU usage
- Screen or peripheral energy
- Cooling overhead
- Embodied emissions (hardware manufacturing)
- Data center infrastructure (PUE, buildings, etc.)

---

## Architecture Overview

```text
/proc/stat ──► CPU host activity
/proc/<pid>/stat ──► Process CPU activity
RAPL ──► Host CPU energy (J)

CPU activity + Energy
│
▼
Sliding Window Attribution
│
▼
Process Energy (J)
│
▼
Carbon Estimation (gCO₂e)
```
---
```yaml

---

## Measurement Model

### CPU Activity (Host)

- Source: `/proc/stat`
- Unit: **jiffies**
- Metrics:
  - active ticks
  - idle ticks
  - total ticks

---

### CPU Activity (Process)

- Source: `/proc/<pid>/stat`
- Metrics:
  - `utime + stime`
- Unit: **jiffies**
- Process restarts are detected using `starttime`

---

### Energy Measurement (Host)

- Source: **RAPL**
- Unit: **joules (J)**
- Aggregated across CPU packages
- Handles counter wrap-around
- Measured per sampling interval

---

## Sliding Window Attribution

Energy attribution is stabilized using a **sliding window of N samples**.

### Attribution Formula

For each window:

cpuShare = Σ(processActiveTicks) / Σ(hostActiveTicks)
processEnergyJoules = cpuShare × Σ(hostEnergyJoules)



### Rationale

- Avoids zero values caused by coarse jiffy granularity
- Preserves energy conservation
- Reflects actual CPU scheduling behavior
- Reduces noise without smoothing raw measurements

---

## Carbon Footprint Model (CPU-only)

### Energy Conversion

energy_kWh = energyJoules / 3,600,000

(1 kWh = 3.6 MJ)

### Carbon Estimation Formula

carbon_gCO2e = energy_kWh × emissionFactor_gCO2e_per_kWh


---

### Emission Factor

- Unit: **gCO₂e / kWh**
- Provided externally (configuration)
- Examples (order of magnitude):
  - France: ~40–60 gCO₂e/kWh
  - EU average: ~230–300 gCO₂e/kWh
  - Global average: ~400–500 gCO₂e/kWh

---

## Output Data Model (Simplified)

```json
{
  "process": {
    "pid": 1234,
    "cpuShare": 0.12,
    "energyJoules": 4.83,
    "processActive": true
  },
  "carbon": {
    "energy_kWh": 0.00000134,
    "emissions_gCO2e": 0.000067
  }
}
```

## Interpretation Guidelines

- A zero value indicates no CPU activity, not absence of a process

- Very small carbon values are expected for short-lived workloads

- Results are proportional to:

  - CPU usage

  - host energy consumption

  - emission factor

**This tool estimates operational CPU emissions only.**
---
## Limitations

- CPU-only model

- No network or memory attribution

- No lifecycle analysis

- Host energy depends on hardware and firmware support (RAPL)

- Results should not be extrapolated without context
---

## Design Principles

- Measurement before estimation

- Explicit assumptions

- No hidden coefficients

- Conservative attribution

- Reproducible results

- Separation of concerns
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

## License & Disclaimer

This tool provides estimates based on measurable CPU activity and electricity emission factors.

**Results should be interpreted as indicative, not absolute.**