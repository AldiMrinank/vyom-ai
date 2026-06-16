import { useEffect, useState, useRef, FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, Loader2, CheckCircle2, Rocket, RefreshCw } from "lucide-react";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail,
  GoogleAuthProvider, signInWithPopup, updateProfile, reload,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/integrations/firebase/config";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { fireConfetti } from "@/lib/confetti";
import VyomOrb from "@/components/VyomOrb";

type Screen = "signin" | "signup" | "verify" | "success" | "forgot";

/* ── Icons ─────────────────────────────────────── */
const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

/* ── Reusable UI ────────────────────────────────── */
const BackBtn = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} className="w-9 h-9 rounded-full bg-white/8 border border-white/10 flex items-center justify-center">
    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
    </svg>
  </button>
);

const GradBtn = ({ onClick, type="button", disabled, children }: {
  onClick?: () => void; type?: "button"|"submit"; disabled?: boolean; children: React.ReactNode;
}) => (
  <button type={type} onClick={onClick} disabled={disabled}
    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-purple-600 py-3.5 font-semibold text-white shadow-lg shadow-purple-500/30 transition active:scale-[0.99] disabled:opacity-60">
    {children}
  </button>
);

const Field = ({ icon, right, children }: { icon: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) => (
  <div className="flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3.5 bg-white/5">
    <span className="text-white/40 shrink-0">{icon}</span>
    {children}
    {right && <span className="text-white/40 shrink-0">{right}</span>}
  </div>
);

const Divider = ({ text }: { text: string }) => (
  <div className="my-5 flex items-center gap-3 w-full text-[10px] uppercase tracking-widest text-white/25">
    <span className="h-px flex-1 bg-white/10"/>{text}<span className="h-px flex-1 bg-white/10"/>
  </div>
);

const MailOrb = () => (
  <div className="w-36 h-36 rounded-full bg-gradient-to-br from-cyan-500/80 to-purple-700/80 flex items-center justify-center shadow-[0_0_60px_rgba(99,102,241,0.5)]">
    <div className="w-28 h-28 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
      <Mail className="w-12 h-12 text-white"/>
    </div>
  </div>
);

const SuccessOrb = () => (
  <div className="relative w-44 h-44">
    <div className="w-44 h-44 rounded-full bg-gradient-to-br from-cyan-500/80 via-blue-600/70 to-purple-600/60 flex items-center justify-center shadow-[0_0_80px_rgba(99,102,241,0.6)]">
      <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
        <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
        </svg>
      </div>
    </div>
    {["top-0 right-6 bg-yellow-400","top-6 right-0 bg-cyan-400","bottom-4 left-1 bg-pink-500","bottom-0 left-10 bg-green-400","top-1 left-10 bg-purple-400"].map((c,i) => (
      <div key={i} className={`absolute w-2.5 h-2.5 rounded-full ${c}`}/>
    ))}
  </div>
);

/* ══════════════════════════════════════════════ */
const Auth = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [screen, setScreen] = useState<Screen>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [name, setName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showCpw, setShowCpw] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [terms, setTerms] = useState(true);
  const [privacy, setPrivacy] = useState(true);
  const [updates, setUpdates] = useState(true);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>|null>(null);

  useEffect(() => {
    if (user?.emailVerified) navigate("/", { replace: true });
    // If signed in but not verified, stay on verify screen
    if (user && !user.emailVerified && screen !== "verify") setScreen("verify");
  }, [user, navigate, screen]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  if (loading) return null;
  if (user?.emailVerified) return <Navigate to="/" replace/>;

  const withTimeout = <T,>(p: Promise<T>, ms=12000): Promise<T> =>
    Promise.race([p, new Promise<T>((_,rej) => setTimeout(() => rej(new Error("Request timed out. Try again.")), ms))]);

  /* ── Auth actions ── */
  const signIn = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const { user: u } = await withTimeout(signInWithEmailAndPassword(auth, email, password));
      if (!u.emailVerified) {
        toast.info("Please verify your email first.");
        setScreen("verify");
        return;
      }
      toast.success("Welcome back!");
    } catch (err: any) {
      const msgs: Record<string,string> = { "auth/invalid-credential":"Wrong email or password.", "auth/user-not-found":"No account with this email.", "auth/wrong-password":"Incorrect password." };
      toast.error(msgs[err.code] || err.message || "Sign in failed");
    } finally { setBusy(false); }
  };

  const signUp = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirmPw) { toast.error("Passwords don't match"); return; }
    if (!terms || !privacy) { toast.error("Please agree to Terms and Privacy Policy"); return; }
    setBusy(true);
    try {
      const { user: u } = await withTimeout(createUserWithEmailAndPassword(auth, email, password));
      await updateProfile(u, { displayName: name.trim() || email.split("@")[0] });
      await setDoc(doc(db, "users", u.uid), {
        displayName: name.trim() || email.split("@")[0],
        email, avatarUrl: null, bio: null,
        createdAt: serverTimestamp(),
      });
      await sendEmailVerification(u);
      toast.success("Verification email sent!");
      setScreen("verify");
      startPolling();
    } catch (err: any) {
      const msgs: Record<string,string> = { "auth/email-already-in-use":"An account with this email already exists.", "auth/weak-password":"Password must be at least 6 characters." };
      toast.error(msgs[err.code] || err.message || "Sign up failed");
    } finally { setBusy(false); }
  };

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        if (auth.currentUser) {
          await reload(auth.currentUser);
          if (auth.currentUser.emailVerified) {
            clearInterval(pollRef.current!);
            setScreen("success");
          }
        }
      } catch {}
    }, 3000);
  };

  const checkVerified = async () => {
    setChecking(true);
    try {
      if (auth.currentUser) {
        await reload(auth.currentUser);
        if (auth.currentUser.emailVerified) { setScreen("success"); }
        else toast.error("Email not verified yet. Check your inbox.");
      }
    } catch { toast.error("Failed to check. Try again."); }
    finally { setChecking(false); }
  };

  const resendVerification = async () => {
    if (!auth.currentUser) return;
    setBusy(true);
    try { await sendEmailVerification(auth.currentUser); toast.success("Verification email resent!"); }
    catch { toast.error("Failed to resend. Try again."); }
    finally { setBusy(false); }
  };

  const forgotPassword = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      await withTimeout(sendPasswordResetEmail(auth, email));
      toast.success("Password reset email sent!");
      setScreen("signin");
    } catch (err: any) {
      toast.error(err.code === "auth/user-not-found" ? "No account with this email." : err.message);
    } finally { setBusy(false); }
  };

  const googleSignIn = async () => {
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      const { user: u } = await signInWithPopup(auth, provider);
      // Create/update Firestore profile for Google users
      await setDoc(doc(db, "users", u.uid), {
        displayName: u.displayName || u.email?.split("@")[0],
        email: u.email, avatarUrl: u.photoURL, bio: null,
        createdAt: serverTimestamp(),
      }, { merge: true });
      navigate("/");
    } catch (err: any) {
      if (err.code !== "auth/popup-closed-by-user") toast.error("Google sign-in failed");
    } finally { setBusy(false); }
  };

  const Socials = () => (
    <div className="flex gap-3 w-full">
      <button onClick={googleSignIn} disabled={busy}
        className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-white/5 border border-white/10 py-3 transition hover:bg-white/8 active:scale-95 disabled:opacity-60">
        <GoogleIcon/><span className="text-sm font-medium">Google</span>
      </button>
    </div>
  );

  return (
    <div className="relative min-h-screen bg-[#080810] overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-indigo-700/10 blur-[130px]"/>
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] rounded-full bg-cyan-700/8 blur-[110px]"/>
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-sm flex-col items-center px-5 py-8 overflow-y-auto">

        {/* ═══ SIGN IN ═══ */}
        {screen==="signin" && (
          <div className="w-full flex flex-col items-center animate-fade-in">
            <div className="w-full h-9 mb-2"/>
            <div className="mt-2 mb-5"><VyomOrb size={150}/></div>
            <h1 className="font-display text-[2rem] font-bold text-white mb-1 tracking-tight">
              Welcome <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">back</span>
            </h1>
            <p className="text-sm text-white/45 mb-7">Log in to continue your AI journey</p>
            <form onSubmit={signIn} className="w-full space-y-3">
              <Field icon={<Mail className="h-4 w-4"/>}>
                <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email address" autoComplete="email" className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"/>
              </Field>
              <Field icon={<Lock className="h-4 w-4"/>} right={<button type="button" onClick={()=>setShowPw(!showPw)}>{showPw?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}</button>}>
                <input type={showPw?"text":"password"} required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"/>
              </Field>
              <div className="flex items-center justify-between pt-0.5">
                <button type="button" onClick={()=>setRememberMe(!rememberMe)} className="flex items-center gap-2 text-sm text-white/55">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${rememberMe?"border-cyan-500 bg-cyan-500":"border-white/30"}`}>
                    {rememberMe&&<div className="w-1.5 h-1.5 rounded-full bg-white"/>}
                  </div>Remember me
                </button>
                <button type="button" onClick={()=>setScreen("forgot")} className="text-sm text-cyan-400 font-medium">Forgot password?</button>
              </div>
              <GradBtn type="submit" disabled={busy}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<>Log in <ArrowRight className="h-4 w-4"/></>}</GradBtn>
            </form>
            <Divider text="Or continue with"/>
            <Socials/>
            <div className="mt-auto w-full pt-6 space-y-4">
              <button onClick={()=>setScreen("signup")} className="w-full flex items-center justify-center gap-1 rounded-2xl bg-white/5 border border-white/10 py-3.5 text-sm text-white/55">
                Don't have an account?&nbsp;<span className="text-cyan-400 font-semibold">Sign up</span>
              </button>
              <p className="text-center text-[11px] text-white/25">By continuing, you agree to our <span className="text-cyan-400">Terms of Use</span> and <span className="text-cyan-400">Privacy Policy</span></p>
            </div>
          </div>
        )}

        {/* ═══ SIGN UP ═══ */}
        {screen==="signup" && (
          <div className="w-full flex flex-col items-center animate-fade-in">
            <div className="w-full flex justify-between items-center mb-2">
              <BackBtn onClick={()=>setScreen("signin")}/>
              <button onClick={()=>setScreen("signin")} className="rounded-full bg-white/8 border border-white/10 px-4 py-1.5 text-sm text-white font-medium">Log in</button>
            </div>
            <div className="mt-2 mb-4"><VyomOrb size={130}/></div>
            <h1 className="font-display text-[2rem] font-bold text-white mb-1 tracking-tight">
              Create <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">your account</span>
            </h1>
            <p className="text-sm text-white/45 mb-5">Start your AI-powered journey</p>
            <form onSubmit={signUp} className="w-full space-y-3">
              <Field icon={<User className="h-4 w-4"/>}>
                <input value={name} onChange={e=>setName(e.target.value)} placeholder="Full name" className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"/>
              </Field>
              <Field icon={<Mail className="h-4 w-4"/>}>
                <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email address" autoComplete="email" className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"/>
              </Field>
              <Field icon={<Lock className="h-4 w-4"/>} right={<button type="button" onClick={()=>setShowPw(!showPw)}>{showPw?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}</button>}>
                <input type={showPw?"text":"password"} required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" autoComplete="new-password" className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"/>
              </Field>
              <Field icon={<Lock className="h-4 w-4"/>} right={<button type="button" onClick={()=>setShowCpw(!showCpw)}>{showCpw?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}</button>}>
                <input type={showCpw?"text":"password"} required value={confirmPw} onChange={e=>setConfirmPw(e.target.value)} placeholder="Confirm password" autoComplete="new-password" className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"/>
              </Field>
              <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3.5 space-y-3">
                {[{val:terms,set:setTerms,text:"I agree to the",link:"Terms of Use"},{val:privacy,set:setPrivacy,text:"I agree to the",link:"Privacy Policy"},{val:updates,set:setUpdates,text:"I want to receive updates and tips",link:null}].map(({val,set,text,link},i)=>(
                  <button key={i} type="button" onClick={()=>set(!val)} className="flex items-center gap-2.5 w-full">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${val?"bg-cyan-600":"bg-white/10 border border-white/20"}`}>
                      {val&&<CheckCircle2 className="w-3.5 h-3.5 text-white"/>}
                    </div>
                    <span className="text-xs text-white/65 text-left">{text} {link&&<span className="text-cyan-400 font-medium">{link}</span>}</span>
                  </button>
                ))}
              </div>
              <GradBtn type="submit" disabled={busy}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<>Create account <ArrowRight className="h-4 w-4"/></>}</GradBtn>
            </form>
            <Divider text="Or sign up with"/>
            <Socials/>
            <button onClick={()=>setScreen("signin")} className="mt-4 w-full flex items-center justify-center gap-1 rounded-2xl bg-white/5 border border-white/10 py-3.5 text-sm text-white/55">
              Already have an account?&nbsp;<span className="text-cyan-400 font-semibold">Log in</span>
            </button>
          </div>
        )}

        {/* ═══ VERIFY EMAIL ═══ */}
        {screen==="verify" && (
          <div className="w-full flex flex-col items-center animate-fade-in">
            <div className="w-full flex justify-start mb-2"><BackBtn onClick={()=>setScreen("signup")}/></div>
            <div className="mt-8 mb-6"><MailOrb/></div>
            <h1 className="font-display text-[2rem] font-bold text-white mb-1 tracking-tight">
              Check <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">your email</span>
            </h1>
            <p className="text-sm text-white/45 mb-2 text-center">We sent a verification link to</p>
            <p className="text-sm text-cyan-400 font-medium mb-8">{email || auth.currentUser?.email}</p>
            <div className="w-full rounded-2xl bg-white/5 border border-white/10 p-4 text-sm text-white/60 text-center mb-6 space-y-1">
              <p>1. Open the email from Firebase</p>
              <p>2. Click the verification link</p>
              <p>3. Come back and tap the button below</p>
            </div>
            <GradBtn onClick={checkVerified} disabled={checking}>
              {checking?<Loader2 className="h-4 w-4 animate-spin"/>:<><CheckCircle2 className="h-4 w-4"/>I've verified my email</>}
            </GradBtn>
            <button onClick={resendVerification} disabled={busy} className="mt-5 text-sm text-white/45">
              Didn't receive it?&nbsp;<span className="text-cyan-400 font-medium">Resend email</span>
            </button>
          </div>
        )}

        {/* ═══ SUCCESS ═══ */}
        {screen==="success" && (
          <div className="w-full flex flex-col items-center justify-center flex-1 py-12 animate-fade-in" ref={el => { if (el) fireConfetti(); }}>
            <div className="mb-8"><SuccessOrb/></div>
            <h1 className="font-display text-[2rem] font-bold text-white mb-2 tracking-tight">Welcome aboard! 🎉</h1>
            <p className="text-sm text-white/50 mb-8 text-center">Your account has been created successfully.</p>
            <div className="w-full rounded-2xl bg-white/5 border border-white/10 p-4 flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center shrink-0 shadow-lg">
                <Rocket className="w-6 h-6 text-white"/>
              </div>
              <p className="text-sm text-white/65">You're all set to explore the power of Vyom AI.</p>
            </div>
            <GradBtn onClick={()=>navigate("/")}>Continue to app <ArrowRight className="h-4 w-4"/></GradBtn>
          </div>
        )}

        {/* ═══ FORGOT PASSWORD ═══ */}
        {screen==="forgot" && (
          <div className="w-full flex flex-col items-center animate-fade-in">
            <div className="w-full flex justify-start mb-2"><BackBtn onClick={()=>setScreen("signin")}/></div>
            <div className="mt-8 mb-6">
              <div className="w-36 h-36 rounded-full bg-gradient-to-br from-cyan-500/80 to-purple-700/80 flex items-center justify-center shadow-[0_0_60px_rgba(99,102,241,0.5)]">
                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <Mail className="w-12 h-12 text-white"/>
                </div>
              </div>
            </div>
            <h1 className="font-display text-[2rem] font-bold text-white mb-1 tracking-tight">
              Reset <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">password</span>
            </h1>
            <p className="text-sm text-white/45 mb-8 text-center">Enter your email and we'll send a reset link</p>
            <form onSubmit={forgotPassword} className="w-full space-y-4">
              <Field icon={<Mail className="h-4 w-4"/>}>
                <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email address" autoComplete="email" className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"/>
              </Field>
              <GradBtn type="submit" disabled={busy}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<>Send reset link <ArrowRight className="h-4 w-4"/></>}</GradBtn>
            </form>
            <button onClick={()=>setScreen("signin")} className="mt-5 text-sm text-white/45">Back to <span className="text-cyan-400 font-medium">Sign in</span></button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Auth;
