import { collection, query, where, getDocs, deleteDoc, Timestamp } from "firebase/firestore";
import { db } from "@/integrations/firebase/config";
import { loadSettings } from "./settings";

const MIN_RUN_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Fix CRITICAL: scope the key to userId so shared-device users don't interfere
const lastRunKey = (uid: string) => `vyom_autoclear_${uid}`;

export async function runAutoClear(userId: string): Promise<void> {
  const { autoClearDays } = loadSettings();
  if (!autoClearDays || autoClearDays <= 0 || !db) return;

  const lastRun = Number(localStorage.getItem(lastRunKey(userId)) || 0);
  if (Date.now() - lastRun < MIN_RUN_INTERVAL_MS) return;

  try {
    const cutoff = Timestamp.fromMillis(Date.now() - autoClearDays * 24 * 60 * 60 * 1000);
    const snap = await getDocs(query(
      collection(db, "conversations"),
      where("userId", "==", userId),
      where("updatedAt", "<", cutoff),
    ));
    if (!snap.empty) {
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    }
    localStorage.setItem(lastRunKey(userId), String(Date.now()));
  } catch {
    // Background task — fail silently
  }
}
