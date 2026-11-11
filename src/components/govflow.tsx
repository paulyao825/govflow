"use client";
import {
  AlertTriangle,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  FileText,
  FlaskConical,
  Hand,
  Loader2,
  MoreHorizontal,
  ShieldAlert,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentEvent, CaseRecord, Citation, DecisionRecord, ReviewTask, RuleResult, ThreadMessage } from "@/lib/types";
import { post, useFeed, type Meta } from "./use-feed";

const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString("zh-TW", { hour12: false, timeZone: "Asia/Taipei" });
const ms = (n?: number) => (n === undefined ? "" : n < 1000 ? `${n}ms` : `${(n / 1000).toFixed(1)}s`);
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const CASE_STATUS: Record<CaseRecord["status"], { label: string; tone: string }> = {
  received: { label: "已收件", tone: "bg-line-2 text-ink-2" },
  processing: { label: "處理中", tone: "bg-accent-soft text-accent" },
  awaiting_human: { label: "等你決定", tone: "bg-warn-soft text-warn" },
  awaiting_correction: { label: "等申請人補正", tone: "bg-line-2 text-ink-2" },
  ready_for_approval: { label: "已轉陳核定", tone: "bg-ok-soft text-ok" },
  closed: { label: "已結案", tone: "bg-line-2 text-ink-3" },
};

const SUGGESTIONS = ["處理收件匣的新申請", "哪些案件需要我決定？", "為什麼 C-003 要轉人工？", "總結今天的處理結果"];

export default function GovFlowApp() {
  const { feed, meta } = useFeed();
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const casesById = useMemo(() => Object.fromEntries(feed.cases.map((c) => [c.id, c])), [feed.cases]);
  const tasksById = useMemo(() => Object.fromEntries(feed.tasks.map((t) => [t.id, t])), [feed.tasks]);

  const entries = useMemo(() => {
    const runs = new Map<string, AgentEvent[]>();
    for (const e of feed.events) {
      if (!runs.has(e.runId)) runs.set(e.runId, []);
      runs.get(e.runId)!.push(e);
    }
    const list: ({ kind: "msg"; ts: number; m: ThreadMessage } | { kind: "run"; ts: number; runId: string; events: AgentEvent[] })[] = [
      ...feed.messages.map((m) => ({ kind: "msg" as const, ts: m.ts, m })),
      ...[...runs.entries()].map(([runId, events]) => ({ kind: "run" as const, ts: events[0].ts, runId, events: events.sort((a, b) => a.ts - b.ts) })),
    ];
    return list.sort((a, b) => a.ts - b.ts || (a.kind === "msg" && a.m.role === "user" ? -1 : 0));
  }, [feed.events, feed.messages]);

  const lastRunId = [...entries].reverse().find((e) => e.kind === "run" && e.events.some((x) => x.step))?.kind === "run"
    ? ([...entries].reverse().find((e) => e.kind === "run" && e.events.some((x) => x.step)) as { runId: string }).runId
    : undefined;

  // keep pinned to the bottom while the agent works, unless the user scrolled up
  const sig = `${entries.length}:${feed.events.at(-1)?.updatedAt ?? 0}:${feed.tasks.length}`;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 400;
    if (near) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [sig]);

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await post("/api/command", { text });
    } finally {
      setBusy(false);
    }
  };

  const working = feed.events.some((e) => e.status === "running") || busy;
  const pending = feed.tasks.filter((t) => t.status === "pending").length;

  return (
    <div className="flex h-dvh flex-col">
      <Header meta={meta} working={working} pending={pending} cases={feed.cases} />
      <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] px-4 pb-10 pt-6 sm:px-6">
          {entries.length === 0 && <EmptyState />}
          <div className="space-y-5">
            {entries.map((en) =>
              en.kind === "msg" ? (
                <MessageView key={en.m.id} m={en.m} tasksById={tasksById} casesById={casesById} outbox={feed.outbox} />
              ) : (
                <RunBlock key={en.runId} events={en.events} caseRec={en.events[0].caseId ? casesById[en.events[0].caseId] : undefined} defaultOpen={en.runId === lastRunId} />
              ),
            )}
          </div>
          <div ref={bottomRef} className="h-2" />
        </div>
      </div>
      <Composer onSend={send} busy={busy} />
    </div>
  );
}

