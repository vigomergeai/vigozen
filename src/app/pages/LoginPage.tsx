import React, { useState } from "react";
import { api } from "../lib/api";
import { useNavigate } from "react-router";
//import { Zap, Eye, EyeOff, Bot, Shield, User, AlertCircle, Loader2, ChevronRight } from "lucide-react";
import { Zap, Eye, EyeOff, Bot, AlertCircle, Loader2, ChevronRight } from "lucide-react";
import {z} from 'zod'
import { useApp } from "../context/AppContext";


//const DEMO_ACCOUNTS = [
  //{ label: "Admin", email: "admin@leadops360.com", password: "Admin@360!", role: "admin", color: "from-purple-500 to-indigo-600", icon: Shield, desc: "Full access · User management · All reports" },
  //{ label: "Sales Rep", email: "arjun@leadops360.com", password: "User@360!", role: "user", color: "from-emerald-500 to-teal-600", icon: User, desc: "Own leads · Sales pipeline · Reports" },
//];

const signUpSchema = z.object({
  name: z
    .string()
    .min(3, "Full Name Min Length is 3")
    .max(30, "Full Name Max Length is 30")
    .regex(
      /^[a-zA-Z]+(?:\s[a-zA-Z]+)*$/,
      "Special Characters or number are not allowed in Full Name",
    ),
  email: z
    .string()
    .min(1, "Email is Required")
    .regex(
      /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/,
      "Please Input a correct Email Field",
    ),
  password: z
    .string()
    .min(6, "Password must be atleast 6 characters")
    .max(12, "Password must be at most 12 characters")
    .regex(/[a-zA-Z]/, "Password must contain at least one letter")
    .regex(/\d/, "Password must contain at least one number")
    .regex(
      /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
      "Password must contain at least one special character",
    )
});

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is Required")
    .email("Please input a valid email address"),
  password: z
    .string()
    .min(1, "Password is Required"),
});
const getBrowserName = () => {
  const ua = navigator.userAgent;
  // Edge FIRST (since Edge contains 'Chrome' in its UA string)
  if (ua.includes('Edg/') || ua.includes('Edge/')) return 'Edge';
  if (ua.includes('Chrome/')) return 'Chrome';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Safari/')) return 'Safari';
  if (ua.includes('Opera/')) return 'Opera';
  return 'Unknown Browser';
};


const getOSName = () => {
  const ua = navigator.userAgent;
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac')) return 'Mac';
  if (ua.includes('iPhone')) return 'iPhone';
  if (ua.includes('iPad')) return 'iPad';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('Linux')) return 'Linux';
  return 'Unknown OS';
};

const getDeviceInfo = () => {
  return `${getBrowserName()} on ${getOSName()}`;
};
const getLocation = async () => {
  try {
    const data = await api.location.get();
    return `${data.city}, ${data.country_name}`;
  } catch (error) {
    return 'Unknown Location';
  }
};

// Function to create user session (non-blocking, best-effort)
const createUserSession = async (userId: string, token: string) => {
  const device = getDeviceInfo();
  const location = await getLocation();

  try {
    await api.sessions.create({ user_id: userId, device, location }, token);
  } catch (err) {
    console.warn('Session tracking skipped:', err);
  }
};
export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useApp();

  const [email, setEmail] = useState("");
  const [name, setName] = useState<string>("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState<Boolean>(true)
  const [error, setError] = useState("");
  const [demoLoading, setDemoLoading] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError("Please enter your email and password"); return; }

    const result = loginSchema.safeParse({email, password});

    if(!result.success){
      setError(result.error.issues[0].message);
      return;
    }

    setLoading(true);
    setError("");
    const loginResult = await login(email, password);
    if (loginResult.error) {
      setError(loginResult.error);
      setLoading(false);
    } else {
      const user = loginResult.user;
      const token = localStorage.getItem("token") || "";
      if (user?.id) {
        // Non-blocking session tracking
        createUserSession(user.id, token);

        const role = user.role;
        if (role === "admin") {
          navigate("/admin", { replace: true });
        } else {
          navigate("/", { replace: true });
        }
      }
    }
  };
