import React from "react";
import { useNavigate } from "react-router";
import { Lock, X } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}

export default function TrialExpiredModal({ isOpen, onClose, onUpgrade }: Props) {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 text-center relative text-slate-800">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-xl hover:bg-slate-100">
          <X size={16} />
        </button>
        
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock size={36} className="text-red-500" />
        </div>
        
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Your 3-Day Free Trial has ended</h2>
        <p className="text-slate-500 mb-6">
          Upgrade your plan to continue using all premium features.
        </p>
        
        <div className="flex flex-col gap-3">
          <button
            onClick={onUpgrade}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium transition-colors"
          >
            Upgrade Now
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
