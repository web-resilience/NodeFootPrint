// src/audit/AuditAccumulator.ts

export interface AccumulatorSample {
  hostCpuEnergyJoules?: number;
  hostCpuActiveTicks?: bigint;
  processCpuActiveTicks?: bigint;
}

export interface AccumulatorTotals {
  durationSeconds: number;
  hostCpuEnergyJoules: number;
  totalHostCpuActiveTicks: bigint;
  totalProcessCpuActiveTicks: bigint;
}

export class AuditAccumulator {
  readonly startTimeNs: bigint;
  endTimeNs?: bigint;

  // accumulation brute
  private _hostCpuEnergyJoules = 0;
  private _totalHostCpuActiveTicks = 0n;
  private _totalProcessCpuActiveTicks = 0n;

  constructor(startTimeNs: bigint) {
    this.startTimeNs = startTimeNs;
  }

  /**
   * Alimente l’accumulateur avec les deltas d’un tick.
   * Toute valeur absente est ignorée.
   */
  push(sample: AccumulatorSample): void {
    if (typeof sample.hostCpuEnergyJoules === "number") {
      if (sample.hostCpuEnergyJoules > 0) {
        this._hostCpuEnergyJoules += sample.hostCpuEnergyJoules;
      }
    }

    if (typeof sample.hostCpuActiveTicks === "bigint") {
      if (sample.hostCpuActiveTicks > 0n) {
        this._totalHostCpuActiveTicks += sample.hostCpuActiveTicks;
      }
    }

    if (typeof sample.processCpuActiveTicks === "bigint") {
      if (sample.processCpuActiveTicks > 0n) {
        this._totalProcessCpuActiveTicks +=
          sample.processCpuActiveTicks;
      }
    }
  }

  /**
   * Finalise l’audit et retourne les totaux agrégés.
   * Cette méthode doit être appelée UNE SEULE FOIS.
   */
  finalize(): AccumulatorTotals {
    const endNs =
      this.endTimeNs ?? process.hrtime.bigint();

    const durationSeconds =
      Number(endNs - this.startTimeNs) / 1e9;

    return {
      durationSeconds,
      hostCpuEnergyJoules: this._hostCpuEnergyJoules,
      totalHostCpuActiveTicks: this._totalHostCpuActiveTicks,
      totalProcessCpuActiveTicks:
        this._totalProcessCpuActiveTicks,
    };
  }
}
