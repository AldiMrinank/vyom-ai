import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./useAuth";
import { getMemories, buildMemoryContext, extractMemoryCandidates, addMemory } from "@/lib/memory";
import type { Memory } from "@/lib/memory";

const MEMORY_CACHE_KEY = "vyom_memory_cache";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface MemoryCache { uid: string; memories: Memory[]; context: string; at: number }

function loadCache(uid: string): { memories: Memory[]; context: string } | null {
  try {
    const raw = sessionStorage.getItem(MEMORY_CACHE_KEY);
    if (!raw) return null;
    const c: MemoryCache = JSON.parse(raw);
    if (c.uid !== uid || Date.now() - c.at > CACHE_TTL_MS) return null;
    // Restore Date objects
    c.memories.forEach(m => { m.createdAt = new Date(m.createdAt); m.updatedAt = new Date(m.updatedAt); });
    return { memories: c.memories, context: c.context };
  } catch { return null; }
}

function saveCache(uid: string, memories: Memory[], context: string) {
  try {
    sessionStorage.setItem(MEMORY_CACHE_KEY, JSON.stringify({ uid, memories, context, at: Date.now() }));
  } catch {}
}

export function useMemory() {
  const { user } = useAuth();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoryContext, setMemoryContext] = useState("");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    // Try cache first — avoids a Firestore read on every navigation
    const cached = loadCache(user.uid);
    if (cached) {
      setMemories(cached.memories);
      setMemoryContext(cached.context);
      return;
    }
    getMemories(user.uid).then(m => {
      if (!mountedRef.current) return;
      const ctx = buildMemoryContext(m);
      setMemories(m);
      setMemoryContext(ctx);
      saveCache(user.uid, m, ctx);
    });
  }, [user]);

  const refreshMemories = useCallback(async () => {
    if (!user) return;
    const m = await getMemories(user.uid);
    if (!mountedRef.current) return;
    const ctx = buildMemoryContext(m);
    setMemories(m);
    setMemoryContext(ctx);
    saveCache(user.uid, m, ctx);
  }, [user]);

  const tryExtractMemory = useCallback(async (userMsg: string) => {
    if (!user) return null;
    const candidates = extractMemoryCandidates(userMsg);
    let savedAny = false;
    const newMems: Memory[] = [];

    for (const content of candidates.slice(0, 2)) {
      const exists = memories.some(m =>
        m.content.toLowerCase().trim() === content.toLowerCase().trim()
      );
      if (!exists) {
        try {
          const id = await addMemory(user.uid, {
            type: "fact", content, tags: [], source: "inferred", pinned: false,
          });
          if (!mountedRef.current) return null;
          const newMem: Memory = {
            id, userId: user.uid, type: "fact", content,
            tags: [], source: "inferred", pinned: false,
            createdAt: new Date(), updatedAt: new Date(),
          };
          newMems.push(newMem);
          savedAny = true;
        } catch {}
      }
    }

    if (savedAny && mountedRef.current) {
      // BUG FIX: update memoryContext after saving — was never refreshed before
      const updated = [...newMems, ...memories];
      const ctx = buildMemoryContext(updated);
      setMemories(updated);
      setMemoryContext(ctx);
      saveCache(user.uid, updated, ctx);
      return newMems[0]?.content ?? null; // return first new memory for UI notification
    }
    return null;
  }, [user, memories]);

  return { memories, memoryContext, refreshMemories, tryExtractMemory };
}
