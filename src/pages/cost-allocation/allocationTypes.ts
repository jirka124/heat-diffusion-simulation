export type AllocationMethod = 'fair' | 'practical';

export type AllocationRow = {
  id: string;
  name: string;
  areaCells: number;
  producedJ: number;
  comfortScore: number | null;
  neighborTransferJ: number;
  baseCostJ: number;
  outsideAdjustmentJ: number;
  sharedCostJ: number;
  positionCoefficient: number | null;
  correctedConsumptionJ: number | null;
  rawBillableJ: number;
  billableJ: number;
  shareRatio: number;
  selfPayCost: number;
  paymentHappinessScore: number;
  finalCost: number;
};

export type AllocationMeta = {
  baseTotalJ: number;
  billableTotalJ: number;
};

export type AllocationComputation = {
  rows: AllocationRow[];
  meta: AllocationMeta;
};

export function emptyAllocationComputation(): AllocationComputation {
  return {
    rows: [],
    meta: { baseTotalJ: 0, billableTotalJ: 0 },
  };
}