/* ---------------------------------- header --------------------------------- */

function Header({ meta, working, pending, cases }: { meta: Meta | null; working: boolean; pending: number; cases: CaseRecord[] }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/85 backdrop-blur">
      <div className="mx-auto flex max-w-[760px] items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-[13px] font-bold text-white">G</div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight">GovFlow</div>
            <div className="text-[11px] text-ink-3">青年局・青年 AI 工具補助 值班 agent</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className={cx("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium", working ? "bg-accent-soft text-accent" : "bg-line-2 text-ink-2")}>
            <span className={cx("h-1.5 w-1.5 rounded-full", working ? "live-dot bg-accent" : "bg-ok")} />
            {working ? "agent 工作中" : "待命中"}
          </span>
          {pending > 0 && <span className="rounded-full bg-warn-soft px-2.5 py-1 text-[11px] font-medium text-warn">{pending} 件等你</span>}
          <DemoMenu meta={meta} cases={cases} />
        </div>
      </div>
      {cases.length > 0 && (
        <div className="mx-auto flex max-w-[760px] gap-1.5 overflow-x-auto px-4 pb-2.5 sm:px-6">
          {cases.map((c) => (
            <span key={c.id} className={cx("flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px]", CASE_STATUS[c.status].tone)}>
              <span className="font-mono font-medium">{c.id}</span>
              <span>{c.applicantLabel}</span>
              <span className="opacity-70">・{CASE_STATUS[c.status].label}</span>
            </span>
          ))}
        </div>
      )}
    </header>
  );
}

function DemoMenu({ meta, cases }: { meta: Meta | null; cases: CaseRecord[] }) {
  const [open, setOpen] = useState(false);
  const act = async (url: string, body?: unknown) => {
    setOpen(false);
    await post(url, body);
  };
  const hasCorr = (id: string) => cases.find((c) => c.id === id && c.status === "awaiting_correction");
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="grid h-7 w-7 place-items-center rounded-md text-ink-2 hover:bg-line-2" aria-label="展示控制">
        <MoreHorizontal size={16} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute right-0 top-9 z-30 w-72 rounded-xl border border-line bg-card p-1.5 text-[13px] shadow-xl"
          >
            <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-3">展示控制（模擬外部事件）</div>
            <MenuItem onClick={() => act("/api/demo/reset")}>重置展示</MenuItem>
            <MenuItem onClick={() => act("/api/demo/inflow", { scenarios: ["A", "B", "C"] })}>夜間郵件：3 件申請進件（自動觸發）</MenuItem>
            <div className="my-1 h-px bg-line-2" />
            {[
              ["A", "A-001 缺 AI 課程證明"],
              ["B", "B-002 文件齊全"],
              ["C", "C-003 日期／方案矛盾"],
              ["D", "D-004 掃描不清＋指令注入"],
            ].map(([k, l]) => (
              <MenuItem key={k} onClick={() => act("/api/intake", { scenario: k })}>
                單件進件：{l}
              </MenuItem>
            ))}
            <MenuItem onClick={() => act("/api/intake", { scenario: "A" })}>重複送出 A-001（測試不重複處理）</MenuItem>
            <div className="my-1 h-px bg-line-2" />
            <MenuItem disabled={!hasCorr("A-001")} onClick={() => act("/api/cases/A-001/correction")}>申請人補件到達：A-001</MenuItem>
            <MenuItem disabled={!hasCorr("D-004")} onClick={() => act("/api/cases/D-004/correction")}>申請人補件到達：D-004</MenuItem>
            <div className="mt-1.5 space-y-1 border-t border-line-2 px-2.5 pb-1.5 pt-2 text-[11px] text-ink-3">
              <div>判斷模型：{meta ? (meta.jev === "jev" ? "TypeSafe Jev（即時推論）" : "模擬判斷（未設定 Jev 金鑰）") : "…"}</div>
              <div>撰稿／對話：{meta ? (meta.llm === "openai" ? `OpenAI ${meta.llmModel}` : "範本與規則式解析（未設定 LLM）") : "…"}</div>
              <div>狀態儲存：{meta?.store === "firestore" ? "Firestore（即時同步）" : "記憶體"}</div>
              <div>全部為合成資料，未連接任何真實政府系統。</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={onClick} className="block w-full rounded-md px-2.5 py-1.5 text-left text-ink hover:bg-line-2 disabled:cursor-not-allowed disabled:text-ink-3 disabled:hover:bg-transparent">
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="py-16 text-center">
      <div className="text-[28px] font-semibold tracking-tight">Government runs itself.</div>
      <div className="mt-1 text-[28px] font-semibold tracking-tight text-ink-3">Humans stay in control.</div>
      <p className="mx-auto mt-4 max-w-md text-[14px] text-ink-2">從右上角「⋯」重置展示，或直接告訴 GovFlow 要做什麼。</p>
    </div>
  );
}

