# Carbon Footprint Model (CPU-only)
## Purpose

This document describes how the application estimates the carbon footprint of a process (PID) based on its CPU electricity consumption.

The objective is to provide a transparent, reproducible and defensible estimate, suitable for audits and comparisons, not a full lifecycle assessment.
---
## Scope

This carbon model applies only to CPU electricity consumption attributed to a process.

It includes:

- CPU electrical energy measured at host level

- Energy attributed to a process proportionally to its CPU activity

- Conversion to carbon emissions using an electricity emission factor

- It does not include:

- Memory (RAM) consumption

- Storage or disk I/O

- Network usage

- GPU usage

- Cooling overhead

- Embodied emissions (hardware manufacturing)

- Data center infrastructure (PUE, building, etc.)
---

## Input Data

All values are computed over a sliding window of samples.

### Process Energy

- process.energyJoules
Electrical energy attributed to the process CPU usage.

Unit: joules (J)

This value is obtained by:

- measuring host CPU energy (RAPL)

- attributing a share to the process based on CPU activity

- aggregating over a sliding window

### Electricity Emission Factor

- emissionFactor
Carbon intensity of electricity production.

Unit: grams of CO₂ equivalent per kilowatt-hour (gCO₂e/kWh)

This factor is external to the measurement and must be:

- provided explicitly

- documented

- configurable

Typical reference values (order of magnitude):

- France (low-carbon mix): ~40–60 gCO₂e/kWh

- EU average: ~230–300 gCO₂e/kWh

- Global average: ~400–500 gCO₂e/kWh

---
## Conversion Formula
### Energy Conversion

Electricity emission factors are expressed per kilowatt-hour, therefore the energy must be converted:

energy_kWh = energyJoules / 3,600,000

(1 kWh = 3.6 MJ)

### Carbon Estimation

The carbon footprint is computed as:

carbon_gCO2e = energy_kWh × emissionFactor


Or equivalently:

carbon_gCO2e = (energyJoules / 3,600,000) × emissionFactor

### Output

The carbon estimation output contains:

- energy_kWh
Process energy converted to kilowatt-hours

- carbon_gCO2e
Estimated carbon emissions

Both values correspond strictly to CPU electricity usage only.
---
## Interpretation Notes

- A carbon value of 0 indicates no CPU activity over the window, not the absence of a process.

- Very small values are expected for short-lived or idle processes.

- Results are proportional to the selected emission factor.

This model estimates operational emissions only, not total environmental impact.
---
## Limitations

This model:

- does not represent total application footprint

- does not account for non-CPU components

- does not extrapolate automatically over time

- does not normalize per request or per user

It is intentionally minimal and conservative.
---

## Design Rationale

This model was chosen because it is:

- based on real energy measurements

- explicit about assumptions

- reproducible across environments

- compatible with audit and eco-design workflows

- free of hidden coefficients or heuristics

More advanced carbon models can be layered on top without breaking this contract.

## Summary

The carbon footprint estimation is computed by:

- Measuring CPU energy at host level

- Attributing a proportional share to a process

- Converting energy from joules to kWh

- Applying a configurable electricity emission factor

**The result represents CPU operational carbon emissions only.**