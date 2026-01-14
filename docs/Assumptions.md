## Assumptions & Known Biases

This section lists the explicit assumptions made by the methodology and the known sources of bias or uncertainty.

The goal is not to eliminate uncertainty, but to **make it visible and understandable**.

---

### Explicit Assumptions

#### CPU-Centric Model

The methodology assumes that:
- CPU activity is a meaningful proxy for a significant part of runtime energy consumption
- CPU electricity consumption can be attributed proportionally to CPU usage

Non-CPU components are intentionally excluded.

---

#### Proportional Attribution

Energy attribution assumes a **linear relationship** between:
- CPU active time (jiffies)
- CPU electrical energy consumption

This assumes that:
- power variations correlate with activity level
- frequency scaling effects average out over the sliding window

---

#### Process Scheduling Fairness

The model assumes:
- OS scheduling distributes CPU time fairly across runnable processes
- CPU active time reflects real execution work

Scheduling anomalies may introduce short-term deviations.

---

#### Emission Factor Representativeness

The carbon estimation assumes:
- the configured emission factor represents the electricity actually consumed
- the factor remains constant over the measurement window

Temporal variations of grid carbon intensity are not modeled.

---

### Known Sources of Bias

#### CPU Frequency Scaling (DVFS)

Modern CPUs dynamically adjust frequency and voltage.

Effects:
- energy per jiffy is not constant
- short bursts at high frequency may consume more energy

Mitigation:
- sliding window aggregation
- reliance on measured energy (RAPL), not estimated power

---

#### Background System Activity

Host energy includes:
- kernel tasks
- background services
- other user processes

Only a proportional share is attributed to the target process.

This may:
- slightly overestimate or underestimate process energy
- reflect real system contention

---

#### Idle Power Baseline

Idle CPU power is not attributed to processes.

As a result:
- background idle energy is excluded from process attribution
- process energy reflects **incremental activity**, not baseline system cost

This is a deliberate design choice.

---

#### Counter Granularity

- CPU ticks (jiffies) are coarse-grained
- Very short-lived processes may register zero activity

Mitigation:
- sliding window aggregation
- explicit `processActive` flag

---

#### RAPL Limitations

RAPL measures:
- package-level energy
- CPU-related domains only

Limitations:
- does not capture all system components
- may be unavailable or imprecise on some hardware

If RAPL is unavailable, energy attribution cannot be performed.

---

### Interpretation Implications

Due to these assumptions and biases:

- Results should be interpreted as **orders of magnitude**
- Comparisons are more reliable than absolute values
- Short measurements are less reliable than aggregated ones

The methodology favors **conservative attribution** over optimistic estimates.

---

### Non-Addressed Biases

The following aspects are explicitly not addressed:

- Memory energy modeling
- I/O energy attribution
- Network-related emissions
- Hardware embodied carbon
- Cooling and infrastructure overhead

These can only be addressed with broader system models.

---

### Summary

This methodology:
- makes its assumptions explicit
- limits attribution to what can be measured
- avoids speculative extrapolation
- prioritizes transparency over completeness

It is designed to be **understood, questioned, and improved**, not treated as a black box.

---

