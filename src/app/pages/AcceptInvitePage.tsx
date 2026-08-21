import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { api } from "../lib/api";
import { AlertCircle, CheckCircle2, Loader2, ChevronRight, Eye, EyeOff } from "lucide-react";
import logo from "../../assets/Media.png";

export default function AcceptInvitePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [validating, setValidating] = useState(true);
  const [validToken, setValidToken] = useState(false);
  const [userInfo, setUserInfo] = useState<{ name?: string; email?: string } | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const validate = async () => {
      if (!token) {
        setValidToken(false);
        setValidating(false);
        return;
      }
      try {
        const res = await api.auth.validateInvite(token);
        setUserInfo(res.user);
        setValidToken(true);
      } catch (err) {
        setValidToken(false);
      } finally {
        setValidating(false);
      }
    };
    validate();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!/[^a-zA-Z0-9]/.test(password)) {
      setError("Password must contain at least 1 symbol (e.g., !@#$%).");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await api.auth.acceptInvite({ token, password });
      setSuccess(true);
      setTimeout(() => navigate("/login"), 2500);
    } catch (err: any) {
      setError("Something went wrong. Please try again or request a new invite.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0F1E] via-[#0D1530] to-[#0A0F1E] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <img src={logo} alt="Logo" className="h-5 w-5 object-contain" />
            </div>
            <div className="text-lg font-bold text-white">Vigozen CRM</div>
          </div>

          {validating ? (
            <div className="text-center py-8">
              <Loader2 size={24} className="animate-spin text-indigo-400 mx-auto mb-3" />
              <p className="text-sm text-slate-400">Validating your invitation...</p>
            </div>
          ) : !validToken ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                <AlertCircle size={28} className="text-red-400" />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">Invalid or Expired Invite</h2>
              <p className="text-sm text-slate-400 mb-6">
                This invitation link is no longer valid. Please contact your admin for a new invite.
              </p>
              <button
                onClick={() => navigate("/login")}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Back to Sign In
              </button>
            </div>
          ) : !success ? (
            <>
              <h2 className="text-xl font-bold text-white mb-1">Welcome{userInfo?.name ? `, ${userInfo.name}` : ""}!</h2>
              <p className="text-sm text-slate-400 mb-6">
                Set a password to activate your account{userInfo?.email ? ` for ${userInfo.email}` : ""}.
              </p>

              {error && (
                <div className="mb-4 flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-300">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all pr-10"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">
                    Confirm Password
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                    disabled={loading}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-500/30 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      Activate Account <ChevronRight size={16} />
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 size={28} className="text-emerald-400" />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">Account Activated!</h2>
              <p className="text-sm text-slate-400">
                Redirecting you to sign in...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
