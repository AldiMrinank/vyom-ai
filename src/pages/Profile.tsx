import { Settings, ChevronRight, Pencil, LogOut, Loader2, Check, X, Lock, Cpu, Sun, Moon } from "lucide-react";
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

interface Profile { displayName: string|null; avatarUrl: string|null; bio: string|null }
type Modal = null|"edit"|"password"|"settings";

const Profile = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { theme, accent, setTheme, setAccent } = useTheme();
  const [profile, setProfile] = useState<Profile|null>(null);
  const [stats, setStats] = useState({ chats:0, messages:0 });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Modal>(null);
  const [form, setForm] = useState<Profile>({ displayName:"", avatarUrl:"", bio:"" });
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ next:"", confirm:"" });
  const [settings, setSettings] = useState<VyomSettings>(loadSettings());

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [userSnap, convSnap] = await Promise.all([
        getDoc(doc(db,"users",user.uid)),
        getCountFromServer(query(collection(db,"conversations"),where("userId","==",user.uid))),
      ]);
      const fallback = user.displayName || user.email?.split("@")[0] || "";
      const data = userSnap.data() as Profile|undefined;
      const pp: Profile = { displayName: data?.displayName || fallback, avatarUrl: data?.avatarUrl || user.photoURL || null, bio: data?.bio || null };
      setProfile(pp);
      setForm({ displayName: pp.displayName??"", avatarUrl: pp.avatarUrl??"", bio: pp.bio??"" });
      setStats({ chats: convSnap.data().count, messages: 0 });
      setLoading(false);
    })();
  }, [user]);

  const saveProfile = async () => {
    if (!user) return; setSaving(true);
    const trimmed = form.displayName?.trim()||null;
    try {
      await Promise.all([
        setDoc(doc(db,"users",user.uid), { displayName:trimmed, avatarUrl:form.avatarUrl?.trim()||null, bio:form.bio?.trim()||null, email:user.email, updatedAt:serverTimestamp() }, { merge:true }),
        updateProfile(user, { displayName:trimmed||"" }),
      ]);
      setProfile(form); setModal(null); haptic([10,50,10]); toast.success("Profile updated");
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  const changePassword = async () => {
    if (!pw.next||pw.next!==pw.confirm) { toast.error("Passwords don't match"); return; }
    if (pw.next.length<6) { toast.error("Password must be at least 6 characters"); return; }
    setSaving(true);
    try { await updatePassword(user!, pw.next); setPw({next:"",confirm:""}); setModal(null); haptic([10,50,10]); toast.success("Password changed"); }
    catch (err:any) { toast.error(err.code==="auth/requires-recent-login"?"Please sign out and sign in again to change password.":err.message); }
    finally { setSaving(false); }
  };

  const saveSettingsAndClose = () => {
    saveSettings(settings); applyFontSize(settings.fontSize);
    setModal(null); haptic(10); toast.success("Settings saved");
  };

  if (loading||!profile) return <div className="px-6 pt-6 space-y-4"><Skeleton className="h-64 rounded-3xl"/><Skeleton className="h-20 rounded-2xl"/><Skeleton className="h-14 rounded-2xl"/><Skeleton className="h-14 rounded-2xl"/></div>;
  const initial = (profile.displayName||user?.email||"?").charAt(0).toUpperCase();

  return (
    <div>
      <div className="relative h-72 overflow-hidden">
        <img src={profileBg} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover"/>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/30 to-background"/>
        <div className="relative flex items-center justify-end gap-2 px-6 pt-6">
          <button onClick={()=>{haptic(8);setModal("edit");}} className="glass flex h-10 w-10 items-center justify-center rounded-2xl"><Pencil className="h-4 w-4"/></button>
          <button onClick={()=>{haptic(8);setModal("settings");}} className="glass flex h-10 w-10 items-center justify-center rounded-2xl"><Settings className="h-4 w-4"/></button>
        </div>
        <div className="relative mt-4 flex flex-col items-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-gradient-aurora blur-xl opacity-70 animate-orb-pulse"/>
            <div className="relative h-28 w-28 overflow-hidden rounded-full bg-gradient-aurora p-[3px] shadow-neon">
              <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-background">
                {profile.avatarUrl?<img src={profile.avatarUrl} alt="" className="h-full w-full object-cover"/>:<span className="font-display text-5xl font-bold gradient-text">{initial}</span>}
              </div>
            </div>
          </div>
          <h2 className="mt-3 font-display text-2xl font-bold">{profile.displayName||"Vyom User"}</h2>
          <p className="max-w-[80%] text-center text-xs text-muted-foreground">{profile.bio||user?.email}</p>
        </div>
      </div>

      <div className="px-6 -mt-4 pb-8">
        <div className="glass-card flex items-center justify-around px-4 py-4">
          <div className="flex-1 text-center"><p className="font-display text-xl font-bold">{stats.chats}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Chats</p></div>
          <span className="h-8 w-px bg-border"/>
          <div className="flex-1 text-center"><p className="font-display text-xl font-bold">{MODELS.find(m=>m.id===settings.model)?.label??"Auto"}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Model</p></div>
          <span className="h-8 w-px bg-border"/>
          <div className="flex-1 text-center"><p className="font-display text-xl font-bold capitalize">{theme}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Theme</p></div>
        </div>

        <div className="mt-4 space-y-2">
          {[{icon:Pencil,label:"Edit profile",sub:"Name, avatar, bio",action:()=>setModal("edit")},{icon:Lock,label:"Change password",sub:"Update your password",action:()=>setModal("password")},{icon:Cpu,label:"AI Settings",sub:"Model, theme & system prompt",action:()=>setModal("settings")}].map(({icon:Icon,label,sub,action})=>(
            <button key={label} onClick={()=>{haptic(8);action();}} className="glass group flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-left transition active:scale-[0.99]">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted"><Icon className="h-4 w-4"/></span>
              <div className="flex-1"><p className="text-sm font-semibold">{label}</p><p className="text-[11px] text-muted-foreground">{sub}</p></div>
              <ChevronRight className="h-4 w-4 text-muted-foreground"/>
            </button>
          ))}
          <button onClick={async()=>{haptic([10,50,10]);await signOut();navigate("/auth");}} className="glass group flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-left transition active:scale-[0.99]">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/20 text-destructive"><LogOut className="h-4 w-4"/></span>
            <div className="flex-1"><p className="text-sm font-semibold text-destructive">Sign out</p></div>
          </button>
          <div className="glass rounded-2xl px-4 py-3 space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Session Info</p>
            {[["Email",user?.email],["Last sign in",user?.metadata?.lastSignInTime?new Date(user.metadata.lastSignInTime).toLocaleDateString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"—"],["Created",user?.metadata?.creationTime?new Date(user.metadata.creationTime).toLocaleDateString([],{month:"short",day:"numeric",year:"numeric"}):"—"],["Provider",user?.providerData?.[0]?.providerId?.replace(".com","") || "email"]].map(([k,v])=>(
              <div key={k} className="flex justify-between text-xs"><span className="text-muted-foreground">{k}</span><span className="text-white/80 truncate ml-4 max-w-[180px]">{v}</span></div>
            ))}
          </div>
        </div>
      </div>

      {modal&&(
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-md">
          <div className="glass-card m-4 w-full max-w-md shadow-neon animate-slide-up">
            {modal==="edit"&&(
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between mb-1"><h3 className="font-display text-lg font-semibold">Edit Profile</h3><button onClick={()=>setModal(null)}><X className="h-4 w-4"/></button></div>
                {[{label:"Display name",key:"displayName",placeholder:"Your name"},{label:"Avatar URL",key:"avatarUrl",placeholder:"https://…"}].map(({label,key,placeholder})=>(
                  <div key={key} className="space-y-1"><label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</label><input value={(form as any)[key]??""} placeholder={placeholder} onChange={e=>setForm({...form,[key]:e.target.value})} className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-glow"/></div>
                ))}
                <div className="space-y-1"><label className="text-[11px] uppercase tracking-wider text-muted-foreground">Bio</label><textarea value={form.bio??""} rows={2} onChange={e=>setForm({...form,bio:e.target.value})} className="w-full resize-none rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-glow"/></div>
                <button onClick={saveProfile} disabled={saving} className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-aurora font-semibold text-primary-foreground shadow-glow disabled:opacity-60">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<><Check className="h-4 w-4"/>Save</>}</button>
              </div>
            )}
            {modal==="password"&&(
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between mb-1"><h3 className="font-display text-lg font-semibold">Change Password</h3><button onClick={()=>setModal(null)}><X className="h-4 w-4"/></button></div>
                {[{label:"New password",key:"next",placeholder:"Min 6 characters"},{label:"Confirm password",key:"confirm",placeholder:"Repeat new password"}].map(({label,key,placeholder})=>(
                  <div key={key} className="space-y-1"><label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</label><input type="password" value={(pw as any)[key]} placeholder={placeholder} onChange={e=>setPw(p=>({...p,[key]:e.target.value}))} className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-glow"/></div>
                ))}
                <button onClick={changePassword} disabled={saving} className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-aurora font-semibold text-primary-foreground shadow-glow disabled:opacity-60">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<><Lock className="h-4 w-4"/>Update Password</>}</button>
              </div>
            )}
            {modal==="settings"&&(
              <div className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">
                <div className="flex items-center justify-between"><h3 className="font-display text-lg font-semibold">AI Settings</h3><button onClick={()=>setModal(null)}><X className="h-4 w-4"/></button></div>
                <div className="space-y-2"><label className="text-[11px] uppercase tracking-wider text-muted-foreground">Theme</label><div className="flex gap-2">{(["dark","light"] as const).map(t=><button key={t} onClick={()=>{setTheme(t);haptic(8);}} className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 border text-sm font-medium transition ${theme===t?"border-cyan-500 bg-cyan-500/10 text-white":"border-white/10 bg-white/5 text-muted-foreground"}`}>{t==="dark"?<Moon className="h-4 w-4"/>:<Sun className="h-4 w-4"/>}{t==="dark"?"Dark":"Light"}</button>)}</div></div>
                <div className="space-y-2"><label className="text-[11px] uppercase tracking-wider text-muted-foreground">Accent Color</label><div className="grid grid-cols-4 gap-2">{ACCENTS.map(a=><button key={a.id} onClick={()=>{setAccent(a.id);haptic(8);}} className={`relative flex flex-col items-center gap-1.5 rounded-xl p-2 border transition ${accent===a.id?"border-white/60":"border-transparent"}`}><div className="w-8 h-8 rounded-full" style={{background:`linear-gradient(135deg,${a.from},${a.to})`}}/><span className="text-[10px] text-muted-foreground">{a.label}</span>{accent===a.id&&<Check className="absolute top-1 right-1 h-3 w-3 text-white"/>}</button>)}</div></div>
                <div className="space-y-2"><label className="text-[11px] uppercase tracking-wider text-muted-foreground">Font Size</label><div className="grid grid-cols-4 gap-2">{[{id:"sm",label:"Small"},{id:"md",label:"Normal"},{id:"lg",label:"Large"},{id:"xl",label:"X-Large"}].map(f=><button key={f.id} onClick={()=>setSettings(s=>({...s,fontSize:f.id as any}))} className={`rounded-xl py-2 text-xs font-medium border transition ${settings.fontSize===f.id?"border-cyan-500 bg-cyan-500/10 text-white":"border-white/10 bg-white/5 text-muted-foreground"}`}>{f.label}</button>)}</div></div>
                <div className="space-y-2"><label className="text-[11px] uppercase tracking-wider text-muted-foreground">AI Model</label><div className="space-y-1.5">{MODELS.map(m=><button key={m.id} onClick={()=>setSettings(s=>({...s,model:m.id}))} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition border ${settings.model===m.id?"border-cyan-500 bg-cyan-500/10":"border-white/10 bg-white/5 hover:bg-white/8"}`}><Cpu className={`h-4 w-4 shrink-0 ${settings.model===m.id?"text-cyan-400":"text-muted-foreground"}`}/><div className="flex-1 min-w-0"><p className="text-sm font-medium">{m.label}</p><p className="text-[11px] text-muted-foreground">{m.desc}</p></div>{settings.model===m.id&&<Check className="h-4 w-4 text-cyan-400 shrink-0"/>}</button>)}</div></div>
                <div className="space-y-2"><label className="text-[11px] uppercase tracking-wider text-muted-foreground">System Prompt</label><textarea value={settings.systemPrompt} rows={4} onChange={e=>setSettings(s=>({...s,systemPrompt:e.target.value}))} className="w-full resize-none rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-glow"/></div>
                <div className="space-y-2"><label className="text-[11px] uppercase tracking-wider text-muted-foreground">Auto-clear old chats</label><div className="grid grid-cols-4 gap-2">{[{d:0,label:"Never"},{d:30,label:"30 days"},{d:90,label:"90 days"},{d:365,label:"1 year"}].map(o=><button key={o.d} onClick={()=>setSettings(s=>({...s,autoClearDays:o.d}))} className={`rounded-xl py-2 text-xs font-medium border transition ${settings.autoClearDays===o.d?"border-cyan-500 bg-cyan-500/10 text-white":"border-white/10 bg-white/5 text-muted-foreground"}`}>{o.label}</button>)}</div><p className="text-[11px] text-muted-foreground">Conversations untouched for longer than this are deleted automatically when you open the app.</p></div>
                <button onClick={saveSettingsAndClose} className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-aurora font-semibold text-primary-foreground shadow-glow"><Check className="h-4 w-4"/>Save Settings</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
export default Profile;
