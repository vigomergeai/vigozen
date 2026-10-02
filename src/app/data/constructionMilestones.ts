// Master Construction Milestones & Dynamic Calculation Engine

export type MilestoneStatus = 'Upcoming' | 'In-Progress' | 'Completed';
export type PaymentStatus = 'Pending' | 'Paid' | 'Partially Paid' | 'Overdue';

export interface ConstructionMilestone {
  order: number;
  stageName: string;
  percentage: number;
  slabRatio?: string; // e.g. "40%" or "30%" group
  amount?: number;
  installment?: number; // 0.9% Installment
  cumulativeInstallment?: number; // Cumulative Installment (sum of installments)
  cumulativeEmi?: number; // alias for backwards compatibility
  milestoneStatus: MilestoneStatus;
  paymentStatus: PaymentStatus;
  paidAmount?: number;
  remainingAmount?: number;
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

// 24 Master Predefined Construction Milestones with exact % totaling exactly 100%
export const MASTER_24_CONSTRUCTION_STAGES: Omit<
  ConstructionMilestone,
  'amount' | 'installment' | 'cumulativeInstallment' | 'cumulativeEmi' | 'remainingAmount'
>[] = [
  { order: 1,  stageName: "Booking Amount",                 percentage: 10.0, slabRatio: "40%", milestoneStatus: "Completed", paymentStatus: "Paid", paidAmount: undefined },
  { order: 2,  stageName: "Agreement Execution",            percentage: 10.0, slabRatio: "40%", milestoneStatus: "Completed", paymentStatus: "Paid", paidAmount: undefined },
  { order: 3,  stageName: "Plinth Completion",              percentage: 15.0, slabRatio: "40%", milestoneStatus: "In-Progress", paymentStatus: "Pending", paidAmount: 0 },
  { order: 4,  stageName: "2nd Parking Slab",               percentage: 3.0,  slabRatio: "40%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0 },
  { order: 5,  stageName: "3rd Parking Slab",               percentage: 3.0,  slabRatio: "40%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0 },
  { order: 6,  stageName: "1st Floor Slab",                 percentage: 3.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0 },
  { order: 7,  stageName: "3rd Floor Slab",                 percentage: 3.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0 },
  { order: 8,  stageName: "5th Floor Slab",                 percentage: 3.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0 },
  { order: 9,  stageName: "8th Floor Slab",                 percentage: 3.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0 },
  { order: 10, stageName: "11th Floor Slab",                percentage: 3.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0 },
  { order: 11, stageName: "14th Floor Slab",                percentage: 2.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0 },
  { order: 12, stageName: "17th Floor Slab",                percentage: 2.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0 },
  { order: 13, stageName: "20th Floor Slab",                percentage: 2.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0 },
  { order: 14, stageName: "23rd Floor Slab",                percentage: 2.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0 },
  { order: 15, stageName: "26th Floor Slab",                percentage: 2.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0 },
  { order: 16, stageName: "29th Floor Slab",                percentage: 2.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0 },
  { order: 17, stageName: "32nd Floor Slab",                percentage: 2.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0 },
  { order: 18, stageName: "Brick/Wall Work",                percentage: 5.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0 },
  { order: 19, stageName: "Plaster/Gypsum",                 percentage: 5.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0 },
  { order: 20, stageName: "Waterproofing",                  percentage: 5.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0 },
  { order: 21, stageName: "Flooring",                       percentage: 5.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0 },
  { order: 22, stageName: "Doors/Windows",                  percentage: 5.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0 },
  { order: 23, stageName: "Architect/Civil",                percentage: 3.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0 },
  { order: 24, stageName: "Possession",                     percentage: 2.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0 },
];

/**
 * Derives payment status from paid amount, milestone amount, and due date
 */
export function derivePaymentStatus(
  currentStatus: PaymentStatus,
  amount: number,
  paidAmount?: number,
  dueDate?: string | null
): PaymentStatus {
  // If explicitly marked Paid or full amount paid
  if (currentStatus === 'Paid' || (paidAmount !== undefined && paidAmount >= amount && amount > 0)) {
    return 'Paid';
  }

  const effectivePaid = Number(paidAmount) || 0;
  if (effectivePaid > 0 && effectivePaid < amount) {
    return 'Partially Paid';
  }

  if (dueDate) {
    const due = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!isNaN(due.getTime()) && due < today && effectivePaid < amount) {
      return 'Overdue';
    }
  }

  return currentStatus === 'Overdue' ? 'Overdue' : 'Pending';
}

/**
 * Recalculates milestone amounts, 0.9% installments, and cumulative installments
 */
export function recalculateMilestones(
  agreementValue: number,
  milestones: ConstructionMilestone[] = MASTER_24_CONSTRUCTION_STAGES as ConstructionMilestone[]
): ConstructionMilestone[] {
  let cumulativeInstallment = 0;
  const av = Math.max(0, Number(agreementValue) || 1000000);

  return milestones.map((m, idx) => {
    const percentage = Number(m.percentage) || 0;
    const amount = Number(((av * percentage) / 100).toFixed(2));
    const installment = Number((amount * 0.009).toFixed(2));
    cumulativeInstallment = Number((cumulativeInstallment + installment).toFixed(2));

    const paidAmount = m.paymentStatus === 'Paid' ? amount : (Number(m.paidAmount) || 0);
    const remainingAmount = Math.max(0, Number((amount - paidAmount).toFixed(2)));
    const paymentStatus = derivePaymentStatus(m.paymentStatus, amount, paidAmount, m.dueDate);

    return {
      ...m,
      order: m.order ?? idx + 1,
      percentage,
      amount,
      installment,
      cumulativeInstallment,
      cumulativeEmi: cumulativeInstallment,
      paidAmount,
      remainingAmount,
      paymentStatus,
    };
  });
}

/**
 * Calculates RTMI vs UC Savings Comparison and Summary Cards metrics
 * Baseline model on ₹10,00,000 standard: RTMI = ₹3,23,901, UC = ₹1,31,810 -> Savings = ₹1,92,091
 * Scaled dynamically with Agreement Value
 */
export function calculateSavingsMetrics(agreementValue: number, milestones: ConstructionMilestone[]) {
  const av = Math.max(0, Number(agreementValue) || 1000000);
  const ratio = av / 1000000;

  // Proportional savings model based on standard 10L baseline
  const rtmiCost = Number((323901 * ratio).toFixed(2));
  const ucCost = Number((131810 * ratio).toFixed(2));
  const buyerSavings = Number((rtmiCost - ucCost).toFixed(2));

  // Actual milestone sums
  const totalPaid = milestones
    .filter(m => m.paymentStatus === 'Paid')
    .reduce((sum, m) => sum + (m.amount || 0), 0);

  // Exact Formula: Total Pending = Agreement Value - Total Paid
  const totalPending = Math.max(0, Number((av - totalPaid).toFixed(2)));

  const totalPercentage = Number(
    milestones.reduce((sum, m) => sum + (Number(m.percentage) || 0), 0).toFixed(2)
  );

  const paidProgress = av > 0 ? Number(((totalPaid / av) * 100).toFixed(1)) : 0;
  const remainingMilestonesCount = milestones.filter(m => m.paymentStatus !== 'Paid').length;

  return {
    agreementValue: av,
    rtmiCost,
    ucCost,
    buyerSavings,
    totalPaid,
    totalPending,
    totalPercentage,
    paidProgress,
    remainingMilestonesCount,
  };
}