/* --------------------------------- messages -------------------------------- */

function MessageView({ m, tasksById, casesById, outbox }: { m: ThreadMessage; tasksById: Record<string, ReviewTask>; casesById: Record<string, CaseRecord>; outbox: { caseId: string }[] }) {
  if (m.role === "user")
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[14.5px] leading-relaxed text-white">{m.text}</div>
      </motion.div>
    );
  const tasks = (m.taskIds ?? []).map((id) => tasksById[id]).filter(Boolean);
  const corrCase = m.kind === "notice" ? m.caseIds?.find((id) => casesById[id]?.status === "awaiting_correction" && outbox.some((o) => o.caseId === id)) : undefined;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
      <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-ink text-[12px] font-bold text-white">G</div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 text-[11px] text-ink-3">
          <span className="font-medium text-ink-2">GovFlow</span>
          {m.kind === "proactive" && <span className="rounded bg-accent-soft px-1.5 py-px text-accent">主動通知</span>}
          <span>{fmtTime(m.ts)}</span>
          {m.llm === "fallback" && <span className="rounded bg-line-2 px-1.5 py-px">規則式回覆</span>}
        </div>
        <div className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-ink">{m.text}</div>
        {corrCase && <CorrectionHint caseId={corrCase} />}
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} caseRec={casesById[t.caseId]} />
        ))}
      </div>
    </motion.div>
  );
}

function CorrectionHint({ caseId }: { caseId: string }) {
  const [sent, setSent] = useState(false);
  return (
    <button
      disabled={sent}
      onClick={async () => {
        setSent(true);
        await post(`/api/cases/${caseId}/correction`);
      }}
      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-dashed border-line px-2.5 py-1 text-[12px] text-ink-2 hover:bg-card disabled:opacity-50"
    >
      <FlaskConical size={12} /> 展示：模擬申請人寄回 {caseId} 的補件
    </button>
  );
}

/* ---------------------------------- runs ----------------------------------- */

const NODES: { id: string; label: string; tools: string[] }[] = [
  { id: "trigger", label: "觸發", tools: ["receive_application"] },
  { id: "sop", label: "SOP", tools: ["load_government_sop"] },
  { id: "docs", label: "文件", tools: ["classify_document", "extract_case_facts", "validate_completeness"] },
  { id: "rules", label: "規則", tools: ["evaluate_deterministic_rules"] },
  { id: "jev", label: "Jev", tools: ["evaluate_with_jev"] },
  { id: "act", label: "擬辦", tools: ["update_case_state", "prepare_correction_notice", "generate_review_summary", "create_human_review_task"] },
  { id: "human", label: "承辦人", tools: ["write_audit_log"] },
];

function nodeState(events: AgentEvent[], tools: string[]) {
  const ev = events.filter((e) => e.tool && tools.includes(e.tool));
  if (!ev.length) return "pending";
  if (ev.some((e) => e.status === "error")) return "error";
  if (ev.some((e) => e.status === "running")) return "running";
  if (ev.some((e) => e.status === "waiting") && tools.includes("write_audit_log")) return "waiting";
  if (ev.some((e) => e.status === "warn")) return "warn";
  return "done";
}

