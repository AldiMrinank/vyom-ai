import { Mic, Plus, Send } from "lucide-react";
import { Link } from "react-router-dom";
import { useState, FormEvent } from "react";

interface FloatingInputProps {
  onSend?: (text: string) => void;
  placeholder?: string;
}

const FloatingInput = ({ onSend, placeholder = "Ask Vyom anything…" }: FloatingInputProps) => {
  const [value, setValue] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    onSend?.(value.trim());
    setValue("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="fixed inset-x-0 bottom-24 z-40 mx-auto w-full max-w-md px-4"
    >
      <div className="glass-card relative flex items-center gap-2 rounded-full px-2 py-2 shadow-neon">
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
        />
        {value.trim() ? (
          <button
            type="submit"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-aurora text-primary-foreground shadow-glow transition active:scale-95"
          >
            <Send className="h-4 w-4" />
          </button>
        ) : (
          <Link
            to="/voice"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-aurora text-primary-foreground shadow-glow transition active:scale-95"
          >
            <Mic className="h-4 w-4" />
          </Link>
        )}
      </div>
    </form>
  );
};

export default FloatingInput;
