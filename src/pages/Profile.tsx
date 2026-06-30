import { Settings, ChevronRight, Pencil, LogOut, Loader2, Check, X, Lock, Cpu, Sun, Moon, Bell, Star, Zap, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import profileBg from "@/assets/profile-bg.jpg";
import { doc, getDoc, setDoc, collection, getCountFromServer, query, where, serverTimestamp } from "firebase/firestore";
import { updatePassword, updateProfile } from "firebase/auth";
import { auth, db } from "@/integrations/firebase/config";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MODELS, loadSettings, saveSettings, applyFontSize, VyomSettings } from "@/lib/settings";
import { useTheme, ACCENTS } from "@/context/ThemeContext";
import Skeleton from "@/components/Skeleton";

interface Profile { displayName: string | null; avatarUrl: string | null; bio: string | null }
type Modal = null | "edit" | "password" | "settings";

const ToggleSwitch = ({ on, onToggle }: { on: boolean; onToggle: () => void }) => (
  <button onClick={onToggle}
    className={`relative flex h-6 w-11 items-center rounded-full border-2 transition-all duration-200 ${on ? "bg-violet-600 border-violet-500" : "bg-white/10 border-white/20"}`}>
    <span className={`absolute h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${on ? "translate-x-5" : "translate-x-0.5"}`} />
  </button>
);

