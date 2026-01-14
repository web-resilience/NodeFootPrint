## Example Audit Walkthrough

This section provides a step-by-step walkthrough of a real audit scenario using the application output.

The objective is to explain **how to interpret the measurements**, not just how to read the numbers.

---

### Scenario

We audit a running process with PID `67836` on a Linux system.

- Sampling period: ~1 second
- Sliding window size: 7 samples
- Energy source: RAPL (CPU package)
- Emission factor: Global average electricity mix (475 gCO₂e/kWh)

---

### Step 1 — Raw Host Measurements

From the API output:

```json
"rapl": {
  "hostEnergyJoules": {
    "value": 5.669,
    "unit": "J"
  }
}
```
This means:

- During the last sampling interval (~1 second)

- The CPU package consumed 5.669 joules of electrical energy

**This is a measured value, not an estimate.**
---
### Step 2 — Host CPU Activity

```json
"cpu": {
  "cpuTicks": {
    "deltaActiveTicks": "26",
    "deltaIdleTicks": "1167",
    "deltaTotalTicks": "1193"
  }
}
```
- The CPU was mostly idle during this interval

- Only 26 jiffies were spent doing active work

- This reflects a lightly loaded system
  
---
### Step 3 — Process CPU Activity
```json
"windowCpuTicks": {
  "hostActive": "381",
  "processActive": "37"
}
```
Over the sliding window:

- Total host active CPU time: 381 jiffies

- Process active CPU time: 37 jiffies

This indicates that the process contributed a non-trivial but limited share of CPU work.
---
### Step 4 — CPU Share Attribution
The CPU share is computed as:
```sh
cpuShare = processActiveTicks / hostActiveTicks
         = 37 / 381
         ≈ 0.097
```
Api Output:
```json
    "cpuShare": 0.09711286089238845
```
This means:

- Over the window, the process accounted for ~9.7% of the CPU active time.
---

### Step 5 — Energy Attribution
The host energy aggregated over the window:
```json
"windowEnergy": {
  "hostJoules": 49.753
}
```
The process energy attribution:
```sh
processEnergyJoules = cpuShare × hostEnergyJoules
                    ≈ 0.097 × 49.753
                    ≈ 4.83 J
```
Which matches:
```json
"energyJoules": 4.831656167979003
```
This value represents:

- The electrical energy consumed by the CPU while executing this process over the window.

Idle CPU energy is not attributed.
---
### Step 6 — Carbon Estimation

Energy conversion:
```sh
energy_kWh = 4.831656 / 3,600,000
           ≈ 0.00000134 kWh


# Carbon estimation:

carbon_gCO2e = energy_kWh × emissionFactor
             ≈ 0.00000134 × 475
             ≈ 0.00064 gCO2e

```
This represents:

- The operational carbon emissions caused by the CPU activity of the process during the window.
---
### Step 7 — Interpretation

#### Key takeaways:

- The process is active, but not CPU-bound

- Energy and carbon values are very small, as expected for short runtimes

- Results are proportional and conservative

- Attribution is based on measured energy, not theoretical power

#### Common Pitfalls to Avoid

- Interpreting the value as a full application footprint

- Extrapolating to long durations without aggregation

- Comparing results across machines without context

- Treating small values as insignificant (they add up over time)

#### When This Walkthrough Is Useful

- Explaining results to non-experts

- Validating a deployment or refactor

- Comparing two implementations

- Teaching energy-aware development practices

#### Summary

This walkthrough demonstrates how:

- Low-level system metrics

- Real energy measurements

- Conservative attribution

- Explicit assumptions

Combine to produce interpretable and auditable results.

The methodology favors clarity and correctness over completeness.