const handleSignUp = async (e: React.FormEvent) => {
  e.preventDefault();

  const result = signUpSchema.safeParse({
    name,
    email,
    password
  });

  if (!result.success) {
    setError(result.error.issues[0].message);
    return;
  }

  setLoading(true);
  setError("");

  try {
    const data = await api.auth.signup({ name, email, password });

    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));

    navigate("/", { replace: true });

  } catch (err: any) {
    setError(err.message || "Signup failed");
  }

  setLoading(false);
};
    //const handleDemoLogin = async (acc: typeof DEMO_ACCOUNTS[0]) => {
   // setDemoLoading(acc.email);
    //setError("");
    //const result = await login(acc.email, acc.password);
    //if (result.error) {
      //setError(`Demo login failed: ${result.error}. The system may still be initializing (30-60s first run).`);
      //setDemoLoading(null);
    //} else {
      // Create session after successful demo login
      //const { data: { user } } = await supabase.auth.getUser();
     // if (user?.id) {
      //  await createUserSession(user.id);
      //}
      //navigate("/", { replace: true });
   // }
  //};
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0F1E] via-[#0D1530] to-[#0A0F1E] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-900/5 rounded-full blur-3xl" />
        {/* Grid pattern */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <div className="w-full max-w-4xl relative z-10 flex flex-col lg:flex-row gap-8 items-center">
        {/* Left: Branding */}
        <div className="lg:flex-1 text-center lg:text-left">
          <div className="flex items-center gap-3 justify-center lg:justify-start mb-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Zap size={24} className="text-white" />
            </div>
            <div>
              <div className="text-xl font-bold text-white">Vigozen CRM</div>
              <div className="text-xs text-indigo-300">
                AI-Powered CRM Platform
              </div>
            </div>
          </div>

          <h1 className="text-3xl lg:text-4xl font-bold text-white mb-4 leading-tight">
            Welcome back to
            <br />
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              vigozen crm
            </span>
          </h1>
          <p className="text-slate-400 mb-8 text-sm leading-relaxed max-w-xs mx-auto lg:mx-0">
            The AI-powered sales CRM that helps your team close more deals,
            faster. Leads, pipeline, and analytics — all in one place.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2 justify-center lg:justify-start">
            {[
              "AI Lead Scoring",
              "Real-time Analytics",
              "Pipeline Management",
              "Team Collaboration",
            ].map((f) => (
              <div
                key={f}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-xs text-slate-300"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                {f}
              </div>
            ))}
          </div>

          {/* AI indicator */}
          <div className="mt-8 flex items-center gap-3 justify-center lg:justify-start">
            <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 rounded-xl">
              <Bot size={16} className="text-indigo-400" />
              <span className="text-xs text-indigo-300 font-medium">
                AI Assistant Active
              </span>
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Right: Login card */}
        <div className="lg:w-[420px] w-full">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-1">{showLoginForm ? "Sign In": "Sign Up"}</h2>
            <p className="text-sm text-slate-400 mb-6">
              Enter your credentials to access the platform
            </p>

            {error && (
              <div className="mb-4 flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-300">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {showLoginForm && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@leadops360.com"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••"
                      className="w-full px-4 py-3 pr-12 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl font-medium text-sm transition-all shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      Sign In <ChevronRight size={16} />
                    </>
                  )}
                </button>
              </form>
            )}

            {!showLoginForm && (
              <form onSubmit={handleSignUp} className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">
                    Full Name
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="you@leadops360.com"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@leadops360.com"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••"
                      className="w-full px-4 py-3 pr-12 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl font-medium text-sm transition-all shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Signing Up...
                    </>
                  ) : (
                    <>
                      Sign Up <ChevronRight size={16} />
                    </>
                  )}
                </button>
              </form>
            )}

            <button
              className="w-full mt-5 py-3 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl font-medium text-sm transition-all shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2 disabled:opacity-60"
              onClick={() => setShowLoginForm(!showLoginForm)}
            >
              {showLoginForm ? "Sign Up" : "Sign In"}
            </button>
            
{/*
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center">
                <span className="px-3 bg-transparent text-xs text-slate-500">
                  Quick Demo Access
                </span>
              </div>
            </div>

            {/* Demo accounts 
            <div className="space-y-3">
              {DEMO_ACCOUNTS.map((acc) => {
                const Icon = acc.icon;
                const isLoading = demoLoading === acc.email;
                return (
                  <button
                    key={acc.email}
                    onClick={() => handleDemoLogin(acc)}
                    disabled={!!demoLoading || loading}
                    className="w-full flex items-center gap-3 p-3.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-2xl text-left transition-all group disabled:opacity-60"
                  >
                    <div
                      className={`w-10 h-10 rounded-xl bg-gradient-to-br ${acc.color} flex items-center justify-center flex-shrink-0 shadow-lg`}
                    >
                      {isLoading ? (
                        <Loader2
                          size={16}
                          className="text-white animate-spin"
                        />
                      ) : (
                        <Icon size={16} className="text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white">
                        {acc.label} Demo
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {acc.desc}
                      </div>
                    </div>
                    <ChevronRight
                      size={14}
                      className="text-slate-500 group-hover:text-white transition-colors flex-shrink-0"
                    />
                  </button>
                );
              })}
            </div>

            <p className="mt-6 text-center text-[11px] text-slate-500 leading-relaxed">
              Demo accounts seed automatically on first launch (may take
              30–60s).
              <br />
              Contact your admin if you need access.
            </p>*/}
          </div>
        </div>
      </div>
    </div>
  );
}
