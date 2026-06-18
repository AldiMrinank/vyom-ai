import { collection, query, where, getDocs, deleteDoc, Timestamp } from "firebase/firestore";
import { db } from "@/integrations/firebase/config";
import { loadSettings } from "./settings";

const LAST_RUN_KEY = "vyom_autoclear_last_run";
const MIN_RUN_INTERVAL_MS = 6 * 60 * 60 * 1000; // don't re-check more than once every 6h

/**
 * Deletes conversations that haven't been updated in more than `autoClearDays` days.
 * No-ops if the setting is 0 ("Never") or if it already ran recently this session.
 * Call this once after auth resolves (e.g. in App.tsx) — it's safe to call on every
 * load since it self-throttles via localStorage.
 */
export async function runAutoClear(userId: string): Promise<void> {
  const { autoClearDays } = loadSettings();
  if (!autoClearDays || autoClearDays <= 0) return;

  const lastRun = Number(localStorage.getItem(LAST_RUN_KEY) || 0);
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
    localStorage.setItem(LAST_RUN_KEY, String(Date.now()));
  } catch {
    // Fail silently — this is a background maintenance task, not user-initiated.
  }
}
