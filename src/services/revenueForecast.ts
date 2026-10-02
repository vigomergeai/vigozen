import { api } from "../app/lib/api";

export interface RevenueForecast {
  currentMonth: {
    amount: number;
    confidence: number;
    deals: number;
  };
  nextMonth: {
    amount: number;
    confidence: number;
    deals: number;
  };
  quarter: {
    amount: number;
    confidence: number;
    deals: number;
  };
  byStage: {
    stage: string;
    amount: number;
    probability: number;
    weightedAmount: number;
  }[];
}

export const stageProbabilities: Record<string, number> = {
  // ── Standard Real Estate & Pipeline Stages ──
  'New': 0.20,
  'Attempted-1': 0.25,
  'Attempted-2': 0.30,
  'Attempted-3': 0.35,
  'In-Process': 0.40,
  'Contacted': 0.30,
  'Qualified': 0.50,
  'Site Visit Scheduled': 0.55,
  'Site Visit Done': 0.65,
  'Zoom Meeting': 0.60,
  'Proposal': 0.65,
  'Final Negotiation': 0.80,
  'Negotiation': 0.75,
  'Token Done': 0.90,
  'Booking Done': 1.00,
  'Won': 1.00,
  'Lost': 0,
  'Unqualified': 0,
};

export const calculateWeightedRevenue = (deals: any[]): number => {
  return deals.reduce((total: number, deal: any) => {
    // If deal has an explicit probability set (e.g. 50%), use it
    let probability: number;
    if (deal.probability !== undefined && deal.probability !== null && !isNaN(Number(deal.probability))) {
      const p = Number(deal.probability);
      probability = p > 1 ? p / 100 : p;
    } else {
      probability = stageProbabilities[deal.stage] ?? 0.5;
    }
    const val = Number(deal.value) || 0;
    return total + (val * probability);
  }, 0);
};

export const calculateConfidence = (deals: any[], period: string): number => {
  if (!deals || deals.length === 0) return 0;
  const wonDeals = deals.filter((d: any) => d.stage === 'Won' || d.stage === 'Booking Done' || d.stage === 'Token Done').length;
  const advancedStages = deals.filter((d: any) => 
    ['Final Negotiation', 'Token Done', 'Booking Done', 'Won', 'Proposal', 'Negotiation', 'Site Visit Done'].includes(d.stage)
  ).length;
  
  let confidence = 50;
  if (period === 'currentMonth') {
    confidence = 65 + (advancedStages / deals.length) * 25;
  } else if (period === 'nextMonth') {
    confidence = 50 + (wonDeals / deals.length) * 35;
  } else {
    confidence = 45 + (wonDeals / deals.length) * 30;
  }
  return Math.min(Math.round(confidence), 95);
};

export const emptyForecast: RevenueForecast = {
  currentMonth: { amount: 0, confidence: 0, deals: 0 },
  nextMonth: { amount: 0, confidence: 0, deals: 0 },
  quarter: { amount: 0, confidence: 0, deals: 0 },
  byStage: [],
};

/**
 * Pure calculation function that accepts deals array and produces live forecast
 */
export const calculateForecastFromDeals = (rawDeals: any[]): RevenueForecast => {
  const deals = (rawDeals || [])
    .map((d: any) => ({
      ...d,
      stage: d.stage || 'New',
      value: Number(d.value) || 0,
      expectedclose: d.expectedclose || d.expectedClose || d.expected_close
    }))
    .filter((d: any) => d.stage !== 'Lost' && d.stage !== 'Unqualified');

  if (deals.length === 0) {
    return emptyForecast;
  }

  const now = new Date();
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);
  const quarterEnd = new Date(now.getFullYear(), now.getMonth() + 3, 0, 23, 59, 59, 999);

  const getDealDate = (deal: any) => {
    const dateStr = deal.expectedclose || deal.expectedClose || deal.expected_close || deal.created_at || deal.createdAt;
    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) return d;
    }
    return now;
  };

  const currentMonthDeals = deals.filter((deal: any) => 
    getDealDate(deal) <= currentMonthEnd
  );
  
  const nextMonthDeals = deals.filter((deal: any) => 
    getDealDate(deal) >= nextMonthStart && getDealDate(deal) <= nextMonthEnd
  );
  
  const quarterDeals = deals.filter((deal: any) => 
    getDealDate(deal) <= quarterEnd
  );

  return {
    currentMonth: {
      amount: calculateWeightedRevenue(currentMonthDeals),
      confidence: calculateConfidence(currentMonthDeals, 'currentMonth'),
      deals: currentMonthDeals.length,
    },
    nextMonth: {
      amount: calculateWeightedRevenue(nextMonthDeals),
      confidence: calculateConfidence(nextMonthDeals, 'nextMonth'),
      deals: nextMonthDeals.length,
    },
    quarter: {
      amount: calculateWeightedRevenue(quarterDeals),
      confidence: calculateConfidence(quarterDeals, 'quarter'),
      deals: quarterDeals.length,
    },
    byStage: [],
  };
};

export const fetchRevenueForecast = async (): Promise<RevenueForecast> => {
  try {
    const token = localStorage.getItem("vigo_token") || localStorage.getItem("auth_token") || localStorage.getItem("token") || undefined;
    if (!token) return emptyForecast;
    const rawDeals = await api.deals.list(token);
    return calculateForecastFromDeals(rawDeals);
  } catch (error) {
    console.error("Error fetching revenue forecast:", error);
    return emptyForecast;
  }
};