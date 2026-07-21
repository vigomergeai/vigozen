import React from 'react';
import { useApp } from '../context/AppContext';
import { Bot } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

export const RevenueForecast: React.FC = () => {
  const { revenueForecast } = useApp();

  if (!revenueForecast) {
    return (
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 rounded-2xl p-4 text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Bot size={20} className="text-white animate-pulse" />
          </div>
          <div>
            <div className="text-sm font-semibold">AI Revenue Forecast</div>
            <div className="text-xs text-white/70">Loading forecast...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 rounded-2xl p-4 text-white">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Bot size={20} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold">AI Revenue Forecast</div>
            <div className="text-xs text-white/70">Based on current pipeline velocity and historical conversion</div>
          </div>
        </div>
        <div className="flex gap-4 sm:ml-auto">
          <div className="text-center">
            <div className="text-sm font-bold">{formatCurrency(revenueForecast.currentMonth.amount)}</div>
            <div className="text-[10px] text-white/70">This Month</div>
            <div className="text-[10px] text-emerald-300">{revenueForecast.currentMonth.confidence}% confidence</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-bold">{formatCurrency(revenueForecast.nextMonth.amount)}</div>
            <div className="text-[10px] text-white/70">Next Month</div>
            <div className="text-[10px] text-emerald-300">{revenueForecast.nextMonth.confidence}% confidence</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-bold">{formatCurrency(revenueForecast.quarter.amount)}</div>
            <div className="text-[10px] text-white/70">Quarter</div>
            <div className="text-[10px] text-emerald-300">{revenueForecast.quarter.confidence}% confidence</div>
          </div>
        </div>
      </div>
      {revenueForecast.currentMonth.deals === 0 && (
        <div className="mt-3 pt-2 border-t border-white/10 text-[10px] text-white/50 text-center">
          Add deals with expected close dates to see forecast
        </div>
      )}
    </div>
  );
};