function RunBlock({ events, caseRec, defaultOpen }: { events: AgentEvent[]; caseRec?: CaseRecord; defaultOpen: boolean }) {
  const isPipeline = events.some((e) => e.step);
  const running = events.some((e) => e.status === "running");
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? (running || defaultOpen);
  const total = events.reduce((n, e) => n + (e.durationMs ?? 0), 0);
  const toolCount = events.filter((e) => e.durationMs !== undefined).length;
  const simulated = events.some((e) => e.simulated);

  if (!isPipeline) {
    // chat tool calls / human decisions: compact audit lines
    return (
      <div className="ml-10 space-y-1 border-l border-line pl-3">
        {events.map((e) => (
          <EventLine key={e.id} e={e} compact />
        ))}
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="ml-10 overflow-hidden rounded-xl border border-line bg-card">
      <button onClick={() => setOpen(!expanded)} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-paper/60">
        {running ? <Loader2 size={14} className="animate-spin text-accent" /> : <Check size={14} className="text-ok" />}
        <span className={cx("text-[13px] font-medium", running && "shimmer-text")}>
          {running ? "正在處理" : "已處理"} {caseRec ? `${caseRec.id}・${caseRec.applicantLabel}` : ""}
        </span>
        <span className="text-[12px] text-ink-3">
          {toolCount} 個工具步驟・{ms(total)}
        </span>
        {simulated && <SimBadge />}
        <span className="ml-auto text-ink-3">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
      </button>
      <Stepper events={events} />
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-line-2">
            <div className="space-y-0.5 px-2 py-2">
              {events.map((e) => (
                <EventLine key={e.id} e={e} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Stepper({ events }: { events: AgentEvent[] }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto px-3.5 pb-3">
      {NODES.map((n, i) => {
        const s = nodeState(events, n.tools);
        return (
          <div key={n.id} className="flex shrink-0 items-center gap-1">
            <span
              className={cx(
                "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                s === "pending" && "border-line text-ink-3",
                s === "running" && "border-accent bg-accent-soft text-accent",
                s === "done" && "border-ok/30 bg-ok-soft text-ok",
                s === "warn" && "border-warn/30 bg-warn-soft text-warn",
                s === "error" && "border-bad/30 bg-bad-soft text-bad",
                s === "waiting" && "border-warn bg-warn-soft text-warn",
              )}
            >
              {s === "running" ? <Loader2 size={10} className="animate-spin" /> : s === "waiting" ? <Hand size={10} /> : s === "pending" ? <CircleDashed size={10} /> : s === "error" ? <X size={10} /> : s === "warn" ? <AlertTriangle size={10} /> : <Check size={10} />}
              {n.label}
            </span>
            {i < NODES.length - 1 && <span className="h-px w-2.5 bg-line" />}
          </div>
        );
      })}
    </div>
  );
}

function SimBadge() {
  return <span className="rounded border border-dashed border-warn/50 px-1 py-px font-mono text-[10px] text-warn">SIMULATED</span>;
}

function EventLine({ e, compact }: { e: AgentEvent; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const hasMore = !!(e.detail || e.data || e.citations?.length);
  const icon =
    e.status === "running" ? <Loader2 size={13} className="animate-spin text-accent" /> :
    e.status === "ok" ? <Check size={13} className="text-ok" /> :
    e.status === "warn" ? <AlertTriangle size={13} className="text-warn" /> :
    e.status === "waiting" ? <Hand size={13} className="text-warn" /> :
    <X size={13} className="text-bad" />;
  return (
    <div className={cx("rounded-lg", !compact && "hover:bg-paper/70")}>
      <button disabled={!hasMore} onClick={() => setOpen((o) => !o)} className={cx("flex w-full items-start gap-2 text-left", compact ? "py-0.5" : "px-1.5 py-1.5")}>
        <span className="mt-[3px] shrink-0">{e.actor === "human" ? <UserRound size={13} className="text-ink" /> : icon}</span>
        <span className="mt-[2px] w-[58px] shrink-0 font-mono text-[11px] text-ink-3">{fmtTime(e.ts)}</span>
        <span className="min-w-0 flex-1">
          <span className={cx("text-[13px]", e.status === "running" ? "text-ink-2" : "text-ink")}>{e.title}</span>
          <span className="ml-2 inline-flex flex-wrap items-center gap-1 align-middle">
            {e.tool && <span className="rounded bg-line-2 px-1 py-px font-mono text-[10px] text-ink-2">{e.tool}</span>}
            {e.actor === "human" && <span className="rounded bg-ink px-1 py-px text-[10px] text-white">人工</span>}
            {e.simulated && <SimBadge />}
            {e.durationMs !== undefined && <span className="font-mono text-[10px] text-ink-3">{ms(e.durationMs)}</span>}
          </span>
        </span>
        {hasMore && <span className="mt-[3px] text-ink-3">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-2 pb-2.5 pl-[90px] pr-2">
              {e.detail && <div className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-2">{e.detail}</div>}
              <EventData data={e.data} />
              {e.citations?.length ? <Citations items={e.citations} /> : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Citations({ items }: { items: Citation[] }) {
  return (
    <div className="space-y-1">
      {items.map((c) => (
        <a key={c.label + c.text} href={c.url} target="_blank" rel="noreferrer" className="block rounded-md border-l-2 border-accent/50 bg-accent-soft/50 px-2 py-1 text-[11.5px] leading-snug text-ink-2 hover:bg-accent-soft">
          <span className="mr-1.5 font-medium text-accent">{c.label}</span>
          {c.text}
        </a>
      ))}
    </div>
  );
}

function Prob({ p }: { p?: number }) {
  if (p === undefined || p === null) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-line-2">
        <span className={cx("block h-full rounded-full", p >= 0.7 ? "bg-ok" : p > 0.3 ? "bg-warn" : "bg-bad")} style={{ width: `${Math.round(p * 100)}%` }} />
      </span>
      <span className="font-mono text-[10.5px] text-ink-2">{p.toFixed(2)}</span>
    </span>
  );
}

const ROUTE_LABEL = { auto: "自動續行", verify: "建議人工確認", escalate: "轉人工" } as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EventData({ data }: { data: any }) {
  if (!data) return null;
  if (data.kind === "classification")
    return (
      <div className="overflow-x-auto rounded-lg border border-line-2">
        <table className="w-full text-[11.5px]">
          <thead className="bg-paper text-ink-3">
            <tr>
              <th className="px-2 py-1 text-left font-normal">檔案</th>
              <th className="px-2 py-1 text-left font-normal">Choice：文件類型</th>
              <th className="px-2 py-1 text-left font-normal">P</th>
              <th className="px-2 py-1 text-left font-normal">Noul：可判讀</th>
              <th className="px-2 py-1 text-left font-normal">Noul：指令注入</th>
            </tr>
          </thead>
          <tbody>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {data.rows.map((r: any) => (
              <tr key={r.file} className="border-t border-line-2">
                <td className="px-2 py-1 font-mono text-[10.5px] text-ink-2">{r.file}</td>
                <td className="px-2 py-1">
                  {r.type} <span className="text-[10px] text-ink-3">{ROUTE_LABEL[r.routed as keyof typeof ROUTE_LABEL]}</span>
                </td>
                <td className="px-2 py-1"><Prob p={r.p} /></td>
                <td className="px-2 py-1"><Prob p={r.readable} /></td>
                <td className="px-2 py-1"><Prob p={r.injection} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-line-2 bg-paper px-2 py-1 text-[10.5px] text-ink-3">
          {data.rows[0]?.provider === "jev" ? `TypeSafe Jev・每份文件一次請求、四個問題・${data.rows[0]?.latencyMs}ms` : "模擬判斷（非 Jev 推論）"}・門檻 0.95 自動／0.80 確認（示意值，未經校準）
        </div>
      </div>
    );
  if (data.kind === "checklist")
    return (
      <div className="flex flex-wrap gap-1">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {data.required.map((r: any) => (
          <span key={r.id} className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]", r.ok ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad")}>
            {r.ok ? <Check size={10} /> : <X size={10} />}
            {r.label}
          </span>
        ))}
      </div>
    );
  if (data.kind === "rules")
    return (
      <div className="space-y-0.5">
        {(data.rules as RuleResult[]).map((r) => (
          <div key={r.id} className="flex items-start gap-1.5 text-[11.5px]">
            <span className="mt-[2px]">{r.result === "pass" ? <Check size={11} className="text-ok" /> : r.result === "fail" ? <X size={11} className="text-bad" /> : <AlertTriangle size={11} className="text-warn" />}</span>
            <span className="text-ink">{r.title}</span>
            <span className="text-ink-3">— {r.detail}</span>
            <span className="ml-auto shrink-0 text-[10px] text-accent">{r.citation.label}</span>
          </div>
        ))}
      </div>
    );
  if (data.kind === "jev")
    return (
      <div className="space-y-1.5">
        {Object.entries(data.decisions as Record<string, DecisionRecord>).map(([k, d]) => (
          <div key={k} className="rounded-lg border border-line-2 px-2 py-1.5 text-[11.5px]">
            <div className="flex items-center gap-1.5">
              <span className="rounded bg-accent-soft px-1 font-mono text-[10px] uppercase text-accent">{d.type}</span>
              <span className="font-mono text-[10.5px] text-ink-2">{k}</span>
              {d.provider === "simulated" ? <SimBadge /> : <span className="font-mono text-[10px] text-ink-3">{d.model}・{d.latencyMs}ms</span>}
            </div>
            <div className="mt-0.5 text-ink-2">{d.question}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink">→ {d.type === "noul" ? `P(是)` : d.type === "score" ? `score ${Number(d.answer).toFixed(2)}` : String(d.answer)}</span>
              {d.type !== "score" && <Prob p={d.probability} />}
              {d.confidence !== undefined && d.confidence !== null && <span className="font-mono text-[10px] text-ink-3">confidence {d.confidence.toFixed(2)}</span>}
              {d.routed && <span className="text-[10.5px] text-ink-3">{ROUTE_LABEL[d.routed]}</span>}
            </div>
            {d.type === "choice" && d.probabilities && (
              <div className="mt-1 flex flex-wrap gap-2 text-[10.5px] text-ink-3">
                {Object.entries(d.probabilities).map(([o, p]) => (
                  <span key={o} className="font-mono">
                    {o} {p.toFixed(2)}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="text-[10.5px] text-ink-3">Jev 只回答窄範圍的型別化問題；下一步由程式碼依門檻決定，且一律交人工核定。</div>
      </div>
    );
  if (data.kind === "facts") {
    const f = data.facts;
    return (
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11.5px]">
        {[
          ["申請人", f.applicantName],
          ["出生日期", f.birthDate],
          ["申請日期", f.applicationDate],
          ["遷入日期", f.registeredSince ?? "無法判讀"],
          ["學校", f.school],
          ["課程", f.courseName ?? "—"],
          ["申請書起始日", f.declaredStart],
          ["心得字數", f.reflectionChars],
        ].map(([k, v]) => (
          <div key={k} className="contents">
            <span className="text-ink-3">{k}</span>
            <span className="text-ink">{String(v ?? "—")}</span>
          </div>
        ))}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {f.tools.map((t: any, i: number) => (
          <div key={i} className="contents">
            <span className="text-ink-3">訂閱 {i + 1}</span>
            <span className="text-ink">
              {t.name}｜{t.billing === "annual" ? "年繳" : "月繳"}｜{t.cycleStart} ~ {t.cycleEnd}｜NT${t.amount}｜{t.plan}
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (data.kind === "draft") return <pre className="whitespace-pre-wrap rounded-lg bg-paper p-2 font-sans text-[12px] leading-relaxed text-ink-2">{data.text}</pre>;
  if (data.kind === "outcome") return <div className="text-[11.5px] text-ink-3">{data.note}</div>;
  if (data.args) return <pre className="font-mono text-[10.5px] text-ink-3">{JSON.stringify(data.args)}</pre>;
  return null;
}

/* ---------------------------------- tasks ---------------------------------- */

function TaskCard({ task, caseRec }: { task: ReviewTask; caseRec?: CaseRecord }) {
  const [draft, setDraft] = useState(task.draft ?? "");
  const [mode, setMode] = useState<"idle" | "changes" | "evidence">("idle");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const decided = task.status !== "pending";

  const decide = async (action: "approve" | "request_changes") => {
    setBusy(action);
    await post(`/api/tasks/${task.id}`, { action, note: action === "request_changes" ? note : undefined, draft: draft !== task.draft ? draft : undefined });
    setBusy(null);
    setMode("idle");
  };

  const approveLabel = task.kind === "forward_for_approval" ? "核可，轉陳核定" : "核可，放入寄件匣";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cx("mt-3 overflow-hidden rounded-xl border bg-card", decided ? "border-line" : "border-warn/40 shadow-[0_1px_0_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(180,83,9,0.25)]")}>
      <div className={cx("flex items-center gap-2 px-4 py-2.5", decided ? "bg-paper" : "bg-warn-soft")}>
        {decided ? <Check size={14} className="text-ok" /> : <Hand size={14} className="text-warn" />}
        <span className={cx("text-[13px] font-semibold", decided ? "text-ink-2" : "text-warn")}>{decided ? (task.status === "approved" ? "已核可" : "已要求修改") : "需要你決定"}</span>
        <span className="font-mono text-[12px] text-ink-2">{task.caseId}</span>
        <span className="text-[12px] text-ink-3">・{task.title}</span>
        {task.decidedAt && <span className="ml-auto text-[11px] text-ink-3">{fmtTime(task.decidedAt)}</span>}
      </div>

      <div className="space-y-3 px-4 py-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-ink-3">問題</div>
          <div className="mt-0.5 text-[13.5px] text-ink">{task.issue}</div>
          {caseRec?.issues && caseRec.issues.length > 1 && (
            <ul className="mt-1 space-y-0.5 text-[12.5px] text-ink-2">
              {caseRec.issues.slice(1).map((i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-ink-3">・</span>
                  {i}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-lg bg-paper px-3 py-2 text-[12px]">
          {task.evidence.map((e, i) => (
            <div key={i} className="contents">
              <span className="text-ink-3">{e.label}</span>
              <span className="text-ink">{e.value}</span>
            </div>
          ))}
        </div>

        {task.citations.length > 0 && <Citations items={task.citations.slice(0, 4)} />}

        <div className="flex items-start gap-2 rounded-lg border border-accent/20 bg-accent-soft/40 px-3 py-2 text-[12.5px]">
          <Sparkles size={13} className="mt-0.5 shrink-0 text-accent" />
          <span className="text-ink">{task.recommendation}</span>
        </div>

        {task.draft && (
          <div>
            <div className="mb-1 flex items-center gap-2 text-[11px] text-ink-3">
              <FileText size={12} />
              <span className="font-medium uppercase tracking-wide">草稿</span>
              <span className="rounded bg-line-2 px-1.5 py-px">{task.draftSource === "llm" ? "LLM 撰寫" : "範本產生"}</span>
              <span>・可直接編修・核可前不會送出</span>
            </div>
            <textarea
              value={draft}
              disabled={decided}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(12, draft.split("\n").length + 1)}
              className="w-full resize-y rounded-lg border border-line bg-card px-3 py-2 text-[12.5px] leading-relaxed text-ink outline-none focus:border-accent/50 disabled:bg-paper disabled:text-ink-2"
            />
          </div>
        )}

        {mode === "evidence" && caseRec && <EvidenceList c={caseRec} />}

        {!decided && (
          <>
            {mode === "changes" && (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="要怎麼改？例如：語氣再委婉、補正期限改 14 日"
                  className="flex-1 rounded-lg border border-line px-3 py-1.5 text-[13px] outline-none focus:border-accent/50"
                />
                <button disabled={!note.trim() || !!busy} onClick={() => decide("request_changes")} className="rounded-lg bg-ink px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40">
                  {busy === "request_changes" ? <Loader2 size={14} className="animate-spin" /> : "送出"}
                </button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button disabled={!!busy} onClick={() => decide("approve")} className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-ink/90 disabled:opacity-50">
                {busy === "approve" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {approveLabel}
              </button>
              <button onClick={() => setMode(mode === "changes" ? "idle" : "changes")} className="rounded-lg border border-line px-3 py-1.5 text-[13px] text-ink hover:bg-paper">
                要求修改
              </button>
              <button onClick={() => setMode(mode === "evidence" ? "idle" : "evidence")} className="rounded-lg px-3 py-1.5 text-[13px] text-ink-2 hover:bg-paper">
                {mode === "evidence" ? "收起證據" : "查看原始文件"}
              </button>
            </div>
            <div className="text-[11px] text-ink-3">核可是內部作業確認，不是行政處分。正式核准、駁回與撥款仍由權責主管決行。</div>
          </>
        )}
        {decided && task.decisionNote && <div className="text-[12px] text-ink-2">承辦人意見：{task.decisionNote}</div>}
      </div>
    </motion.div>
  );
}

function EvidenceList({ c }: { c: CaseRecord }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="rounded-lg border border-line-2">
      <div className="border-b border-line-2 bg-paper px-3 py-1.5 text-[11px] text-ink-3">原始文件（OCR 文字，視為不可信資料，不會被當作指令執行）</div>
      {c.documents.map((d) => (
        <div key={d.id} className="border-b border-line-2 last:border-0">
          <button onClick={() => setOpenId(openId === d.id ? null : d.id)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-paper">
            <FileText size={12} className="text-ink-3" />
            <span className="font-mono text-[11px] text-ink-2">{d.fileName}</span>
            <span className="text-ink">{d.classification ? String(DOC_LABELS[String(d.classifiedAs)] ?? d.classifiedAs) : "未分類"}</span>
            {d.readable === false && <span className="rounded bg-bad-soft px-1 text-[10px] text-bad">無法判讀</span>}
            {d.injectionSuspected && (
              <span className="inline-flex items-center gap-0.5 rounded bg-bad-soft px-1 text-[10px] text-bad">
                <ShieldAlert size={10} /> 疑似指令注入
              </span>
            )}
          </button>
          {openId === d.id && <pre className="whitespace-pre-wrap bg-paper px-3 py-2 font-sans text-[11.5px] leading-relaxed text-ink-2">{d.text}</pre>}
        </div>
      ))}
    </div>
  );
}

const DOC_LABELS: Record<string, string> = {
  application_form: "申請書",
  household_record: "戶籍資料",
  student_status: "在學／畢業證明",
  ai_course_proof: "AI 課程證明",
  ai_course_teacher_cert: "教師證明書",
  subscription_receipt: "訂閱憑證",
  bank_receipt: "領據＋存摺",
  usage_reflection: "使用心得",
  self_checklist: "自主檢核表",
  low_income_proof: "低收證明",
  unknown: "無法辨識",
};

/* --------------------------------- composer -------------------------------- */

function Composer({ onSend, busy }: { onSend: (t: string) => void; busy: boolean }) {
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim()) return;
    onSend(text);
    setText("");
  };
  return (
    <div className="border-t border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto max-w-[760px] px-4 pb-4 pt-3 sm:px-6">
        <div className="mb-2 flex gap-1.5 overflow-x-auto">
          {SUGGESTIONS.map((s) => (
            <button key={s} disabled={busy} onClick={() => onSend(s)} className="shrink-0 rounded-full border border-line bg-card px-3 py-1 text-[12px] text-ink-2 hover:border-ink/20 hover:text-ink disabled:opacity-50">
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-card px-3 py-2 shadow-sm focus-within:border-accent/40">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder="告訴 GovFlow 要做什麼…"
            className="max-h-40 flex-1 resize-none bg-transparent py-1 text-[14.5px] outline-none placeholder:text-ink-3"
          />
          <button onClick={submit} disabled={busy || !text.trim()} className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white disabled:opacity-30" aria-label="送出">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}
