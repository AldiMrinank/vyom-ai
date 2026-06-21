export interface Memory {
  id: string;
  userId: string;
  type: "fact" | "preference" | "goal" | "project" | "skill" | "context";
  content: string;       // the actual memory text
  tags: string[];
  source: "user" | "inferred";  // did user add it, or did AI extract it?
  createdAt: any;
  updatedAt: any;
  pinned: boolean;
}

export interface MemoryBank {
  facts: Memory[];        // "I'm studying for EAMCET"
  preferences: Memory[];  // "I prefer bullet points"
  goals: Memory[];        // "I want to learn React"
  projects: Memory[];     // "I'm building Vyom AI"
  skills: Memory[];       // "I know TypeScript"
}
