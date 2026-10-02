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

// 24 Master Predefined Construction Milestones with exact % totaling exactly 100% and progressive schedule dates
export const MASTER_24_CONSTRUCTION_STAGES: Omit<
  ConstructionMilestone,
  'amount' | 'installment' | 'cumulativeInstallment' | 'cumulativeEmi' | 'remainingAmount'
>[] = [
  { order: 1,  stageName: "Booking Amount",                               percentage: 10.0, slabRatio: "40%", milestoneStatus: "Completed", paymentStatus: "Paid", paidAmount: undefined, dueDate: "2026-10-01", completionDate: "2026-10-01" },
  { order: 2,  stageName: "After Agreement (within 15 days)",             percentage: 10.0, slabRatio: "40%", milestoneStatus: "Completed", paymentStatus: "Paid", paidAmount: undefined, dueDate: "2026-10-15", completionDate: "2026-10-15" },
  { order: 3,  stageName: "On Completion Of Plinth",                      percentage: 15.0, slabRatio: "40%", milestoneStatus: "In-Progress", paymentStatus: "Pending", paidAmount: 0, dueDate: "2026-11-30", completionDate: null },
  { order: 4,  stageName: "On Completion Of 2nd Parking slab",            percentage: 3.0,  slabRatio: "40%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0, dueDate: "2026-12-15", completionDate: null },
  { order: 5,  stageName: "On Completion Of 3rd Parking slab",            percentage: 3.0,  slabRatio: "40%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0, dueDate: "2027-01-15", completionDate: null },
  { order: 6,  stageName: "On Completion of 1st floor slab",              percentage: 3.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0, dueDate: "2027-02-15", completionDate: null },
  { order: 7,  stageName: "On Completion of 3rd Floor Slab",              percentage: 3.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0, dueDate: "2027-03-15", completionDate: null },
  { order: 8,  stageName: "On Completion of 5th floor slab",              percentage: 3.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0, dueDate: "2027-04-15", completionDate: null },
  { order: 9,  stageName: "On Completion of 8th floor slab",              percentage: 3.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0, dueDate: "2027-05-15", completionDate: null },
  { order: 10, stageName: "On Completion of 11th floor slab",             percentage: 3.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0, dueDate: "2027-06-15", completionDate: null },
  { order: 11, stageName: "On Completion of 14th Floor Slab",             percentage: 2.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0, dueDate: "2027-07-15", completionDate: null },
  { order: 12, stageName: "On Completion of 17th floor slab",             percentage: 2.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0, dueDate: "2027-08-15", completionDate: null },
  { order: 13, stageName: "On Completion of 20th Floor Slab",             percentage: 2.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0, dueDate: "2027-09-15", completionDate: null },
  { order: 14, stageName: "On Completion of 23rd floor slab",             percentage: 2.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0, dueDate: "2027-10-15", completionDate: null },
  { order: 15, stageName: "On Completion of 26th floor slab",             percentage: 2.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0, dueDate: "2027-11-15", completionDate: null },
  { order: 16, stageName: "On Completion of 29th floor slab",             percentage: 2.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0, dueDate: "2027-12-15", completionDate: null },
  { order: 17, stageName: "On Completion of 32nd floor slab",             percentage: 2.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0, dueDate: "2028-01-15", completionDate: null },
  { order: 18, stageName: "Upon Completion of Internal Brick / Wall work", percentage: 5.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0, dueDate: "2028-02-15", completionDate: null },
  { order: 19, stageName: "Upon Completion of Internal Plaster/Gypsum",   percentage: 5.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0, dueDate: "2028-03-15", completionDate: null },
  { order: 20, stageName: "Upon Completion of Waterproofing",             percentage: 5.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0, dueDate: "2028-04-15", completionDate: null },
  { order: 21, stageName: "Upon Completion of Flooring",                  percentage: 5.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0, dueDate: "2028-05-15", completionDate: null },
  { order: 22, stageName: "Upon Completion of Door Frames and Windows",   percentage: 5.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0, dueDate: "2028-06-15", completionDate: null },
  { order: 23, stageName: "Architect and Civil Completion of Apartment",  percentage: 3.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0, dueDate: "2028-07-15", completionDate: null },
  { order: 24, stageName: "At the time of possession of Unit",            percentage: 2.0,  slabRatio: "30%", milestoneStatus: "Upcoming",    paymentStatus: "Pending", paidAmount: 0, dueDate: "2028-09-15", completionDate: null },
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

export interface MonthlyAmortizationRow {
  month: number;
  principal: number;
  interest: number;
  totalPayment: number;
  outstandingBalance: number;
  cumulativeInterest: number;
  cumulativePrincipal: number;
}

export interface YearlyAmortizationRow {
  year: number;
  principal: number;
  interest: number;
  totalPayment: number;
  outstandingBalance: number;
  cumulativeInterest: number;
  cumulativePrincipal: number;
}

export interface EmiCalculationResult {
  principal: number;
  annualRate: number;
  tenureYears: number;
  monthlyEmi: number;
  totalInterest: number;
  totalPayment: number;
  yearlySchedule: YearlyAmortizationRow[];
  monthlySchedule: MonthlyAmortizationRow[];
}

/**
 * Calculates Full Home Loan EMI Amortization Schedule (Yearly & Monthly)
 */
export function calculateEmiAmortization(
  principalAmount: number = 1000000,
  annualInterestRate: number = 9.0,
  tenureInYears: number = 20
): EmiCalculationResult {
  const P = Math.max(1000, Number(principalAmount) || 1000000);
  const R = Math.max(0.1, Number(annualInterestRate) || 9.0);
  const Y = Math.max(1, Math.min(30, Number(tenureInYears) || 20));

  const monthlyRate = R / (12 * 100);
  const totalMonths = Y * 12;

  // EMI formula: P * r * (1+r)^n / ((1+r)^n - 1)
  const factor = Math.pow(1 + monthlyRate, totalMonths);
  const rawEmi = (P * monthlyRate * factor) / (factor - 1);
  const monthlyEmi = Math.round(rawEmi);

  let currentBalance = P;
  let cumInterest = 0;
  let cumPrincipal = 0;

  const monthlySchedule: MonthlyAmortizationRow[] = [];
  const yearlySchedule: YearlyAmortizationRow[] = [];

  for (let m = 1; m <= totalMonths; m++) {
    const interestPayment = currentBalance * monthlyRate;
    let principalPayment = rawEmi - interestPayment;

    if (m === totalMonths || principalPayment > currentBalance) {
      principalPayment = currentBalance;
    }

    currentBalance = Math.max(0, currentBalance - principalPayment);
    cumInterest += interestPayment;
    cumPrincipal += principalPayment;

    monthlySchedule.push({
      month: m,
      principal: Math.round(principalPayment),
      interest: Math.round(interestPayment),
      totalPayment: Math.round(principalPayment + interestPayment),
      outstandingBalance: Math.round(currentBalance),
      cumulativeInterest: Math.round(cumInterest),
      cumulativePrincipal: Math.round(cumPrincipal),
    });

    // Roll up into yearly row at month 12, 24, 36... or final month
    if (m % 12 === 0 || m === totalMonths) {
      const yearIndex = Math.ceil(m / 12);
      const startMonthIndex = (yearIndex - 1) * 12;
      const yearMonths = monthlySchedule.slice(startMonthIndex, m);

      const yrPrincipal = yearMonths.reduce((s, row) => s + row.principal, 0);
      const yrInterest = yearMonths.reduce((s, row) => s + row.interest, 0);

      yearlySchedule.push({
        year: yearIndex,
        principal: yrPrincipal,
        interest: yrInterest,
        totalPayment: yrPrincipal + yrInterest,
        outstandingBalance: Math.round(currentBalance),
        cumulativeInterest: Math.round(cumInterest),
        cumulativePrincipal: Math.round(cumPrincipal),
      });
    }
  }

  const totalPayment = Math.round(cumPrincipal + cumInterest);
  const totalInterest = Math.round(cumInterest);

  return {
    principal: Math.round(P),
    annualRate: R,
    tenureYears: Y,
    monthlyEmi,
    totalInterest,
    totalPayment,
    yearlySchedule,
    monthlySchedule,
  };
}
