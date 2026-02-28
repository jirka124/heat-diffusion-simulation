import type { SimulationResultsExport, UnitResultExport } from 'src/sim/heatSimulation';
import type { AllocationComputation, AllocationRow } from 'src/pages/cost-allocation/allocationTypes';
import { emptyAllocationComputation } from 'src/pages/cost-allocation/allocationTypes';

type CommonComputeInput = {
  data: SimulationResultsExport;
  totalCost: number;
  sharedUnitId: string | null;
  outsideTargetId: string | null;
};

type PracticalComputeInput = CommonComputeInput & {
  practicalBaseShareRatio: number;
};

const SHARED_FLOW_TILT = 0.5;
const SHARED_WEIGHT_MIN = 0.5;
const SHARED_WEIGHT_MAX = 1.5;
const PRACTICAL_POS_COEF_MIN = 0.7;
const PRACTICAL_POS_COEF_MAX = 1.3;
const PRACTICAL_AREA_MIN_RATIO = 0.7;
const PRACTICAL_AREA_MAX_RATIO = 2.0;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function flowOutTo(from: UnitResultExport, targetId: string | null): number {
  if (!targetId) return 0;
  const raw = from.netHeatFlowTotalJByTarget[targetId] ?? 0;
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, raw);
}

function scorePaymentHappiness(finalCost: number, selfPayCost: number) {
  if (selfPayCost <= 1e-9) return finalCost <= 1e-9 ? 100 : 0;
  const relDiff = Math.abs(finalCost - selfPayCost) / selfPayCost;
  return clamp(100 * (1 - relDiff), 0, 100);
}

function finalizeAllocationRows(rows: AllocationRow[], totalCost: number): AllocationComputation {
  const baseTotalJ = rows.reduce((sum, r) => sum + r.rawBillableJ, 0);
  const billableTotalJ = rows.reduce((sum, r) => sum + r.billableJ, 0);
  const producedTotalJ = rows.reduce((sum, r) => sum + r.producedJ, 0);

  if (billableTotalJ > 0) {
    for (const row of rows) {
      row.shareRatio = row.billableJ / billableTotalJ;
      row.finalCost = totalCost * row.shareRatio;
    }
  } else {
    for (const row of rows) {
      row.shareRatio = 1 / rows.length;
      row.finalCost = totalCost / rows.length;
    }
  }

  if (producedTotalJ > 0) {
    for (const row of rows) {
      row.selfPayCost = totalCost * (row.producedJ / producedTotalJ);
      row.paymentHappinessScore = scorePaymentHappiness(row.finalCost, row.selfPayCost);
    }
  } else {
    for (const row of rows) {
      row.selfPayCost = totalCost / rows.length;
      row.paymentHappinessScore = scorePaymentHappiness(row.finalCost, row.selfPayCost);
    }
  }

  rows.sort((a, b) => b.finalCost - a.finalCost);
  return { rows, meta: { baseTotalJ, billableTotalJ } };
}

function createBaseRow(unit: UnitResultExport): AllocationRow {
  return {
    id: unit.id,
    name: unit.name,
    areaCells: unit.areaCells,
    producedJ: unit.totalEnergyProducedJ,
    comfortScore: unit.avgComfortScore,
    neighborTransferJ: 0,
    baseCostJ: 0,
    outsideAdjustmentJ: 0,
    sharedCostJ: 0,
    positionCoefficient: null,
    correctedConsumptionJ: null,
    rawBillableJ: 0,
    billableJ: 0,
    shareRatio: 0,
    selfPayCost: 0,
    paymentHappinessScore: 0,
    finalCost: 0,
  };
}

function payerUnitsOf(data: SimulationResultsExport, sharedUnitId: string | null) {
  const sharedUnit = sharedUnitId ? data.units.find((u) => u.id === sharedUnitId) ?? null : null;
  return {
    sharedUnit,
    payerUnits: data.units.filter((u) => u.id !== sharedUnit?.id),
  };
}

