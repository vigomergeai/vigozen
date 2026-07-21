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

const stageProbabilities: Record<string, number> = {
  'New': 0.2,
  'Contacted': 0.3,
  'Qualified': 0.5,
  'Proposal': 0.6,
  'Negotiation': 0.75,
  'Won': 1.0,
  'Lost': 0,
};

const calculateWeightedRevenue = (deals: any[]): number => {
  return deals.reduce((total: number, deal: any) => {
    const probability = stageProbabilities[deal.stage] || 0;
    return total + (deal.value * probability);
  }, 0);
};

const calculateConfidence = (deals: any[], period: string): number => {
  if (deals.length === 0) return 0;
  const wonDeals = deals.filter((d: any) => d.stage === 'Won').length;
  const advancedStages = deals.filter((d: any) => 
    ['Proposal', 'Negotiation', 'Won'].includes(d.stage)
  ).length;
  
  let confidence = 50;
  if (period === 'currentMonth') {
    confidence = 70 + (advancedStages / deals.length) * 20;
  } else if (period === 'nextMonth') {
    confidence = 50 + (wonDeals / deals.length) * 30;
  } else {
    confidence = 40 + (wonDeals / deals.length) * 20;
  }
  return Math.min(Math.round(confidence), 95);
};

export const fetchRevenueForecast = async (): Promise<RevenueForecast> => {
  try {
    const token = localStorage.getItem("vigo_token") || localStorage.getItem("auth_token") || localStorage.getItem("token") || undefined;
    const rawDeals = await api.deals.list(token);
    
    // Map stage formatting if necessary, and filter stage != 'Lost'
    const deals = (rawDeals || [])
      .map((d: any) => ({
        ...d,
        stage: d.stage || 'New',
        value: Number(d.value) || 0,
        expectedclose: d.expectedclose || d.expectedClose
      }))
      .filter((d: any) => d.stage !== 'Lost');
    
    if (deals.length === 0) {
      return {
        currentMonth: { amount: 0, confidence: 0, deals: 0 },
        nextMonth: { amount: 0, confidence: 0, deals: 0 },
        quarter: { amount: 0, confidence: 0, deals: 0 },
        byStage: [],
      };
    }
    
    const now = new Date();
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    const quarterEnd = new Date(now.getFullYear(), now.getMonth() + 3, 0);
    
    const getDealDate = (deal: any) => {
      const dateStr = deal.expectedclose || deal.expectedClose || deal.created_at || deal.createdAt;
      return dateStr ? new Date(dateStr) : now;
    };

    const currentMonthDeals = deals.filter((deal: any) => 
      getDealDate(deal) <= currentMonthEnd
    );
    
    const nextMonthDeals = deals.filter((deal: any) => 
      getDealDate(deal) >= nextMonthStart || getDealDate(deal) <= nextMonthEnd
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
    
  } catch (error) {
    console.error("Error fetching revenue forecast:", error);
    return {
      currentMonth: { amount: 0, confidence: 0, deals: 0 },
      nextMonth: { amount: 0, confidence: 0, deals: 0 },
      quarter: { amount: 0, confidence: 0, deals: 0 },
      byStage: [],
    };
  }
};