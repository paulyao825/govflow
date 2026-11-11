import "server-only";
import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk";
import type { DecisionRecord } from "./types";

// Decision-provider adapter.
//  - Real: TypeSafe Jev via the official @typesafe-ai/sdk (POST /v1/systemone).
//  - Simulated: deterministic keyword heuristics, used ONLY when TYPESAFE_API_KEY is absent.
//    Every simulated answer is labelled provider:"simulated" and shown as such in the UI.
// Jev answers narrow, typed questions. Application code decides what to do with them.

export type QSpec =
  | { id: string; type: "choice"; instructions: string; criteria: Record<string, string>; simulate: () => string }
  | { id: string; type: "noul"; instructions: string; simulate: () => number }
  | { id: string; type: "score"; instructions: string; criteria: string[]; simulate: () => number };

export class JevUnavailableError extends Error {}

export const jevMode = (): "jev" | "simulated" => (process.env.TYPESAFE_API_KEY ? "jev" : "simulated");
const MODEL = process.env.TYPESAFE_MODEL || "jev-latest";

let client: TypeSafeClient | null = null;
function getClient() {
  client ??= new TypeSafeClient({ defaultModel: MODEL, timeout: 20_000 });
  return client;
}

export async function askJev(
  state: Record<string, unknown> | string,
  specs: QSpec[],
): Promise<Record<string, DecisionRecord>> {
  const t0 = Date.now();
  if (process.env.JEV_FORCE_FAIL === "1") throw new JevUnavailableError("JEV_FORCE_FAIL=1 (test switch)");

  if (jevMode() === "simulated") {
    const out: Record<string, DecisionRecord> = {};
    for (const s of specs) {
      if (s.type === "choice") {
        const pick = s.simulate();
        const keys = Object.keys(s.criteria);
        const p = 0.9;
        const probs = Object.fromEntries(keys.map((k) => [k, k === pick ? p : (1 - p) / (keys.length - 1)]));
        out[s.id] = { question: s.instructions, type: "choice", answer: pick, probability: p, confidence: null, probabilities: probs, provider: "simulated", latencyMs: 0 };
      } else if (s.type === "noul") {
        const v = s.simulate();
        out[s.id] = { question: s.instructions, type: "noul", answer: v, probability: v, provider: "simulated", latencyMs: 0 };
      } else {
        const v = s.simulate();
        out[s.id] = { question: s.instructions, type: "score", answer: v, confidence: null, provider: "simulated", latencyMs: 0 };
      }
    }
    const ms = Date.now() - t0;
    Object.values(out).forEach((d) => (d.latencyMs = ms));
    return out;
  }

  const questions: Record<string, ReturnType<typeof choice> | ReturnType<typeof noul> | ReturnType<typeof score>> = {};
  for (const s of specs) {
    if (s.type === "choice") questions[s.id] = choice(s.instructions, s.criteria);
    else if (s.type === "noul") questions[s.id] = noul(s.instructions);
    else questions[s.id] = score(s.instructions, s.criteria as string[]);
  }

  let res;
  try {
    res = await getClient().systemOne({ state: state as never, questions });
  } catch (e) {
    throw new JevUnavailableError(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }
  const latencyMs = Date.now() - t0;
  const out: Record<string, DecisionRecord> = {};
  for (const s of specs) {
    const a = (res.answers as unknown as Record<string, Record<string, unknown>>)[s.id];
    if (!a) throw new JevUnavailableError(`missing answer for ${s.id}`);
    if (s.type === "choice") {
      const probs = a.probabilities as Record<string, number>;
      const pick = a.choice as string;
      out[s.id] = { question: s.instructions, type: "choice", answer: pick, probability: probs?.[pick], confidence: a.confidence as number, probabilities: probs, provider: "jev", model: res.model, latencyMs };
    } else if (s.type === "noul") {
      out[s.id] = { question: s.instructions, type: "noul", answer: a.noul as number, probability: a.noul as number, provider: "jev", model: res.model, latencyMs };
    } else {
      out[s.id] = { question: s.instructions, type: "score", answer: a.score as number, confidence: a.confidence as number, probabilities: a.probabilities as Record<string, number>, provider: "jev", model: res.model, latencyMs };
    }
  }
  return out;
}
