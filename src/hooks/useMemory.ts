import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./useAuth";
import { getMemories, buildMemoryContext, extractMemoryCandidates, addMemory } from "@/lib/memory";
import type { Memory } from "@/lib/memory";

export function useMemory() {
  const { user } = useAuth();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoryContext, setMemoryContext] = useState("");
  // Track mounted state to prevent setState after unmount (critical fix)
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    getMemories(user.uid).then(m => {
      if (!mountedRef.current) return; // fix: don't setState if unmounted
      setMemories(m);
      setMemoryContext(buildMemoryContext(m));
    });
  }, [user]);

  const refreshMemories = useCallback(async () => {
    if (!user) return;
    const m = await getMemories(user.uid);
    if (!mountedRef.current) return;
    setMemories(m);
    setMemoryContext(buildMemoryContext(m));
  }, [user]);

  const tryExtractMemory = useCallback(async (userMsg: string) => {
    if (!user) return;
    const candidates = extractMemoryCandidates(userMsg);
    for (const content of candidates.slice(0, 2)) {
      const exists = memories.some(m =>
        m.content.toLowerCase().trim() === content.toLowerCase().trim()
      );
      if (!exists) {
        try {
          const id = await addMemory(user.uid, {
            type: "fact", content, tags: [], source: "inferred", pinned: false,
          });
          if (!mountedRef.current) return;
          const newMem: Memory = {
            id, userId: user.uid, type: "fact", content,
            tags: [], source: "inferred", pinned: false,
            createdAt: new Date(), updatedAt: new Date(),
          };
          setMemories(m => [newMem, ...m]);
        } catch {
          // background extraction — fail silently
        }
      }
    }
  }, [user, memories]);

  return { memories, memoryContext, refreshMemories, tryExtractMemory };
}
