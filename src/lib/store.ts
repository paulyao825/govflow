import "server-only";
import type { AgentEvent, CaseRecord, Feed, OutboxItem, ReviewTask, ThreadMessage } from "./types";

// Persistence: Firestore (via firebase-admin, server only) when FIREBASE_SERVICE_ACCOUNT_B64 is set,
// otherwise an in-memory store (fine for `next dev`, single process).

type Coll = "cases" | "events" | "tasks" | "messages" | "outbox";
type DocOf<C extends Coll> = C extends "cases"
  ? CaseRecord
  : C extends "events"
    ? AgentEvent
    : C extends "tasks"
      ? ReviewTask
      : C extends "messages"
        ? ThreadMessage
        : OutboxItem;

export const COLL_PREFIX = "gf_";

interface Backend {
  kind: "firestore" | "memory";
  get<C extends Coll>(c: C, id: string): Promise<DocOf<C> | null>;
  set<C extends Coll>(c: C, doc: DocOf<C>): Promise<void>;
  patch<C extends Coll>(c: C, id: string, patch: Partial<DocOf<C>>): Promise<void>;
  list<C extends Coll>(c: C): Promise<DocOf<C>[]>;
  clear(): Promise<void>;
  /** Atomically acquire a processing lock on a case. Returns false if someone else holds it. */
  lockCase(id: string, runId: string, staleMs: number): Promise<boolean>;
}

// ---------- memory ----------
const g = globalThis as unknown as { __gfMem?: Record<Coll, Map<string, unknown>> };
function mem() {
  g.__gfMem ??= { cases: new Map(), events: new Map(), tasks: new Map(), messages: new Map(), outbox: new Map() };
  return g.__gfMem;
}
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

const memoryBackend: Backend = {
  kind: "memory",
  async get(c, id) {
    const v = mem()[c].get(id);
    return v ? clone(v as never) : null;
  },
  async set(c, doc) {
    mem()[c].set((doc as { id: string }).id, clone(doc));
  },
  async patch(c, id, p) {
    const cur = mem()[c].get(id);
    if (cur) mem()[c].set(id, { ...(cur as object), ...clone(p) });
  },
  async list(c) {
    return [...mem()[c].values()].map((v) => clone(v as never));
  },
  async clear() {
    for (const m of Object.values(mem())) m.clear();
  },
  async lockCase(id, runId, staleMs) {
    const cur = mem().cases.get(id) as CaseRecord | undefined;
    if (!cur) return false;
    if (cur.lock && Date.now() - cur.lock.at < staleMs && cur.lock.runId !== runId) return false;
    cur.lock = { runId, at: Date.now() };
    return true;
  },
};

// ---------- firestore ----------
type FS = import("firebase-admin/firestore").Firestore;
const gf = globalThis as unknown as { __gfFs?: FS };

async function firestore(): Promise<FS> {
  if (gf.__gfFs) return gf.__gfFs;
  const { initializeApp, getApps, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64!, "base64").toString("utf8"));
  const app = getApps()[0] ?? initializeApp({ credential: cert(sa), projectId: sa.project_id });
  const db = getFirestore(app);
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    /* settings already applied */
  }
  gf.__gfFs = db;
  return db;
}
const stripUndef = <T>(x: T): T => JSON.parse(JSON.stringify(x));

const firestoreBackend: Backend = {
  kind: "firestore",
  async get(c, id) {
    const s = await (await firestore()).collection(COLL_PREFIX + c).doc(id).get();
    return s.exists ? (s.data() as never) : null;
  },
  async set(c, doc) {
    await (await firestore()).collection(COLL_PREFIX + c).doc((doc as { id: string }).id).set(stripUndef(doc));
  },
  async patch(c, id, p) {
    await (await firestore()).collection(COLL_PREFIX + c).doc(id).set(stripUndef(p), { merge: true });
  },
  async list(c) {
    const s = await (await firestore()).collection(COLL_PREFIX + c).get();
    return s.docs.map((d) => d.data() as never);
  },
  async clear() {
    const db = await firestore();
    for (const c of ["cases", "events", "tasks", "messages", "outbox"] as Coll[]) {
      const s = await db.collection(COLL_PREFIX + c).get();
      const batch = db.batch();
      s.docs.forEach((d) => batch.delete(d.ref));
      if (s.size) await batch.commit();
    }
  },
  async lockCase(id, runId, staleMs) {
    const db = await firestore();
    const ref = db.collection(COLL_PREFIX + "cases").doc(id);
    return db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) return false;
      const cur = s.data() as CaseRecord;
      if (cur.lock && Date.now() - cur.lock.at < staleMs && cur.lock.runId !== runId) return false;
      tx.set(ref, { lock: { runId, at: Date.now() } }, { merge: true });
      return true;
    });
  },
};

// GOVFLOW_STORE=memory forces the in-memory store (e.g. a local demo, or when the Firestore quota is exhausted)
export const db: Backend = process.env.FIREBASE_SERVICE_ACCOUNT_B64 && process.env.GOVFLOW_STORE !== "memory" ? firestoreBackend : memoryBackend;

export async function readFeed(): Promise<Feed> {
  const [cases, events, tasks, messages, outbox] = await Promise.all([
    db.list("cases"),
    db.list("events"),
    db.list("tasks"),
    db.list("messages"),
    db.list("outbox"),
  ]);
  const byTs = <T extends { ts?: number; createdAt?: number }>(a: T, b: T) =>
    (a.ts ?? a.createdAt ?? 0) - (b.ts ?? b.createdAt ?? 0);
  return {
    cases: cases.sort(byTs),
    events: events.sort(byTs),
    tasks: tasks.sort(byTs),
    messages: messages.sort(byTs),
    outbox: outbox.sort(byTs),
  };
}

export const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
