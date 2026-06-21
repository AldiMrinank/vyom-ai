import {
  collection, addDoc, getDocs, updateDoc, deleteDoc,
  doc, query, where, orderBy, serverTimestamp, limit
} from "firebase/firestore";
import { db } from "@/integrations/firebase/config";
import type { Memory } from "./types";

const COL = (uid: string) => collection(db!, "users", uid, "memories");

export async function getMemories(uid: string): Promise<Memory[]> {
  try {
    const snap = await getDocs(query(COL(uid), orderBy("updatedAt", "desc"), limit(100)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Memory));
  } catch { return []; }
}

export async function addMemory(uid: string, memory: Omit<Memory, "id" | "userId" | "createdAt" | "updatedAt">): Promise<string> {
  const ref = await addDoc(COL(uid), {
    ...memory,
    userId: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateMemory(uid: string, id: string, content: string): Promise<void> {
  await updateDoc(doc(db!, "users", uid, "memories", id), {
    content,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteMemory(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(db!, "users", uid, "memories", id));
}

/**
 * Build an injected memory block to prepend to the system prompt.
 * Only includes the most relevant memories to avoid context bloat.
 */
export function buildMemoryContext(memories: Memory[]): string {
  if (!memories.length) return "";
  const pinned = memories.filter(m => m.pinned);
  const recent = memories.filter(m => !m.pinned).slice(0, 15);
  const all = [...pinned, ...recent];
  if (!all.length) return "";

  const lines = all.map(m => `- [${m.type}] ${m.content}`).join("\n");
  return `\n\n## What you know about this user:\n${lines}\n\nUse these memories to personalize your responses when relevant. Don't mention that you have these memories unless asked.`;
}

/**
 * Extract potential memories from a conversation exchange.
 * Returns a list of candidate memory strings for the AI to confirm.
 */
export function extractMemoryCandidates(userMsg: string): string[] {
  const candidates: string[] = [];
  const patterns = [
    { re: /(?:i am|i'm|i study|i'm studying)\s+(.+?)(?:\.|,|$)/i, type: "fact" },
    { re: /(?:my name is|call me)\s+(\w+)/i, type: "fact" },
    { re: /(?:i prefer|i like|i love|i hate|i dislike)\s+(.+?)(?:\.|,|$)/i, type: "preference" },
    { re: /(?:i want to|my goal is|i'm trying to)\s+(.+?)(?:\.|,|$)/i, type: "goal" },
    { re: /(?:i'm working on|my project is|building)\s+(.+?)(?:\.|,|$)/i, type: "project" },
    { re: /(?:i know|i can|i've learned|i understand)\s+(.+?)(?:\.|,|$)/i, type: "skill" },
  ];

  for (const { re } of patterns) {
    const m = userMsg.match(re);
    if (m?.[1] && m[1].length < 120) candidates.push(m[1].trim());
  }

  return candidates;
}
