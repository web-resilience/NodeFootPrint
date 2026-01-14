# Host → Process (PID) Energy Attribution Model
## Purpose

This document describes the model used to attribute a share of the host CPU energy consumption to a specific process (PID).

The objective is to estimate the energy footprint of an application based on its actual CPU activity, while preserving a global view of host consumption.

This is an attribution model, not a direct physical measurement.
---
## Scope and Intent

The model operates on a Linux host

- It attributes CPU energy only

- It does not attempt to measure:

  - per-thread energy

  - GPU, disk, or network energy

- kernel or interrupt-specific energy

The goal is to provide a transparent and reproducible estimate suitable for audits and comparisons.
---
## Input Signals

All inputs are collected over the same sampling interval.

### Host CPU Activity (from /proc/stat)

deltaActiveTicks_host:
Total active CPU ticks on the host

deltaTotalTicks_host:
Total CPU ticks on the host

Unit: jiffies

## Host CPU Energy (from RAPL)

deltaEnergyJ_host:
Total CPU package energy consumed by the host

Unit: joules (J)

## Process CPU Activity (from /proc/[pid]/stat)

deltaActiveTicks_pid:
CPU time spent by the process (user + system)

Unit: jiffies

## Time Reference

intervalSeconds:
Wall-clock duration of the sampling interval

Unit: seconds (s)

## Attribution Principle

The energy consumed by the host CPU over the interval is attributed to processes proportionally to their CPU activity.

### Core Assumption

Over a short interval, CPU energy consumption is proportional to the distribution of CPU execution time across processes.

This assumption allows consistent attribution without relying on per-core or per-thread power models.

### Attribution Formula


E_host = total host CPU energy (J)

T_host_active = host active CPU ticks

T_pid = process active CPU ticks

Then:

processEnergyJ =
  E_host × (T_pid / T_host_active)


Derived ratio:

processCpuShare = T_pid / T_host_active

### Invariants

The following invariants must hold:

T_pid ≥ 0

T_host_active > 0

processCpuShare ∈ [0, 1]

If T_host_active == 0, attribution is undefined and must be skipped.

### Interpretation Notes

This model attributes only CPU energy

- It does not imply causality at instruction level

- Idle CPU energy is not attributed to any process

The sum of all process-attributed energies may be less than total host energy

- Unattributed energy represents:

  - baseline CPU power

  - idle states

  - kernel and interrupt activity

  - system services outside observed PIDs

## Limitations

This model does not:

- Measure real per-process power draw

- Account for CPU frequency scaling explicitly

- Attribute energy during idle-only intervals

- Include non-CPU components

It is a first-order approximation designed for auditability, not hardware simulation.

### Design Rationale

This model was chosen because it is:

- Simple

- Deterministic

- Explainable

- Comparable across runs

- Compatible with Linux primitives

More advanced attribution models can be layered on top without breaking this contract.

## Position in the Architecture

- Readers provide raw CPU ticks and energy

- The main loop synchronizes samples

- This attribution logic lives in the analysis layer

- **No attribution occurs in readers or samplers**

## Summary

The Host → PID attribution model provides a clear and defensible method to estimate per-process CPU energy usage:

- Based on real CPU activity

- Anchored to measured host energy

- Explicit about assumptions and limitations

It is intended as a foundation, not a final truth.