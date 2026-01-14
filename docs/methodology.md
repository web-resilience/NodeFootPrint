## Methodology Validation

This section explains how the methodology can be validated, verified, and interpreted, and what guarantees it provides.

---

### Internal Consistency Checks

The model enforces several invariants that can be verified at runtime or during analysis:

- `processEnergyJoules ≤ windowEnergy.hostJoules`
- `0 ≤ cpuShare ≤ 1`
- `cpuShare = Σ(processActiveTicks) / Σ(hostActiveTicks)`
- `processActive === (Σ(processActiveTicks) > 0)`

Violating any of these invariants indicates a measurement or integration error.

---

### Energy Conservation

The attribution model preserves energy conservation:

- Host energy is **measured**, not estimated
- Process energy is **a proportional share** of host energy
- No energy is created or redistributed artificially
- Idle CPU energy is **not attributed** to processes

As a result, the sum of all attributed process energies cannot exceed the measured host energy over the same window.

---

### Temporal Validation

Measurements operate on two explicit time scales:

- **Sampling interval**  
  Real elapsed time between ticks (`intervalSeconds`)

- **Internal clamped interval**  
  Used internally to stabilize low-level counters (`internalClampedDt`)

Both values are exposed separately to avoid ambiguity and allow external verification.

---

### Sliding Window Justification

CPU activity is measured in jiffies, which are coarse-grained and can produce zero deltas over short intervals.

The sliding window:

- Aggregates multiple samples
- Reduces quantization artifacts
- Preserves proportionality
- Avoids artificial smoothing of raw measurements

This approach improves attribution stability without altering the underlying physical measurements.

---

### Cross-Verification Strategies

The methodology can be validated using the following approaches:

- Compare `cpuShare` with external profilers (`top`, `htop`, `perf`)
- Run controlled CPU-bound workloads and observe linear scaling
- Run idle processes and verify near-zero attribution
- Compare host energy trends with system-level monitoring tools

These checks validate both relative correctness and order of magnitude.

---

### Hardware and Platform Dependencies

Energy measurement accuracy depends on:

- CPU support for RAPL
- Firmware and kernel exposure of energy counters
- Correct handling of counter wrap-around

If RAPL is unavailable or unreliable, energy attribution will be incomplete or disabled, but CPU activity measurements remain valid.

---

### Carbon Model Validation

The carbon estimation layer is intentionally minimal:

- Direct energy-to-carbon conversion
- No extrapolation or normalization
- No embedded regional assumptions

Validation consists of verifying:
- Correct energy unit conversion (J → kWh)
- Correct emission factor unit (gCO₂e/kWh)
- Linear proportionality between energy and emissions

---

### Reproducibility

Given the same:
- hardware
- workload
- sampling configuration
- emission factor

The methodology produces reproducible results within the limits of OS scheduling and hardware counters.

---

### Scientific and Audit Positioning

This methodology is designed to be:

- Transparent
- Conservative
- Reproducible
- Explicit about assumptions

It is suitable for:
- technical audits
- eco-design comparisons
- research and experimentation

It is **not** intended to replace full lifecycle assessments or infrastructure-level carbon accounting.

---

