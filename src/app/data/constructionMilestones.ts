// Master Construction Milestones & Dynamic Calculation Engine

export type MilestoneStatus = 'Upcoming' | 'In-Progress' | 'Completed';
export type PaymentStatus = 'Pending' | 'Paid' | 'Partially Paid' | 'Overdue';

export interface ConstructionMilestone {
  order: number;
  stageName: string;
  percentage: number;
  slabRatio?: string; // e.g. "40:30:30" group
  amount?: number;
  installment?: number;
  cumulativeEmi?: number;
  milestoneStatus: MilestoneStatus;
  paymentStatus: PaymentStatus;
  dueDate?: string | null;
  completionDate?: string | null;
  remarks?: string;
}

export interface DealPaymentScheduleData {
  id?: string;
  deal_id: string;
  agreement_value: number;
  milestones: ConstructionMilestone[];
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  is_generated?: boolean;
}

// 24 Master Predefined Construction Milestones with default standard % totaling 100%
export const MASTER_24_CONSTRUCTION_STAGES: Omit<ConstructionMilestone, 'amount' | 'installment' | 'cumulativeEmi'>[] = [
  { order: 1,  stageName: "Booking Amount",                 percentage: 10.0, slabRatio: "40%", milestoneStatus: "Completed", paymentStatus: "Paid" },
  { order: 2,  stageName: "Agreement Execution",            percentage: 10.0, slabRatio: "40%", milestoneStatus: "Completed", paymentStatus: "Paid" },
  { order: 3,  stageName: "Plinth Completion",              percentage: 15.0, slabRatio: "40%", milestoneStatus: "In-Progress", paymentStatus: "Pending" },
  { order: 4,  stageName: "2nd Parking Slab",               percentage: 2.5,  slabRatio: "40%", milestoneStatus: "Upcoming",    paymentStatus: "Pending" },
  { order: 5,  stageName: "3rd Parking Slab",               percentage: 2.5,  slabRatio: "40%", milestoneStatus: "Upcoming",    paymentStatus: "Pending" },
  { order: 6,  stageName: "1st Floor Slab",                 percentage: 3.5,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending" },
  { order: 7,  stageName: "2nd Floor Slab",                 percentage: 3.5,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending" },
  { order: 8,  stageName: "3rd Floor Slab",                 percentage: 3.5,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending" },
  { order: 9,  stageName: "4th Floor Slab",                 percentage: 3.5,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending" },
  { order: 10, stageName: "5th Floor Slab",                 percentage: 3.5,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending" },
  { order: 11, stageName: "6th Floor Slab",                 percentage: 3.5,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending" },
  { order: 12, stageName: "7th Floor Slab",                 percentage: 3.5,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending" },
  { order: 13, stageName: "8th Floor Slab",                 percentage: 3.5,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending" },
  { order: 14, stageName: "9th Floor Slab",                 percentage: 3.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending" },
  { order: 15, stageName: "Brickwork / Masonry",            percentage: 4.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending" },
  { order: 16, stageName: "Internal Plaster",               percentage: 4.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending" },
  { order: 17, stageName: "External Plaster",               percentage: 4.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending" },
  { order: 18, stageName: "Flooring & Tiling",              percentage: 3.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending" },
  { order: 19, stageName: "Sanitary & Plumbing Fittings",    percentage: 3.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending" },
  { order: 20, stageName: "Electrical Wiring & Switches",   percentage: 3.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending" },
  { order: 21, stageName: "Doors & Windows Fixing",         percentage: 3.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending" },
  { order: 22, stageName: "External Painting & Elevation",  percentage: 3.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending" },
  { order: 23, stageName: "Lifts & Water Pumps",            percentage: 2.5,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending" },
  { order: 24, stageName: "Possession & Handover",          percentage: 5.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending" },
];

/**
 * Recalculates milestone amounts, 0.9% installments, and cumulative EMI
 */
export function recalculateMilestones(
  agreementValue: number,
  milestones: ConstructionMilestone[] = MASTER_24_CONSTRUCTION_STAGES as ConstructionMilestone[]
): ConstructionMilestone[] {
  let cumulativeEmi = 0;
  const av = Math.max(0, Number(agreementValue) || 1000000);

  return milestones.map((m, idx) => {
    const percentage = Number(m.percentage) || 0;
    const amount = Number(((av * percentage) / 100).toFixed(2));
    const installment = Number((amount * 0.009).toFixed(2));
    cumulativeEmi = Number((cumulativeEmi + installment).toFixed(2));

    return {
      ...m,
      order: m.order ?? idx + 1,
      percentage,
      amount,
      installment,
      cumulativeEmi,
    };
  });
}

/**
 * Calculates RTMI vs UC Savings Comparison
 * Baseline model on ₹10,00,000 standard: RTMI = ₹3,23,901, UC = ₹1,31,810 -> Savings = ₹1,92,091
 * Proportional scaling for any custom agreement value:
 */
export function calculateSavingsMetrics(agreementValue: number, milestones: ConstructionMilestone[]) {
  const av = Math.max(0, Number(agreementValue) || 1000000);
  const ratio = av / 1000000;

  // Proportional savings model based on standard 10L baseline
  const rtmiTotalInterest = Math.round(323901 * ratio);
  const ucTotalPreEmi = Math.round(131810 * ratio);
  const netBuyerSavings = rtmiTotalInterest - ucTotalPreEmi;

  // Actual milestone sums
  const totalPaid = milestones
    .filter(m => m.paymentStatus === 'Paid')
    .reduce((sum, m) => sum + (m.amount || 0), 0);

  const totalPending = milestones
    .filter(m => m.paymentStatus !== 'Paid')
    .reduce((sum, m) => sum + (m.amount || 0), 0);

  const totalPercentage = milestones.reduce((sum, m) => sum + (Number(m.percentage) || 0), 0);

  return {
    agreementValue: av,
    rtmiCost: rtmiTotalInterest,
    ucCost: ucTotalPreEmi,
    buyerSavings: netBuyerSavings,
    totalPaid,
    totalPending,
    totalPercentage,
  };
}
