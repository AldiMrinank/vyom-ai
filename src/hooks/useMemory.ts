import { useState, useEffect } from "react";
import { useAuth } from "./useAuth";
import { getMemories, buildMemoryContext, extractMemoryCandidates, addMemory } from "@/lib/memory";
import type { Memory } from "@/lib/memory";

/**
 * Hook that loads the user's memories and provides a context string
 * ready to inject into the system prompt, plus a helper to auto-extract
 * new memories from messages the user sends.
 */
export function useMemory() {
  const { user } = useAuth();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoryContext, setMemoryContext] = useState("");

  useEffect(() => {
    if (!user) return;
    getMemories(user.uid).then(m => {
      setMemories(m);
      setMemoryContext(buildMemoryContext(m));
    });
  }, [user]);

  const refreshMemories = async () => {
    if (!user) return;
    const m = await getMemories(user.uid);
    setMemories(m);
    setMemoryContext(buildMemoryContext(m));
  };

  /**
   * Silently try to extract a memory from a user message and store it.
   * Fires async/in the background — doesn't block the chat.
   */
  const tryExtractMemory = async (userMsg: string) => {
    if (!user) return;
    const candidates = extractMemoryCandidates(userMsg);
    for (const content of candidates.slice(0, 2)) {
      // Don't duplicate existing memories
      const exists = memories.some(m =>
        m.content.toLowerCase().trim() === content.toLowerCase().trim()
      );
      if (!exists) {
        const id = await addMemory(user.uid, {
          type: "fact",
          content,
          tags: [],
          source: "inferred",
          pinned: false,
        });
        const newMem: Memory = {
          id, userId: user.uid, type: "fact", content,
          tags: [], source: "inferred", pinned: false,
          createdAt: new Date(), updatedAt: new Date(),
        };
        setMemories(m => [newMem, ...m]);
      }
    }
  };

  return { memories, memoryContext, refreshMemories, tryExtractMemory };
}
