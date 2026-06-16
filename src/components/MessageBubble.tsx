import { cn } from "@/lib/utils";
import { Sparkles, Copy, ThumbsUp, ThumbsDown, Share2 } from "lucide-react";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  time?: string;
}

const MessageBubble = ({ message }: { message: Message }) => {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex w-full gap-2 animate-slide-up", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-aurora shadow-glow">
          <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
        </span>
      )}
      <div className={cn("flex max-w-[78%] flex-col", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-3xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
            isUser
              ? "neon-border rounded-br-md bg-primary/15 text-foreground"
              : "glass rounded-bl-md text-foreground"
          )}
        >
          {message.content}
        </div>
        {!isUser && (
          <div className="mt-2 flex gap-1 px-1 text-muted-foreground">
            <button className="rounded-lg p-1.5 transition hover:bg-muted/60 hover:text-foreground"><Copy className="h-3.5 w-3.5" /></button>
            <button className="rounded-lg p-1.5 transition hover:bg-muted/60 hover:text-foreground"><ThumbsUp className="h-3.5 w-3.5" /></button>
            <button className="rounded-lg p-1.5 transition hover:bg-muted/60 hover:text-foreground"><ThumbsDown className="h-3.5 w-3.5" /></button>
            <button className="rounded-lg p-1.5 transition hover:bg-muted/60 hover:text-foreground"><Share2 className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
