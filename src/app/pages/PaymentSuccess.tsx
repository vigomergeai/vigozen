import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { CheckCircle } from 'lucide-react';

export default function PaymentSuccess() {
  const navigate = useNavigate();

  useEffect(() => {
    const verifyPayment = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      
      const txnid = urlParams.get('txnid');
      const status = urlParams.get('status');
      const hash = urlParams.get('hash');
      const amount = urlParams.get('amount');
      const productinfo = urlParams.get('productinfo');
      const firstname = urlParams.get('firstname');
      const email = urlParams.get('email');
      const mihpayid = urlParams.get('mihpayid');
      const plan = urlParams.get('plan');

      if (!txnid || !status) {
        toast.error('Invalid payment response');
        setTimeout(() => navigate('/settings'), 2000);
        return;
      }

      try {
        const token = localStorage.getItem('token');
        if (!token) {
          toast.error('Please login again');
          navigate('/login');
          return;
        }

        const result = await api.payments.verify(
          {
            txnid,
            amount: parseFloat(amount || '0'),
            productinfo: productinfo || '',
            firstname: firstname || '',
            email: email || '',
            status: status,
            hash: hash || '',
            mihpayid: mihpayid || '',
            plan: plan || undefined,
          },
          token
        );

        if (result.success) {
          toast.success('Payment successful! 🎉');
          setTimeout(() => navigate('/settings'), 3000);
        } else {
          toast.error(result.message || 'Payment verification failed');
          setTimeout(() => navigate('/settings'), 3000);
        }
      } catch (error) {
        console.error('Verification failed:', error);
        toast.error('Payment verification failed');
        setTimeout(() => navigate('/settings'), 3000);
      }
    };

    verifyPayment();
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-lg text-center max-w-md w-full">
        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={40} className="text-green-600 dark:text-green-400" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
          Payment Successful! 🎉
        </h2>
        <p className="text-slate-500 dark:text-slate-400">
          Your payment has been processed successfully.
        </p>
        <p className="text-slate-400 dark:text-slate-500 text-sm mt-2">
          Redirecting to settings...
        </p>
        <div className="mt-6 w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    </div>
  );
}