import { useState } from "react";
import { ArrowRight, MessageSquare, Mic, Cpu } from "lucide-react";
import { haptic } from "@/lib/haptic";
import vyomLogo from "@/assets/vyom-logo.png";

const SLIDES = [
  { icon: <img src={vyomLogo} className="w-24 h-24 object-contain drop-shadow-[0_0_30px_rgba(139,92,246,0.8)]" alt="" />, title: "Welcome to Vyom AI", desc: "Your intelligent AI companion — chat, create, and explore with the power of AI." },
  { icon: <div className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center shadow-[0_0_40px_rgba(99,102,241,0.5)]"><MessageSquare className="w-12 h-12 text-white" /></div>, title: "Chat Naturally", desc: "Ask anything, get instant answers with markdown, code highlighting, and more." },
  { icon: <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.5)]"><Mic className="w-12 h-12 text-white" /></div>, title: "Voice Mode", desc: "Hands-free AI. Speak your question, Vyom responds with voice too." },
  { icon: <div className="w-24 h-24 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center shadow-[0_0_40px_rgba(249,115,22,0.5)]"><Cpu className="w-12 h-12 text-white" /></div>, title: "6 AI Models", desc: "DeepSeek, Gemini, Llama, and more. Pick your model in Profile → AI Settings." },
];

const Onboarding = ({ onDone }: { onDone: () => void }) => {
  const [slide, setSlide] = useState(0);
  const last = slide === SLIDES.length - 1;
  const s = SLIDES[slide];

  const next = () => {
    haptic(8);
    if (last) { localStorage.setItem("onboarded", "1"); onDone(); }
    else setSlide(n => n + 1);
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-[#080810] px-8 py-16">
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-8">
        {s.icon}
        <div>
          <h1 className="font-display text-2xl font-bold text-white mb-3">{s.title}</h1>
          <p className="text-sm text-white/55 leading-relaxed max-w-xs">{s.desc}</p>
        </div>
      </div>
      <div className="w-full space-y-5">
        <div className="flex justify-center gap-2">
          {SLIDES.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === slide ? "w-6 bg-cyan-400" : "w-1.5 bg-white/20"}`} />
          ))}
        </div>
        <button onClick={next} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-purple-600 py-3.5 font-semibold text-white shadow-lg">
          {last ? "Get Started" : "Next"} <ArrowRight className="h-4 w-4" />
        </button>
        {!last && <button onClick={() => { localStorage.setItem("onboarded","1"); onDone(); }} className="w-full text-sm text-white/30 py-1">Skip</button>}
      </div>
    </div>
  );
};

export default Onboarding;
