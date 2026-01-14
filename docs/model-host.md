# Global energy attribution

## CPU → Energy Attribution Model

### purpose

This document describes the baselines model used to attribute CPU enregy consumption to CPU activity over sampling interval.

The goal is not to measure exact per-process or per-languages energy usage, but provide a **transparent**, **explanable**, **comparable** attribution model suitable for energy audits and runtime analysis.
---

## Scope and Intent

- The model operate at **host CPU level**
- It relies on:
  - CPU activity counter from `/proc/stat`
  - Energy measurements from **RAPL** (when available)
- The model attributes energy proportionally, not causally

this is an **audit model**, not a physical simulation
---

## Input signals

All inputs are collected over the same sampling period or interval

### CPU ACTIVITY (/proc/stat)

CPU activity is expresssed in **kernel ticks(jiffies)**:
- `deltaActiveTicks`: CPU  time spent executing non-idle work
- `deltaIdleTicks`: CPU time spent idle or waiting
- `totalActiveTicks`: Total CPU ticks over interval (`deltaActiveTicks + deltaIdleTicks`)
- Unit: `jiffies` depends on USER_HZ usually 100 on linux

---

### CPU Energy (from RAPL)

- `deltaEnergyJ`: Total CPU package energy consummed over the interval
- Unit:joule (J)

nota: we can derivate powerW fom = daltaEnergyJ / deltaT
---

### Time references

- `intervalSeconds`: Wall-clock duration of sampling interval
- Unit:second(s)
---

### Attribution:

The total CPU energy consumed over the interval is attributed proportionally to CPU activity states.

#### Core Assumption

    Over a short interval, CPU energy consumption is proportional to the distribution of CPU active vs idle time.

This yields a simple and explainable attribution.

#### formula:

E_total = total CPU energy
T_active = active CPU ticks
T_idle = idle CPU Ticks
T_total = total CPU Ticks

activeEnergyJ = E_total * (T_active / T_total)
idleEnergyJ = E_total * (T_idle / T_total)

activeRatio = T_active / T_total
idleRatio = T_idle / T_total

--- 

### output

The model produces the fallowing derived values

- activeEnergyJ: Estimated energy attributed to active CPU work
- idleEnergyJ: Estimated energy attributed to idle CPU time
- activeRatio: Fraction of CPU activity that was active
- idleRatio: Fraction of CPU activity that was idle

All derived values are **purely attributive**.
---

### Invariants

The model enforces the following invariants:

- deltaActiveTicks + deltaIdleTicks === deltaTotalTicks

- activeEnergyJ + idleEnergyJ === deltaEnergyJ

-  All ratios are in the range [0, 1]

Violation of these invariants indicates:

- a measurement error,

- a synchronization issue,

- or a limitation of the model.

---

### Limitations

This model does not:

- Measure per-process or per-thread energy

- - Distinguish user code from kernel activity

Model CPU C-states or DVFS explicitly

- Claim physical causality

**It is a first-order attribution model, not a hardware-level power model.

