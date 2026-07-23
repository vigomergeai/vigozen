import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useApp } from "../context/AppContext";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Lock, Zap } from "lucide-react";

export default function BillingPage() {
  const { subscription, subscriptionLoading, userProfile } = useApp();
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState<string>("professional");
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/plans`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => setPlans(data || []))
      .catch(() => setPlans([]));
    }
  }, []);

  // If loading, show skeleton
  if (subscriptionLoading) {
    return (
      <div className="p-4 lg:p-6 max-w-[1600px] text-slate-800">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-64" />
          <div className="h-4 bg-slate-200 rounded w-96" />
          <div className="h-20 bg-slate-200 rounded-2xl" />
          <div className="grid grid-cols-3 gap-6">
            {[1, 2, 3].map(i => <div key={i} className="h-64 bg-slate-200 rounded-2xl" />)}
          </div>
        </div>
      </div>
    );
  }

  // ── Check if already subscribed ──
  const isAlreadySubscribed = subscription?.is_subscription_active;

  // ── Handle Upgrade with PayU ──
  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Not logged in");

      const plan = plans.find(p => p.id === selectedPlan);
      if (!plan) throw new Error("Plan not found");

      // 1. Create subscription record
      await api.subscription.create({ plan_type: selectedPlan }, token);

      // 2. Create PayU order
      const order = await api.payments.createOrder(plan.price, "INR", `${selectedPlan}_plan`, token);

      if (!order.success) {
        throw new Error("Failed to create payment order");
      }

      // 3. Create and submit PayU form
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = order.payuUrl;

      const payuData = order.payuData;
      Object.keys(payuData).forEach(key => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = payuData[key];
        form.appendChild(input);
      });

      // 4. Add plan info for callback
      const planInput = document.createElement('input');
      planInput.type = 'hidden';
      planInput.name = 'plan';
      planInput.value = selectedPlan;
      form.appendChild(planInput);

      document.body.appendChild(form);
      form.submit();

    } catch (error: any) {
      toast.error(error.message || "Payment failed. Please try again.");
      console.error("Upgrade error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 max-w-[1600px]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-slate-900 dark:text-white text-2xl font-bold">Billing & Subscription</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Choose a plan that fits your business needs
        </p>
      </div>

      {/* Current Status Banner */}
      {subscription && (
        <div className={`mb-6 rounded-2xl p-4 border ${
          isAlreadySubscribed 
            ? "bg-emerald-50 border-emerald-200" 
            : subscription.is_trial_active 
              ? "bg-indigo-50 border-indigo-200" 
              : "bg-red-50 border-red-200"
        }`}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${
                isAlreadySubscribed ? "bg-emerald-500" : 
                subscription.is_trial_active ? "bg-indigo-500" : 
                "bg-red-500"
              }`} />
              <div>
                <p className="text-sm font-medium text-slate-800">
                  {isAlreadySubscribed ? "✅ Active Subscription" : 
                   subscription.is_trial_active ? `⏳ Trial (${subscription.days_remaining} days remaining)` : 
                   "❌ Trial Expired"}
                </p>
                {subscription.plan_type && (
                  <p className="text-xs text-slate-500">Plan: {subscription.plan_type}</p>
                )}
                {subscription.trial_end && (
                  <p className="text-xs text-slate-500">
                    Trial ends: {new Date(subscription.trial_end).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
            {isAlreadySubscribed && (
              <button
                onClick={() => navigate("/settings")}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
              >
                Manage Subscription
              </button>
            )}
          </div>
        </div>
      )}

      {/* Plans */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map(plan => {
          const isCurrentPlan = subscription?.plan_type === plan.id;
          const isLocked = !subscription?.is_trial_active && !subscription?.is_subscription_active;

          return (
            <div
              key={plan.id}
              className={`relative bg-white rounded-2xl border-2 p-6 cursor-pointer transition-all ${
                selectedPlan === plan.id ? "border-indigo-500 shadow-lg" : "border-slate-200 hover:border-indigo-300"
              } ${isCurrentPlan ? "border-emerald-500 bg-emerald-50/30" : ""}`}
              onClick={() => !isCurrentPlan && setSelectedPlan(plan.id)}
            >
              {isCurrentPlan && (
                <div className="absolute -top-3 right-4 bg-emerald-500 text-white text-[10px] font-semibold px-3 py-0.5 rounded-full">
                  Current Plan
                </div>
              )}
              
              <div className="text-lg font-bold text-slate-800">{plan.name}</div>
              <div className="mt-2 flex items-baseline">
                <span className="text-3xl font-bold text-slate-900">₹{plan.price}</span>
                <span className="text-sm text-slate-400 ml-1">/mo</span>
              </div>
              <ul className="mt-4 space-y-2">
                {plan.features.map((f: string) => (
                  <li key={f} className="text-sm text-slate-600 flex items-center gap-2">
                    <span className="text-emerald-500">✓</span> {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => !isCurrentPlan && handleUpgrade()}
                disabled={loading || isCurrentPlan || isLocked}
                className={`mt-6 w-full py-2.5 text-sm rounded-xl transition-colors ${
                  isCurrentPlan 
                    ? "bg-slate-100 text-slate-500 cursor-default"
                    : isLocked
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-indigo-600 text-white hover:bg-indigo-700"
                }`}
              >
                {loading ? "Processing..." : 
                 isCurrentPlan ? "✓ Current Plan" : 
                 isLocked ? "Upgrade Required" : 
                 subscription?.is_trial_active ? `Upgrade to ${plan.name}` : 
                 "Subscribe"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Lock Screen for Trial Expired */}
      {subscription && !subscription.is_trial_active && !subscription.is_subscription_active && (
        <div className="mt-8 bg-red-50 border-2 border-red-200 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock size={32} className="text-red-500" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">Your Trial Has Expired</h3>
          <p className="text-slate-500 mb-4">
            Choose a plan above to continue using Vigozen CRM.
          </p>
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Processing..." : "Upgrade Now"}
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-xs text-slate-400">
          Start with a 3-day free trial. No credit card required to upgrade.
        </p>
      </div>
    </div>
  );
}