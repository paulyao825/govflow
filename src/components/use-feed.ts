"use client";
import { useEffect, useRef, useState } from "react";
import type { Feed } from "@/lib/types";

export interface Meta {
  jev: "jev" | "simulated";
  llm: "openai" | "fallback";
  llmModel: string;
  store: "firestore" | "memory";
}

const EMPTY: Feed = { cases: [], events: [], tasks: [], messages: [], outbox: [] };
const COLLS = ["cases", "events", "tasks", "messages", "outbox"] as const;
const sortKey = (x: { ts?: number; createdAt?: number }) => x.ts ?? x.createdAt ?? 0;

/** Live feed: Firestore onSnapshot when the server persists to Firestore, else short polling. */
export function useFeed() {
  const [feed, setFeed] = useState<Feed>(EMPTY);
  const [meta, setMeta] = useState<Meta | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let unsubs: (() => void)[] = [];
    let cancelled = false;

    const poll = async () => {
      try {
        const r = await fetch("/api/feed", { cache: "no-store" });
        const j = await r.json();
        if (cancelled) return;
        setMeta(j.meta);
        setFeed({ cases: j.cases, events: j.events, tasks: j.tasks, messages: j.messages, outbox: j.outbox });
        return j.meta as Meta;
      } catch {
        return null;
      }
    };

    (async () => {
      const m = await poll();
      const cfg = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
      if (m?.store === "firestore" && cfg) {
        try {
          const { initializeApp, getApps } = await import("firebase/app");
          const { getFirestore, collection, onSnapshot } = await import("firebase/firestore");
          const app = getApps()[0] ?? initializeApp(JSON.parse(cfg));
          const fs = getFirestore(app);
          unsubs = COLLS.map((c) =>
            onSnapshot(collection(fs, `gf_${c}`), (snap) => {
              const docs = snap.docs.map((d) => d.data()).sort((a, b) => sortKey(a) - sortKey(b));
              setFeed((f) => ({ ...f, [c]: docs }));
            }),
          );
          // refresh meta occasionally (keys may be added while running)
          pollRef.current = setInterval(async () => {
            const r = await fetch("/api/feed", { cache: "no-store" }).catch(() => null);
            if (r?.ok) setMeta((await r.json()).meta);
          }, 30_000);
          return;
        } catch (e) {
          console.warn("firestore realtime unavailable, polling", e);
        }
      }
      pollRef.current = setInterval(poll, 900);
    })();

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return { feed, meta };
}

export async function post(url: string, body?: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  return r.json().catch(() => ({}));
}
