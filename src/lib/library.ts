import {
  collection, addDoc, getDocs, deleteDoc, doc,
  query, where, orderBy, serverTimestamp, limit, updateDoc
} from "firebase/firestore";
import { db } from "@/integrations/firebase/config";

export type LibraryItemType = "answer" | "artifact" | "note" | "research" | "file";

export interface LibraryItem {
  id: string;
  userId: string;
  type: LibraryItemType;
  title: string;
  content: string;
  tags: string[];
  sourceConvId?: string;
  sourceMsgId?: string;
  createdAt: any;
}

// Guard: throws a clear error instead of crashing with a cryptic bang-operator failure
function getDb() {
  if (!db) throw new Error("Firestore not initialized — check Firebase env vars");
  return db;
}

const COL = (uid: string) => collection(getDb(), "users", uid, "library");

export async function saveToLibrary(
  uid: string,
  item: Omit<LibraryItem, "id" | "userId" | "createdAt">
): Promise<string> {
  const ref = await addDoc(COL(uid), { ...item, userId: uid, createdAt: serverTimestamp() });
  return ref.id;
}

export async function getLibrary(uid: string, type?: LibraryItemType): Promise<LibraryItem[]> {
  try {
    const q = type
      ? query(COL(uid), where("type", "==", type), orderBy("createdAt", "desc"), limit(100))
      : query(COL(uid), orderBy("createdAt", "desc"), limit(100));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as LibraryItem));
  } catch { return []; }
}

export async function deleteFromLibrary(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(getDb(), "users", uid, "library", id));
}

export async function updateLibraryTags(uid: string, id: string, tags: string[]): Promise<void> {
  await updateDoc(doc(getDb(), "users", uid, "library", id), { tags });
}