function enforcePracticalAreaCostBounds(rows: AllocationRow[], basePoolJ: number, variablePoolJ: number) {
  const totalArea = rows.reduce((s, r) => s + Math.max(0, r.areaCells), 0);
  if (totalArea <= 0 || variablePoolJ <= 0) return;

  const totalPoolJ = basePoolJ + variablePoolJ;
  const avgCostPerArea = totalPoolJ / totalArea;
  const minByUnit = new Map<string, number>();
  const maxByUnit = new Map<string, number>();
  for (const r of rows) {
    const area = Math.max(0, r.areaCells);
    minByUnit.set(r.id, PRACTICAL_AREA_MIN_RATIO * avgCostPerArea * area);
    maxByUnit.set(r.id, PRACTICAL_AREA_MAX_RATIO * avgCostPerArea * area);
  }

  const variableByUnit = new Map<string, number>();
  const weights = new Map<string, number>();
  for (const r of rows) {
    variableByUnit.set(r.id, Math.max(0, r.sharedCostJ));
    weights.set(r.id, Math.max(0, r.correctedConsumptionJ ?? 0));
  }

  const locked = new Set<string>();
  for (let iter = 0; iter < rows.length + 2; iter++) {
    const active = rows.filter((r) => !locked.has(r.id));
    if (active.length === 0) break;

    const usedByLocked = rows
      .filter((r) => locked.has(r.id))
      .reduce((s, r) => s + (variableByUnit.get(r.id) ?? 0), 0);
    const remainingPool = Math.max(0, variablePoolJ - usedByLocked);

    let weightSum = active.reduce((s, r) => s + (weights.get(r.id) ?? 0), 0);
    if (weightSum <= 0) {
      weightSum = active.reduce((s, r) => s + Math.max(0, r.areaCells), 0);
      for (const r of active) {
        weights.set(r.id, Math.max(0, r.areaCells));
      }
    }
    if (weightSum <= 0) break;

    for (const r of active) {
      const w = weights.get(r.id) ?? 0;
      variableByUnit.set(r.id, (remainingPool * w) / weightSum);
    }

    let changed = false;
    for (const r of active) {
      const minCost = minByUnit.get(r.id) ?? 0;
      const maxCost = maxByUnit.get(r.id) ?? Number.POSITIVE_INFINITY;
      const currentVar = variableByUnit.get(r.id) ?? 0;
      const currentTotal = r.baseCostJ + currentVar;

      if (currentTotal < minCost) {
        variableByUnit.set(r.id, Math.max(0, minCost - r.baseCostJ));
        locked.add(r.id);
        changed = true;
      } else if (currentTotal > maxCost) {
        variableByUnit.set(r.id, Math.max(0, maxCost - r.baseCostJ));
        locked.add(r.id);
        changed = true;
      }
    }

    if (!changed) break;
  }

  for (const r of rows) {
    const boundedVariable = Math.max(0, variableByUnit.get(r.id) ?? 0);
    r.sharedCostJ = boundedVariable;
    r.rawBillableJ = r.baseCostJ + boundedVariable;
    r.billableJ = r.rawBillableJ;
  }

  const totalAfterBounds = rows.reduce((s, r) => s + r.billableJ, 0);
  if (totalAfterBounds <= 0) return;

  const rescale = (basePoolJ + variablePoolJ) / totalAfterBounds;
  for (const r of rows) {
    r.baseCostJ *= rescale;
    r.sharedCostJ *= rescale;
    r.rawBillableJ = r.baseCostJ + r.sharedCostJ;
    r.billableJ = r.rawBillableJ;
  }
}

