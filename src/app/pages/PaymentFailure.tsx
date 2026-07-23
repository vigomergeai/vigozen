import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { XCircle } from 'lucide-react';

export default function PaymentFailure() {
  const navigate = useNavigate();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('status');
    const error = urlParams.get('error') || 'Payment was unsuccessful';

    toast.error(error);

    // Redirect after 5 seconds
    const timer = setTimeout(() => {
      navigate('/settings');
    }, 5000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-lg text-center max-w-md w-full">
        <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <XCircle size={40} className="text-red-600 dark:text-red-400" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
          Payment Failed ❌
        </h2>
        <p className="text-slate-500 dark:text-slate-400">
          Your payment could not be processed.
        </p>
        <p className="text-slate-400 dark:text-slate-500 text-sm mt-2">
          Please try again or use a different payment method.
        </p>
        <button
          onClick={() => navigate('/settings')}
          className="mt-6 px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
        >
          Go to Settings
        </button>
      </div>
    </div>
  );
}