const Profile = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { theme, accent, setTheme, setAccent } = useTheme();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState({ chats: 0, searches: 0 });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Modal>(null);
  const [form, setForm] = useState<Profile>({ displayName: "", avatarUrl: "", bio: "" });
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [settings, setSettings] = useState<VyomSettings>(loadSettings());

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    // Build a baseline profile from Auth immediately — so the page renders
    // even if Firestore is unavailable (e.g. no network, mobile persistence failure)
    const fallbackName = user.displayName || user.email?.split("@")[0] || "Vyom User";
    const baseProfile: Profile = {
      displayName: fallbackName,
      avatarUrl: user.photoURL || null,
      bio: null,
    };

    if (!db) {
      // No Firestore — show Auth-only profile immediately, no infinite skeleton
      setProfile(baseProfile);
      setForm({ displayName: fallbackName, avatarUrl: user.photoURL || "", bio: "" });
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        // Use Promise.allSettled so one failure doesn't block the other
        const [userResult, countResult] = await Promise.allSettled([
          getDoc(doc(db!, "users", user.uid)),
          getCountFromServer(query(collection(db!, "conversations"), where("userId", "==", user.uid))),
        ]);

        if (cancelled) return;

        // Merge Firestore data on top of Auth fallback
        let pp = baseProfile;
        if (userResult.status === "fulfilled") {
          const data = userResult.value.data() as Profile | undefined;
          pp = {
            displayName: data?.displayName || fallbackName,
            avatarUrl:   data?.avatarUrl   || user.photoURL || null,
            bio:         data?.bio         || null,
          };
        }

        const chatCount = countResult.status === "fulfilled"
          ? countResult.value.data().count
          : 0;

        const searches = Number(sessionStorage.getItem(`vyom_searches_${user.uid}`) ?? 0);

        setProfile(pp);
        setForm({ displayName: pp.displayName ?? "", avatarUrl: pp.avatarUrl ?? "", bio: pp.bio ?? "" });
        setStats({ chats: chatCount, searches });
      } catch (err) {
        console.error("Profile load error:", err);
        // Always fall back to showing the Auth-based profile
        if (!cancelled) {
          setProfile(baseProfile);
          setForm({ displayName: fallbackName, avatarUrl: user.photoURL || "", bio: "" });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const trimmed = form.displayName?.trim() || null;
    try {
      const updates: Promise<any>[] = [
        updateProfile(user, { displayName: trimmed || "" }),
      ];
      if (db) {
        updates.push(
          setDoc(doc(db, "users", user.uid), {
            displayName: trimmed,
            avatarUrl: form.avatarUrl?.trim() || null,
            bio: form.bio?.trim() || null,
            email: user.email,
            updatedAt: serverTimestamp(),
          }, { merge: true })
        );
      }
      await Promise.all(updates);
      setProfile({ ...form, displayName: trimmed });
      setModal(null);
      haptic([10, 50, 10]);
      toast.success("Profile updated");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (!pw.next || pw.next !== pw.confirm) { toast.error("Passwords don't match"); return; }
    if (pw.next.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setSaving(true);
    try {
      await updatePassword(user!, pw.next);
      setPw({ next: "", confirm: "" });
      setModal(null);
      haptic([10, 50, 10]);
      toast.success("Password changed");
    } catch (err: any) {
      toast.error(err.code === "auth/requires-recent-login"
        ? "Please sign out and sign in again to change password."
        : err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveSettingsAndClose = () => {
    saveSettings(settings);
    applyFontSize(settings.fontSize);
    setModal(null);
    haptic(10);
    toast.success("Settings saved");
  };

  // Show skeleton only briefly — max 5s timeout safety net
  useEffect(() => {
    const t = setTimeout(() => {
      if (loading) {
        setLoading(false);
        if (!profile && user) {
          const fallbackName = user.displayName || user.email?.split("@")[0] || "Vyom User";
          setProfile({ displayName: fallbackName, avatarUrl: user.photoURL || null, bio: null });
        }
      }
    }, 5000);
    return () => clearTimeout(t);
  }, [loading, profile, user]);

  if (loading) return (
    <div className="px-6 pt-6 space-y-4">
      <Skeleton className="h-64 rounded-3xl" />
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-14 rounded-2xl" />
      <Skeleton className="h-14 rounded-2xl" />
    </div>
  );

  // If no user at all (shouldn't happen behind ProtectedRoute, but guard anyway)
  if (!profile) return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-white/40 px-6 text-center">
      <p className="text-sm">Couldn't load profile.</p>
      <button onClick={() => window.location.reload()}
        className="rounded-xl bg-violet-600/20 border border-violet-500/30 px-4 py-2 text-sm text-violet-300 active:scale-95 transition">
        Retry
      </button>
    </div>
  );

  const initial = (profile.displayName || user?.email || "?").charAt(0).toUpperCase();
  const modelLabel = MODELS.find(m => m.id === settings.model)?.label ?? "Auto";

  return (
    <div>
      {/* Hero banner */}
      <div className="relative h-72 overflow-hidden">
        <img src={profileBg} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#080810]/40 to-[#080810]" />

        {/* Top actions */}
        <div className="relative flex items-center justify-between px-5 pt-5">
          <div />
          <div className="flex items-center gap-2">
            <button onClick={() => toast.info("Notifications coming soon")}
              className="glass flex h-10 w-10 items-center justify-center rounded-2xl active:scale-95 transition">
              <Bell className="h-4 w-4" />
            </button>
            <button onClick={() => { haptic(8); setModal("edit"); }}
              className="glass flex h-10 w-10 items-center justify-center rounded-2xl active:scale-95 transition">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={() => { haptic(8); setModal("settings"); }}
              className="glass flex h-10 w-10 items-center justify-center rounded-2xl active:scale-95 transition">
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Avatar */}
        <div className="relative mt-3 flex flex-col items-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full opacity-70 blur-xl"
              style={{ background: "linear-gradient(135deg,#8B5CF6,#3B82F6)" }} />
            <div className="relative h-28 w-28 rounded-full p-[3px]"
              style={{ background: "linear-gradient(135deg,#8B5CF6,#3B82F6,#22D3EE)" }}>
              <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[#120825]">
                {profile.avatarUrl
                  ? <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
                  : <span className="font-display text-4xl font-bold gradient-text">{initial}</span>}
              </div>
            </div>
            <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full bg-green-400 border-2 border-[#080810] shadow-[0_0_8px_rgba(74,222,128,0.9)]" />
          </div>
          <h2 className="mt-3 font-display text-2xl font-bold">{profile.displayName || "Vyom User"}</h2>
          <p className="max-w-[80%] text-center text-xs text-muted-foreground mt-0.5">{profile.bio || user?.email}</p>
        </div>
      </div>

      <div className="px-5 -mt-2 pb-8 space-y-4">

        {/* Stats row */}
        <div className="glass-card grid grid-cols-4 divide-x divide-border/50 rounded-2xl py-4">
          {[
            { label: "Chats",    value: stats.chats,                                       icon: MessageSquare },
            { label: "Model",    value: modelLabel.split(" ")[0],                          icon: Cpu          },
            { label: "Theme",    value: theme.charAt(0).toUpperCase() + theme.slice(1),    icon: Sun          },
            { label: "Searches", value: stats.searches,                                    icon: Zap          },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex flex-col items-center gap-0.5 px-1">
              <Icon className="h-3.5 w-3.5 text-muted-foreground mb-0.5" />
              <p className="font-display text-base font-bold leading-none">{value}</p>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* Upgrade card */}
        <div className="relative overflow-hidden rounded-2xl p-4 border border-violet-500/30"
          style={{ background: "linear-gradient(135deg, hsl(263 60% 18% / 0.8), hsl(250 60% 12% / 0.6))" }}>
          <div className="absolute right-3 top-3 rounded-full bg-violet-500/20 px-2.5 py-0.5 text-[10px] font-bold text-violet-300 border border-violet-500/30">FREE</div>
          <div className="flex items-center gap-2 mb-1.5">
            <Star className="h-4 w-4 text-amber-400" fill="currentColor" />
            <p className="font-semibold text-sm">Vyom Free</p>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3">Unlimited chats · 7 free models · Voice mode</p>
          <button onClick={() => toast.info("Pro plan coming soon! 🚀")}
            className="w-full rounded-xl py-2 text-sm font-semibold text-white transition active:scale-95"
            style={{ background: "linear-gradient(90deg,#8B5CF6,#6D28D9)" }}>
            Upgrade to Pro ✨
          </button>
        </div>

        {/* Settings rows */}
        <div className="space-y-2">
          {[
            { icon: Pencil,   label: "Edit Profile",        sub: "Name, avatar, bio",           action: () => setModal("edit")     },
            { icon: Cpu,      label: "AI Settings",         sub: "Model & system prompt",        action: () => setModal("settings") },
            { icon: Settings, label: "App Settings",        sub: "Theme, font size & behaviour", action: () => setModal("settings") },
            { icon: Lock,     label: "Change Password",     sub: "Update your password",         action: () => setModal("password") },
          ].map(({ icon: Icon, label, sub, action }) => (
            <button key={label} onClick={() => { haptic(8); action(); }}
              className="glass flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition active:scale-[0.99] border border-white/[0.06] hover:border-violet-500/20">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.1))" }}>
                <Icon className="h-4 w-4 text-violet-400" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-[11px] text-muted-foreground">{sub}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
            </button>
          ))}

          <button onClick={async () => { haptic([10, 50, 10]); await signOut(); navigate("/auth"); }}
            className="flex w-full items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3.5 text-left transition active:scale-[0.99] hover:bg-red-500/10">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/15">
              <LogOut className="h-4 w-4 text-red-400" />
            </span>
            <p className="text-sm font-semibold text-red-400">Sign Out</p>
          </button>
        </div>

        {/* Session info */}
        <div className="glass rounded-2xl px-4 py-3.5 space-y-2 border border-white/[0.06]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Session Info</p>
          {[
            ["Email",       user?.email],
            ["Last sign in", user?.metadata?.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"],
            ["Created",     user?.metadata?.creationTime   ? new Date(user.metadata.creationTime).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "—"],
            ["Provider",    user?.providerData?.[0]?.providerId?.replace(".com", "") || "email"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{k}</span>
              <span className="text-white/70 truncate ml-4 max-w-[180px]">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-md"
          onClick={() => setModal(null)}>
          <div className="glass-card m-4 w-full max-w-md shadow-neon animate-slide-up"
            onClick={e => e.stopPropagation()}>

            {modal === "edit" && (
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-display text-lg font-semibold">Edit Profile</h3>
                  <button onClick={() => setModal(null)} className="text-muted-foreground hover:text-white transition"><X className="h-5 w-5" /></button>
                </div>
                {[
                  { label: "Display name", key: "displayName", placeholder: "Your name" },
                  { label: "Avatar URL",   key: "avatarUrl",   placeholder: "https://…" },
                ].map(({ label, key, placeholder }) => (
                  <div key={key} className="space-y-1">
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</label>
                    <input value={(form as any)[key] ?? ""} placeholder={placeholder}
                      onChange={e => setForm({ ...form, [key]: e.target.value })}
                      className="w-full rounded-xl border border-border bg-white/5 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500" />
                  </div>
                ))}
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Bio</label>
                  <textarea value={form.bio ?? ""} rows={2} onChange={e => setForm({ ...form, bio: e.target.value })}
                    className="w-full resize-none rounded-xl border border-border bg-white/5 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500" />
                </div>
                <button onClick={saveProfile} disabled={saving}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl font-semibold text-white disabled:opacity-60 active:scale-95 transition"
                  style={{ background: "linear-gradient(135deg,#8B5CF6,#6D28D9)" }}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4" />Save</>}
                </button>
              </div>
            )}

            {modal === "password" && (
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-display text-lg font-semibold">Change Password</h3>
                  <button onClick={() => setModal(null)} className="text-muted-foreground hover:text-white transition"><X className="h-5 w-5" /></button>
                </div>
                {[
                  { label: "New password",     key: "next",    placeholder: "Min 6 characters"   },
                  { label: "Confirm password", key: "confirm", placeholder: "Repeat new password" },
                ].map(({ label, key, placeholder }) => (
                  <div key={key} className="space-y-1">
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</label>
                    <input type="password" value={(pw as any)[key]} placeholder={placeholder}
                      onChange={e => setPw(p => ({ ...p, [key]: e.target.value }))}
                      className="w-full rounded-xl border border-border bg-white/5 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500" />
                  </div>
                ))}
                <button onClick={changePassword} disabled={saving}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl font-semibold text-white disabled:opacity-60 active:scale-95 transition"
                  style={{ background: "linear-gradient(135deg,#8B5CF6,#6D28D9)" }}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Lock className="h-4 w-4" />Update Password</>}
                </button>
              </div>
            )}

            {modal === "settings" && (
              <div className="p-5 space-y-5 max-h-[85vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-semibold">Settings</h3>
                  <button onClick={() => setModal(null)} className="text-muted-foreground hover:text-white transition"><X className="h-5 w-5" /></button>
                </div>

                {/* Theme */}
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Theme</label>
                  <div className="flex gap-2">
                    {(["dark", "light"] as const).map(t => (
                      <button key={t} onClick={() => { setTheme(t); haptic(8); }}
                        className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 border text-sm font-medium transition active:scale-95 ${theme === t ? "border-violet-500 bg-violet-500/10 text-white" : "border-white/10 bg-white/5 text-muted-foreground"}`}>
                        {t === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                        {t === "dark" ? "Dark" : "Light"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accent */}
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Accent Color</label>
                  <div className="grid grid-cols-4 gap-2">
                    {ACCENTS.map(a => (
                      <button key={a.id} onClick={() => { setAccent(a.id); haptic(8); }}
                        className={`relative flex flex-col items-center gap-1.5 rounded-xl p-2 border transition active:scale-95 ${accent === a.id ? "border-white/50" : "border-transparent hover:border-white/20"}`}>
                        <div className="w-8 h-8 rounded-full" style={{ background: `linear-gradient(135deg,${a.from},${a.to})` }} />
                        <span className="text-[10px] text-muted-foreground">{a.label}</span>
                        {accent === a.id && <Check className="absolute top-1 right-1 h-3 w-3 text-white" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font size */}
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Font Size</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[{ id: "sm", label: "Small" }, { id: "md", label: "Normal" }, { id: "lg", label: "Large" }, { id: "xl", label: "X-Large" }].map(f => (
                      <button key={f.id} onClick={() => setSettings(s => ({ ...s, fontSize: f.id as any }))}
                        className={`rounded-xl py-2 text-xs font-medium border transition active:scale-95 ${settings.fontSize === f.id ? "border-violet-500 bg-violet-500/10 text-white" : "border-white/10 bg-white/5 text-muted-foreground"}`}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* AI Model */}
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground">AI Model</label>
                  <div className="space-y-1.5">
                    {MODELS.map(m => (
                      <button key={m.id} onClick={() => setSettings(s => ({ ...s, model: m.id }))}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left border transition active:scale-95 ${settings.model === m.id ? "border-violet-500 bg-violet-500/10" : "border-white/10 bg-white/5"}`}>
                        <Cpu className={`h-4 w-4 shrink-0 ${settings.model === m.id ? "text-violet-400" : "text-muted-foreground"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{m.label}</p>
                          <p className="text-[11px] text-muted-foreground">{m.desc}</p>
                        </div>
                        {settings.model === m.id && <Check className="h-4 w-4 text-violet-400 shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* System prompt */}
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Custom Instructions</label>
                  <textarea value={settings.systemPrompt} rows={4}
                    onChange={e => setSettings(s => ({ ...s, systemPrompt: e.target.value }))}
                    className="w-full resize-none rounded-xl border border-border bg-white/5 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500" />
                </div>

                {/* Auto-clear */}
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Auto-clear Old Chats</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[{ d: 0, label: "Never" }, { d: 30, label: "30d" }, { d: 90, label: "90d" }, { d: 365, label: "1yr" }].map(o => (
                      <button key={o.d} onClick={() => setSettings(s => ({ ...s, autoClearDays: o.d }))}
                        className={`rounded-xl py-2 text-xs font-medium border transition active:scale-95 ${settings.autoClearDays === o.d ? "border-violet-500 bg-violet-500/10 text-white" : "border-white/10 bg-white/5 text-muted-foreground"}`}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Toggles */}
                <div className="space-y-3">
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Behaviour</label>
                  {[
                    { key: "sendOnEnter", label: "Send on Enter",  sub: "Shift+Enter for newline" },
                    { key: "compactMode", label: "Compact Mode",   sub: "Smaller message bubbles" },
                  ].map(({ key, label, sub }) => (
                    <div key={key} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                      <div><p className="text-sm font-medium">{label}</p><p className="text-[11px] text-muted-foreground">{sub}</p></div>
                      <ToggleSwitch on={(settings as any)[key]} onToggle={() => setSettings(s => ({ ...s, [key]: !(s as any)[key] }))} />
                    </div>
                  ))}
                </div>

                <button onClick={saveSettingsAndClose}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl font-semibold text-white active:scale-95 transition"
                  style={{ background: "linear-gradient(135deg,#8B5CF6,#6D28D9)" }}>
                  <Check className="h-4 w-4" />Save Settings
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