export function computeFairAllocation(input: CommonComputeInput): AllocationComputation {
  const { data, totalCost, sharedUnitId, outsideTargetId } = input;
  const { sharedUnit, payerUnits } = payerUnitsOf(data, sharedUnitId);
  if (payerUnits.length === 0) return emptyAllocationComputation();

  const n = payerUnits.length;
  const rowMap = new Map<string, AllocationRow>();
  for (const unit of payerUnits) {
    const row = createBaseRow(unit);
    row.baseCostJ = unit.totalEnergyProducedJ;
    rowMap.set(unit.id, row);
  }

  for (const from of payerUnits) {
    for (const to of payerUnits) {
      if (from.id === to.id) continue;
      const sent = flowOutTo(from, to.id);
      if (sent <= 0) continue;
      const sender = rowMap.get(from.id);
      const receiver = rowMap.get(to.id);
      if (!sender || !receiver) continue;
      sender.neighborTransferJ -= sent;
      receiver.neighborTransferJ += sent;
      sender.baseCostJ -= sent;
      receiver.baseCostJ += sent;
    }
  }

  if (outsideTargetId) {
    const losses = new Map<string, number>();
    for (const unit of payerUnits) {
      losses.set(unit.id, flowOutTo(unit, outsideTargetId));
    }

    for (const unit of payerUnits) {
      const loss = losses.get(unit.id) ?? 0;
      const row = rowMap.get(unit.id);
      if (!row) continue;
      if (n > 1) {
        row.outsideAdjustmentJ -= 0.2 * loss;
        let gain = 0;
        for (const other of payerUnits) {
          if (other.id === unit.id) continue;
          gain += (0.2 * (losses.get(other.id) ?? 0)) / (n - 1);
        }
        row.outsideAdjustmentJ += gain;
      }
    }
  }

  if (sharedUnit) {
    const sharedBase = Math.max(0, sharedUnit.totalEnergyProducedJ);
    const weightParts = payerUnits.map((u) => {
      const toUnit = flowOutTo(sharedUnit, u.id);
      const fromUnit = flowOutTo(u, sharedUnit.id);
      const tiltRaw = toUnit - fromUnit;
      const denom = Math.max(sharedBase, 1);
      const weight = clamp(
        1 + SHARED_FLOW_TILT * (tiltRaw / denom),
        SHARED_WEIGHT_MIN,
        SHARED_WEIGHT_MAX,
      );
      return { id: u.id, weight };
    });

    const weightSum = weightParts.reduce((sum, p) => sum + p.weight, 0);
    if (weightSum > 0 && sharedBase > 0) {
      for (const p of weightParts) {
        const row = rowMap.get(p.id);
        if (!row) continue;
        row.sharedCostJ = (sharedBase * p.weight) / weightSum;
      }
    }
  }

  const rows = Array.from(rowMap.values()).map((row) => {
    row.rawBillableJ = row.baseCostJ + row.outsideAdjustmentJ + row.sharedCostJ;
    row.billableJ = Math.max(0, row.rawBillableJ);
    return row;
  });

  return finalizeAllocationRows(rows, totalCost);
}

export function computePracticalAllocation(input: PracticalComputeInput): AllocationComputation {
  const { data, totalCost, sharedUnitId, outsideTargetId, practicalBaseShareRatio } = input;
  const { payerUnits } = payerUnitsOf(data, sharedUnitId);
  if (payerUnits.length === 0) return emptyAllocationComputation();

  const totalAllocationUnitsJ = Math.max(0, data.totalHouseHeatingEnergyJ);
  const basePoolJ = totalAllocationUnitsJ * clamp(practicalBaseShareRatio, 0, 1);
  const variablePoolJ = totalAllocationUnitsJ - basePoolJ;

  const totalArea = payerUnits.reduce((s, u) => s + Math.max(0, u.areaCells), 0);
  const lossDensityByUnit = new Map<string, number>();
  for (const unit of payerUnits) {
    const area = Math.max(1, unit.areaCells);
    const outsideLoss = outsideTargetId ? flowOutTo(unit, outsideTargetId) : 0;
    lossDensityByUnit.set(unit.id, outsideLoss / area);
  }
  const avgLossDensity =
    payerUnits.reduce((s, u) => s + (lossDensityByUnit.get(u.id) ?? 0), 0) / payerUnits.length;

  const rows: AllocationRow[] = [];
  for (const unit of payerUnits) {
    const row = createBaseRow(unit);
    const areaShare = totalArea > 0 ? Math.max(0, unit.areaCells) / totalArea : 1 / payerUnits.length;
    row.baseCostJ = basePoolJ * areaShare;

    const unitDensity = Math.max(1e-9, lossDensityByUnit.get(unit.id) ?? 0);
    const coefRaw = avgLossDensity > 0 ? Math.sqrt(avgLossDensity / unitDensity) : 1;
    row.positionCoefficient = clamp(coefRaw, PRACTICAL_POS_COEF_MIN, PRACTICAL_POS_COEF_MAX);
    row.correctedConsumptionJ = Math.max(0, unit.totalEnergyProducedJ) * row.positionCoefficient;
    rows.push(row);
  }

  const correctedSum = rows.reduce((s, r) => s + Math.max(0, r.correctedConsumptionJ ?? 0), 0);
  for (const row of rows) {
    if (correctedSum > 0) {
      row.sharedCostJ = (variablePoolJ * Math.max(0, row.correctedConsumptionJ ?? 0)) / correctedSum;
    } else {
      const areaShare = totalArea > 0 ? Math.max(0, row.areaCells) / totalArea : 1 / rows.length;
      row.sharedCostJ = variablePoolJ * areaShare;
    }
    row.rawBillableJ = row.baseCostJ + row.sharedCostJ;
    row.billableJ = row.rawBillableJ;
  }

  enforcePracticalAreaCostBounds(rows, basePoolJ, variablePoolJ);
  return finalizeAllocationRows(rows, totalCost);
}
