import "server-only";
import { db, uid } from "./store";
import { bi, type Txt } from "./i18n";
import type { AgentEvent, Citation, EventStatus, ThreadMessage } from "./types";
import { youthAiSubsidyWorkflow, type Permission } from "./workflows/youth-ai-subsidy";

// Tool runner: every tool call is permission-checked, timed, and written to the audit log
// (gf_events) as it starts and finishes, so the UI shows real execution, not an animation.

export class GuardrailError extends Error {}

export interface RunCtx {
  runId: string;
  caseId?: string;
  lang: import("./i18n").Lang;
}

const STEP_DELAY = Number(process.env.DEMO_STEP_DELAY_MS ?? 450);
// Demo pacing so humans can follow the stream. Tracked per run and excluded from reported agent time.
const paused = new Map<string, number>();
export const pausedMs = (runId: string) => paused.get(runId) ?? 0;
export const pace = (runId: string) => {
  if (STEP_DELAY <= 0) return Promise.resolve();
  paused.set(runId, pausedMs(runId) + STEP_DELAY);
  return new Promise((r) => setTimeout(r, STEP_DELAY));
};

export async function logEvent(ctx: RunCtx, e: Partial<AgentEvent> & { title: Txt; status: EventStatus }) {
  const now = Date.now();
  const ev: AgentEvent = { id: uid("ev"), runId: ctx.runId, caseId: ctx.caseId, ts: now, updatedAt: now, actor: "agent", ...e };
  await db.set("events", ev);
  return ev;
}

export interface ToolOutput<T> {
  result: T;
  title?: Txt;
  detail?: Txt;
  status?: EventStatus;
  data?: unknown;
  citations?: Citation[];
  simulated?: boolean;
}

export async function runTool<T>(
  ctx: RunCtx,
  meta: { tool: string; permission: Permission; step?: string; title: Txt },
  fn: () => Promise<ToolOutput<T>>,
): Promise<T> {
  const allowed = (youthAiSubsidyWorkflow.agentPermissions as readonly string[]).includes(meta.permission);
  if (!allowed) {
    await logEvent(ctx, {
      tool: meta.tool,
      step: meta.step,
      title: bi(`已阻擋：${meta.tool} 需要「${meta.permission}」權限，僅限人工執行`, `Blocked: ${meta.tool} needs "${meta.permission}", which is human-only`),
      status: "error",
    });
    throw new GuardrailError(`permission ${meta.permission} is human-only`);
  }
  const started = await logEvent(ctx, { tool: meta.tool, step: meta.step, title: meta.title, status: "running" });
  const t0 = performance.now();
  try {
    const out = await fn();
    const durationMs = Math.round(performance.now() - t0);
    await db.patch("events", started.id, {
      status: out.status ?? "ok",
      title: out.title ?? meta.title,
      detail: out.detail,
      data: out.data,
      citations: out.citations,
      simulated: out.simulated,
      durationMs,
      updatedAt: Date.now(),
    });
    await pace(ctx.runId);
    return out.result;
  } catch (e) {
    const durationMs = Math.round(performance.now() - t0);
    await db.patch("events", started.id, {
      status: "error",
      detail: e instanceof Error ? e.message : String(e),
      durationMs,
      updatedAt: Date.now(),
    });
    throw e;
  }
}

export async function agentSay(m: Omit<ThreadMessage, "id" | "ts" | "updatedAt" | "role"> & { role?: ThreadMessage["role"] }) {
  const now = Date.now();
  const msg: ThreadMessage = { id: uid("msg"), ts: now, updatedAt: now, role: "agent", ...m };
  await db.set("messages", msg);
  return msg;
}
