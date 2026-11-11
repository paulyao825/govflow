"use client";
import { AlertTriangle, ArrowUp, Check, Paperclip, Upload, ChevronDown, ChevronRight, CircleDashed, FileText, FlaskConical, Hand, Loader2, Moon, MoreHorizontal, ShieldAlert, Sparkles, Sun, UserRound, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentEvent, CaseRecord, Citation, DecisionRecord, ReviewTask, RuleResult, ThreadMessage } from "@/lib/types";
import { usePrefs } from "./ui-prefs";
import { post, useFeed, type Meta } from "./use-feed";

const ms = (n?: number) => (n === undefined ? "" : n < 1000 ? `${n}ms` : `${(n / 1000).toFixed(1)}s`);
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const useTime = () => {
  const { lang } = usePrefs();
  return (ts: number) => new Date(ts).toLocaleTimeString(lang === "zh" ? "zh-TW" : "en-GB", { hour12: false, timeZone: "Asia/Taipei" });
};

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="gf-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#3730a3" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#gf-logo)" />
      <path d="M45 21.5A15 15 0 1 0 47 34H33" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="45.5" cy="21" r="3.6" fill="#a5f3c4" />
    </svg>
  );
}

export default function GovFlowApp() {
  const { feed, meta } = useFeed();
  const { t } = usePrefs();
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const addFiles = (list: FileList | File[] | null) => list && setFiles((f) => [...f, ...Array.from(list)].slice(0, 12));
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const casesById = useMemo(() => Object.fromEntries(feed.cases.map((c) => [c.id, c])), [feed.cases]);
  const tasksById = useMemo(() => Object.fromEntries(feed.tasks.map((x) => [x.id, x])), [feed.tasks]);

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

  // keep pinned to the bottom while the agent works, unless the user scrolled up
  const sig = `${entries.length}:${feed.events.at(-1)?.updatedAt ?? 0}:${feed.tasks.length}`;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 500) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
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
  const pending = feed.tasks.filter((x) => x.status === "pending").length;

  return (
    <div
      className="relative flex h-dvh flex-col"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        addFiles(e.dataTransfer.files);
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-paper/80 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-accent px-10 py-8 text-center">
            <Upload className="mx-auto mb-2 text-accent" size={28} />
            <div className="text-[17px] font-semibold">{t("放開即可上傳文件", "Drop files to upload")}</div>
            <div className="mt-1 text-[13px] text-ink-3">PDF · PNG · JPG · TXT</div>
          </div>
        </div>
      )}
      <Header meta={meta} working={working} pending={pending} cases={feed.cases} />
      <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[920px] px-6 pb-12 pt-8 lg:px-10">
          {entries.length === 0 && <EmptyState />}
          <div className="space-y-6">
            {entries.map((en) =>
              en.kind === "msg" ? (
                <MessageView key={en.m.id} m={en.m} tasksById={tasksById} casesById={casesById} outbox={feed.outbox} />
              ) : (
                <RunBlock key={en.runId} events={en.events} caseRec={en.events[0].caseId ? casesById[en.events[0].caseId] : undefined} />
              ),
            )}
          </div>
          <div ref={bottomRef} className="h-2" />
        </div>
      </div>
      {files.length > 0 && <UploadTray files={files} setFiles={setFiles} cases={feed.cases} />}
      <Composer onSend={send} busy={busy} onPickFiles={addFiles} suggestions={[t("處理收件匣的新申請", "Process new applications"), t("哪些案件需要我決定？", "What needs my decision?"), t("為什麼 C-003 要轉人工？", "Why was C-003 escalated?"), t("總結今天的處理結果", "Summarise today")]} />
    </div>
  );
}

/* ---------------------------------- header --------------------------------- */

function Header({ meta, working, pending, cases }: { meta: Meta | null; working: boolean; pending: number; cases: CaseRecord[] }) {
  const { t, lang, setLang, theme, setTheme } = usePrefs();
  const STATUS = caseStatus(t);
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1200px] items-center gap-4 px-6 py-3.5 lg:px-10">
        <div className="flex items-center gap-2.5">
          <Logo size={30} />
          <div className="leading-tight">
            <div className="text-[16px] font-semibold tracking-tight">GovFlow</div>
            <div className="text-[12px] text-ink-3">{t("青年局・青年 AI 工具補助 值班 agent", "Youth Dept. · AI Tool Subsidy — on-duty agent")}</div>
          </div>
        </div>

        {cases.length > 0 && (
          <div className="hidden min-w-0 flex-1 justify-center gap-1.5 overflow-x-auto md:flex">
            {cases.map((c) => (
              <span key={c.id} className={cx("flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px]", STATUS[c.status].tone)}>
                <span className="font-mono font-medium">{c.id}</span>
                <span className="opacity-80">{STATUS[c.status].label}</span>
              </span>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <span className={cx("flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium", working ? "bg-accent-soft text-accent" : "bg-line-2 text-ink-2")}>
            <span className={cx("h-1.5 w-1.5 rounded-full", working ? "live-dot bg-accent" : "bg-ok")} />
            {working ? t("agent 工作中", "Agent working") : t("待命中", "On duty")}
          </span>
          {pending > 0 && <span className="rounded-full bg-warn-soft px-3 py-1 text-[12px] font-medium text-warn">{t(`${pending} 件等你`, `${pending} waiting for you`)}</span>}
          <div className="ml-1 flex items-center rounded-lg border border-line p-0.5 text-[12px]">
            {(["en", "zh"] as const).map((l) => (
              <button key={l} onClick={() => setLang(l)} className={cx("rounded-md px-2 py-0.5", lang === l ? "bg-ink text-paper" : "text-ink-2 hover:text-ink")}>
                {l === "en" ? "EN" : "中"}
              </button>
            ))}
          </div>
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="grid h-8 w-8 place-items-center rounded-lg text-ink-2 hover:bg-line-2" aria-label={t("切換深色模式", "Toggle dark mode")}>
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <DemoMenu meta={meta} cases={cases} />
        </div>
      </div>
    </header>
  );
}

function caseStatus(t: (zh: string, en: string) => string): Record<CaseRecord["status"], { label: string; tone: string }> {
  return {
    received: { label: t("已收件", "Received"), tone: "bg-line-2 text-ink-2" },
    processing: { label: t("處理中", "Processing"), tone: "bg-accent-soft text-accent" },
    awaiting_human: { label: t("等你決定", "Needs you"), tone: "bg-warn-soft text-warn" },
    awaiting_correction: { label: t("等申請人補正", "Awaiting applicant"), tone: "bg-line-2 text-ink-2" },
    ready_for_approval: { label: t("已轉陳核定", "Forwarded"), tone: "bg-ok-soft text-ok" },
    closed: { label: t("已結案", "Closed"), tone: "bg-line-2 text-ink-3" },
  };
}

function DemoMenu({ meta, cases }: { meta: Meta | null; cases: CaseRecord[] }) {
  const { t } = usePrefs();
  const [open, setOpen] = useState(false);
  const act = async (url: string, body?: unknown) => {
    setOpen(false);
    await post(url, body);
  };
  const hasCorr = (id: string) => cases.find((c) => c.id === id && c.status === "awaiting_correction");
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-2 hover:bg-line-2" aria-label={t("展示控制", "Demo controls")}>
        <MoreHorizontal size={17} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute right-0 top-10 z-30 w-80 rounded-xl border border-line bg-card p-1.5 text-[13.5px] shadow-xl">
            <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-3">{t("展示控制（模擬外部事件）", "Demo controls (simulated external events)")}</div>
            <MenuItem onClick={() => act("/api/demo/reset")}>{t("重置展示", "Reset demo")}</MenuItem>
            <MenuItem onClick={() => act("/api/demo/inflow", { scenarios: ["A", "B", "C"] })}>{t("夜間郵件：3 件申請進件（自動觸發）", "Overnight mail: 3 applications arrive")}</MenuItem>
            <div className="my-1 h-px bg-line-2" />
            {[
              ["A", t("A-001 缺 AI 課程證明", "A-001 missing AI course proof")],
              ["B", t("B-002 文件齊全", "B-002 complete")],
              ["C", t("C-003 日期／方案矛盾", "C-003 conflicting dates / plan")],
              ["D", t("D-004 掃描不清＋指令注入", "D-004 blurry scan + prompt injection")],
            ].map(([k, l]) => (
              <MenuItem key={k} onClick={() => act("/api/intake", { scenario: k })}>
                {t("單件進件：", "Single arrival: ")}
                {l}
              </MenuItem>
            ))}
            <MenuItem onClick={() => act("/api/intake", { scenario: "A" })}>{t("重複送出 A-001（測試不重複處理）", "Resend A-001 (dedupe test)")}</MenuItem>
            <div className="my-1 h-px bg-line-2" />
            <MenuItem disabled={!hasCorr("A-001")} onClick={() => act("/api/cases/A-001/correction")}>{t("申請人補件到達：A-001", "Applicant correction arrives: A-001")}</MenuItem>
            <MenuItem disabled={!hasCorr("D-004")} onClick={() => act("/api/cases/D-004/correction")}>{t("申請人補件到達：D-004", "Applicant correction arrives: D-004")}</MenuItem>
            <div className="mt-1.5 space-y-1 border-t border-line-2 px-2.5 pb-1.5 pt-2 text-[11.5px] text-ink-3">
              <div>{t("判斷模型：", "Decisions: ")}{meta ? (meta.jev === "jev" ? t("TypeSafe Jev（即時推論）", "TypeSafe Jev (live)") : t("模擬判斷（未設定 Jev 金鑰）", "Simulator (no Jev key)")) : "…"}</div>
              <div>{t("撰稿／對話：", "Drafting / chat: ")}{meta ? (meta.llm === "openai" ? `OpenAI ${meta.llmModel}` : t("範本與規則式解析", "Templates + rule-based")) : "…"}</div>
              <div>{t("狀態儲存：", "State: ")}{meta?.store === "firestore" ? t("Firestore（即時同步）", "Firestore (realtime)") : t("記憶體", "In-memory")}</div>
              <div>{t("全部為合成資料，未連接任何真實政府系統。", "All data is synthetic. Not connected to any real government system.")}</div>
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
  const { t } = usePrefs();
  return (
    <div className="py-24 text-center">
      <div className="mx-auto mb-6 w-fit">
        <Logo size={56} />
      </div>
      <div className="text-[34px] font-semibold tracking-tight">Government runs itself.</div>
      <div className="mt-1 text-[34px] font-semibold tracking-tight text-ink-3">Humans stay in control.</div>
      <p className="mx-auto mt-5 max-w-lg text-[15px] text-ink-2">{t("從右上角「⋯」重置展示，或直接告訴 GovFlow 要做什麼。", "Open ⋯ (top right) to reset the demo, or just tell GovFlow what to do.")}</p>
    </div>
  );
}

/* --------------------------------- messages -------------------------------- */

function MessageView({ m, tasksById, casesById, outbox }: { m: ThreadMessage; tasksById: Record<string, ReviewTask>; casesById: Record<string, CaseRecord>; outbox: { caseId: string }[] }) {
  const { t } = usePrefs();
  const time = useTime();
  if (m.role === "user")
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15.5px] leading-relaxed text-paper">{m.text}</div>
      </motion.div>
    );
  const tasks = (m.taskIds ?? []).map((id) => tasksById[id]).filter(Boolean);
  const corrCase = m.kind === "notice" ? m.caseIds?.find((id) => casesById[id]?.status === "awaiting_correction" && outbox.some((o) => o.caseId === id)) : undefined;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3.5">
      <div className="mt-0.5 shrink-0">
        <Logo size={30} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 text-[12px] text-ink-3">
          <span className="font-medium text-ink-2">GovFlow</span>
          {m.kind === "proactive" && <span className="rounded bg-accent-soft px-1.5 py-px text-accent">{t("主動通知", "Proactive")}</span>}
          <span>{time(m.ts)}</span>
          {m.llm === "fallback" && <span className="rounded bg-line-2 px-1.5 py-px">{t("規則式回覆", "Rule-based")}</span>}
        </div>
        <div className="whitespace-pre-wrap text-[16px] leading-[1.7] text-ink">{m.text}</div>
        {corrCase && <CorrectionHint caseId={corrCase} />}
        {tasks.map((x) => (
          <TaskCard key={x.id} task={x} caseRec={casesById[x.caseId]} />
        ))}
      </div>
    </motion.div>
  );
}

function CorrectionHint({ caseId }: { caseId: string }) {
  const { t } = usePrefs();
  const [sent, setSent] = useState(false);
  return (
    <button
      disabled={sent}
      onClick={async () => {
        setSent(true);
        await post(`/api/cases/${caseId}/correction`);
      }}
      className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-card disabled:opacity-50"
    >
      <FlaskConical size={13} /> {t(`展示：模擬申請人寄回 ${caseId} 的補件`, `Demo: simulate the applicant sending ${caseId}'s correction`)}
    </button>
  );
}

/* ---------------------------------- runs ----------------------------------- */

const NODES: { id: string; zh: string; en: string; tools: string[] }[] = [
  { id: "trigger", zh: "觸發", en: "Trigger", tools: ["receive_application", "parse_documents"] },
  { id: "sop", zh: "SOP", en: "SOP", tools: ["load_government_sop"] },
  { id: "docs", zh: "文件", en: "Documents", tools: ["classify_document", "extract_case_facts", "validate_completeness"] },
  { id: "rules", zh: "規則", en: "Rules", tools: ["evaluate_deterministic_rules"] },
  { id: "jev", zh: "Jev", en: "Jev", tools: ["evaluate_with_jev"] },
  { id: "act", zh: "擬辦", en: "Draft", tools: ["update_case_state", "prepare_correction_notice", "generate_review_summary", "create_human_review_task"] },
  { id: "human", zh: "承辦人", en: "Officer", tools: ["write_audit_log"] },
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

function RunBlock({ events, caseRec }: { events: AgentEvent[]; caseRec?: CaseRecord }) {
  const { t } = usePrefs();
  const isPipeline = events.some((e) => e.step);
  const running = events.some((e) => e.status === "running");
  const [open, setOpen] = useState(false);
  const total = events.reduce((n, e) => n + (e.durationMs ?? 0), 0);
  const toolCount = events.filter((e) => e.durationMs !== undefined).length;
  const simulated = events.some((e) => e.simulated);
  const current = [...events].reverse().find((e) => e.status === "running");

  if (!isPipeline) {
    const human = events.find((e) => e.actor === "human");
    return (
      <div className="ml-[46px]">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink-2">
          {running ? <Loader2 size={13} className="animate-spin text-accent" /> : human ? <UserRound size={13} /> : <Check size={13} />}
          {running ? (current?.title ?? "…") : human ? human.title : t(`查詢 ${events.length} 項資料`, `Looked up ${events.length} item(s)`)}
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        {open && (
          <div className="mt-1 space-y-1 border-l border-line pl-3">
            {events.map((e) => (
              <EventLine key={e.id} e={e} compact />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="ml-[46px] overflow-hidden rounded-xl border border-line bg-card">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-paper/60">
        {running ? <Loader2 size={15} className="animate-spin text-accent" /> : <Check size={15} className="text-ok" />}
        <span className={cx("text-[14px] font-medium", running && "shimmer-text")}>
          {running ? t("正在處理", "Working on") : t("已處理", "Processed")} {caseRec ? `${caseRec.id} · ${caseRec.applicantLabel}` : ""}
        </span>
        <span className="text-[12.5px] text-ink-3">{running ? "" : t(`${toolCount} 步 · ${ms(total)}`, `${toolCount} steps · ${ms(total)}`)}</span>
        {simulated && <SimBadge />}
        <span className="ml-auto flex items-center gap-1 text-[12.5px] text-ink-3">
          {open ? t("收起", "Hide") : t("工作紀錄", "Work log")}
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      <Stepper events={events} />
      {running && current && !open && (
        <div className="flex items-center gap-2 border-t border-line-2 px-4 py-2.5 text-[13.5px] text-ink-2">
          <Loader2 size={13} className="animate-spin text-accent" />
          {current.title}
        </div>
      )}
      <AnimatePresence initial={false}>
        {open && (
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
  const { lang } = usePrefs();
  return (
    <div className="flex items-center gap-1 overflow-x-auto px-4 pb-3">
      {NODES.map((n, i) => {
        const s = nodeState(events, n.tools);
        return (
          <div key={n.id} className="flex shrink-0 items-center gap-1">
            <span
              className={cx(
                "flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] transition-colors",
                s === "pending" && "border-line text-ink-3",
                s === "running" && "border-accent bg-accent-soft text-accent",
                s === "done" && "border-ok/30 bg-ok-soft text-ok",
                s === "warn" && "border-warn/30 bg-warn-soft text-warn",
                s === "error" && "border-bad/30 bg-bad-soft text-bad",
                s === "waiting" && "border-warn bg-warn-soft text-warn",
              )}
            >
              {s === "running" ? <Loader2 size={11} className="animate-spin" /> : s === "waiting" ? <Hand size={11} /> : s === "pending" ? <CircleDashed size={11} /> : s === "error" ? <X size={11} /> : s === "warn" ? <AlertTriangle size={11} /> : <Check size={11} />}
              {lang === "zh" ? n.zh : n.en}
            </span>
            {i < NODES.length - 1 && <span className="h-px w-3 bg-line" />}
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
  const { t } = usePrefs();
  const time = useTime();
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
      <button disabled={!hasMore} onClick={() => setOpen((o) => !o)} className={cx("flex w-full items-start gap-2.5 text-left", compact ? "py-0.5" : "px-2 py-1.5")}>
        <span className="mt-[3px] shrink-0">{e.actor === "human" ? <UserRound size={13} className="text-ink" /> : icon}</span>
        <span className="mt-[2px] w-[62px] shrink-0 font-mono text-[11.5px] text-ink-3">{time(e.ts)}</span>
        <span className="min-w-0 flex-1">
          <span className={cx("text-[13.5px]", e.status === "running" ? "text-ink-2" : "text-ink")}>{e.title}</span>
          <span className="ml-2 inline-flex flex-wrap items-center gap-1 align-middle">
            {e.tool && <span className="rounded bg-line-2 px-1 py-px font-mono text-[10.5px] text-ink-2">{e.tool}</span>}
            {e.actor === "human" && <span className="rounded bg-ink px-1 py-px text-[10.5px] text-paper">{t("人工", "human")}</span>}
            {e.simulated && <SimBadge />}
            {e.durationMs !== undefined && <span className="font-mono text-[10.5px] text-ink-3">{ms(e.durationMs)}</span>}
          </span>
        </span>
        {hasMore && <span className="mt-[3px] text-ink-3">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-2 pb-2.5 pl-[96px] pr-2">
              {e.detail && <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">{e.detail}</div>}
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
        <a key={c.label + c.text} href={c.url} target="_blank" rel="noreferrer" className="block rounded-md border-l-2 border-accent/50 bg-accent-soft/50 px-2.5 py-1 text-[12px] leading-snug text-ink-2 hover:bg-accent-soft">
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
      <span className="font-mono text-[11px] text-ink-2">{p.toFixed(2)}</span>
    </span>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EventData({ data }: { data: any }) {
  const { t } = usePrefs();
  const ROUTE = { auto: t("自動續行", "auto"), verify: t("建議人工確認", "verify"), escalate: t("轉人工", "escalate") } as const;
  if (!data) return null;
  if (data.kind === "classification")
    return (
      <div className="overflow-x-auto rounded-lg border border-line-2">
        <table className="w-full text-[12px]">
          <thead className="bg-paper text-ink-3">
            <tr>
              <th className="px-2 py-1 text-left font-normal">{t("檔案", "File")}</th>
              <th className="px-2 py-1 text-left font-normal">{t("Choice：文件類型", "Choice: document type")}</th>
              <th className="px-2 py-1 text-left font-normal">P</th>
              <th className="px-2 py-1 text-left font-normal">{t("Noul：可判讀", "Noul: readable")}</th>
              <th className="px-2 py-1 text-left font-normal">{t("Noul：指令注入", "Noul: injection")}</th>
            </tr>
          </thead>
          <tbody>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {data.rows.map((r: any) => (
              <tr key={r.file} className="border-t border-line-2">
                <td className="px-2 py-1 font-mono text-[11px] text-ink-2">{r.file}</td>
                <td className="px-2 py-1">
                  {r.type} <span className="text-[10.5px] text-ink-3">{ROUTE[r.routed as keyof typeof ROUTE]}</span>
                </td>
                <td className="px-2 py-1"><Prob p={r.p} /></td>
                <td className="px-2 py-1"><Prob p={r.readable} /></td>
                <td className="px-2 py-1"><Prob p={r.injection} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-line-2 bg-paper px-2 py-1 text-[11px] text-ink-3">
          {data.rows[0]?.provider === "jev" ? t(`TypeSafe Jev・每份文件一次請求、四個問題・${data.rows[0]?.latencyMs}ms`, `TypeSafe Jev · one request per document, four questions · ${data.rows[0]?.latencyMs}ms`) : t("模擬判斷（非 Jev 推論）", "Simulator (not Jev inference)")}
          {t("・門檻 0.95 自動／0.80 確認（示意值，未經校準）", " · thresholds 0.95 auto / 0.80 verify (illustrative, not calibrated)")}
        </div>
      </div>
    );
  if (data.kind === "checklist")
    return (
      <div className="flex flex-wrap gap-1">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {data.required.map((r: any) => (
          <span key={r.id} className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px]", r.ok ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad")}>
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
          <div key={r.id} className="flex items-start gap-1.5 text-[12px]">
            <span className="mt-[2px]">{r.result === "pass" ? <Check size={11} className="text-ok" /> : r.result === "fail" ? <X size={11} className="text-bad" /> : <AlertTriangle size={11} className="text-warn" />}</span>
            <span className="text-ink">{r.title}</span>
            <span className="text-ink-3">— {r.detail}</span>
            <span className="ml-auto shrink-0 text-[10.5px] text-accent">{r.citation.label}</span>
          </div>
        ))}
      </div>
    );
  if (data.kind === "jev")
    return (
      <div className="space-y-1.5">
        {Object.entries(data.decisions as Record<string, DecisionRecord>).map(([k, d]) => (
          <div key={k} className="rounded-lg border border-line-2 px-2.5 py-1.5 text-[12px]">
            <div className="flex items-center gap-1.5">
              <span className="rounded bg-accent-soft px-1 font-mono text-[10.5px] uppercase text-accent">{d.type}</span>
              <span className="font-mono text-[11px] text-ink-2">{k}</span>
              {d.provider === "simulated" ? <SimBadge /> : <span className="font-mono text-[10.5px] text-ink-3">{d.model} · {d.latencyMs}ms</span>}
            </div>
            <div className="mt-0.5 text-ink-2">{d.question}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink">→ {d.type === "noul" ? t("P(是)", "P(yes)") : d.type === "score" ? `score ${Number(d.answer).toFixed(2)}` : String(d.answer)}</span>
              {d.type !== "score" && <Prob p={d.probability} />}
              {d.confidence !== undefined && d.confidence !== null && <span className="font-mono text-[10.5px] text-ink-3">confidence {d.confidence.toFixed(2)}</span>}
              {d.routed && <span className="text-[11px] text-ink-3">{ROUTE[d.routed]}</span>}
            </div>
            {d.type === "choice" && d.probabilities && (
              <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-ink-3">
                {Object.entries(d.probabilities).map(([o, p]) => (
                  <span key={o} className="font-mono">
                    {o} {p.toFixed(2)}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="text-[11px] text-ink-3">{t("Jev 只回答窄範圍的型別化問題；下一步由程式碼依門檻決定，且一律交人工核定。", "Jev answers narrow typed questions only; code applies the thresholds, and a human always makes the call.")}</div>
      </div>
    );
  if (data.kind === "facts") {
    const f = data.facts;
    return (
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
        {[
          [t("申請人", "Applicant"), f.applicantName],
          [t("出生日期", "Born"), f.birthDate],
          [t("申請日期", "Applied"), f.applicationDate],
          [t("遷入日期", "Moved in"), f.registeredSince ?? t("無法判讀", "unreadable")],
          [t("學校", "School"), f.school],
          [t("課程", "Course"), f.courseName ?? "—"],
          [t("申請書起始日", "Start date on form"), f.declaredStart],
          [t("心得字數", "Essay length"), f.reflectionChars],
        ].map(([k, v]) => (
          <div key={k} className="contents">
            <span className="text-ink-3">{k}</span>
            <span className="text-ink">{String(v ?? "—")}</span>
          </div>
        ))}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {f.tools.map((x: any, i: number) => (
          <div key={i} className="contents">
            <span className="text-ink-3">{t("訂閱", "Subscription")} {i + 1}</span>
            <span className="text-ink">
              {x.name} | {x.billing === "annual" ? t("年繳", "annual") : t("月繳", "monthly")} | {x.cycleStart} ~ {x.cycleEnd} | NT${x.amount} | {x.plan}
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (data.kind === "draft") return <pre className="whitespace-pre-wrap rounded-lg bg-paper p-2.5 font-sans text-[12.5px] leading-relaxed text-ink-2">{data.text}</pre>;
  if (data.kind === "outcome") return <div className="text-[12px] text-ink-3">{data.note}</div>;
  if (data.args) return <pre className="font-mono text-[11px] text-ink-3">{JSON.stringify(data.args)}</pre>;
  return null;
}

/* ---------------------------------- tasks ---------------------------------- */

function TaskCard({ task, caseRec }: { task: ReviewTask; caseRec?: CaseRecord }) {
  const { t } = usePrefs();
  const time = useTime();
  const [draft, setDraft] = useState(task.draft ?? "");
  const [changing, setChanging] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const decided = task.status !== "pending";

  const decide = async (action: "approve" | "request_changes") => {
    setBusy(action);
    await post(`/api/tasks/${task.id}`, { action, note: action === "request_changes" ? note : undefined, draft: draft !== task.draft ? draft : undefined });
    setBusy(null);
    setChanging(false);
  };

  const approveLabel = task.kind === "forward_for_approval" ? t("核可，轉陳核定", "Approve & forward") : t("核可，放入寄件匣", "Approve & queue to send");
  const question =
    task.kind === "send_correction_notice"
      ? t("要寄出這份補正通知嗎？", "Send this correction notice?")
      : task.kind === "verify_case"
        ? t("這件需要你判斷，要請申請人說明嗎？", "This one needs your judgment. Ask the applicant to clarify?")
        : t("要轉陳主管核定嗎？", "Forward to your supervisor for approval?");

  if (decided)
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-card px-4 py-3 text-[14px]">
        <Check size={16} className="text-ok" />
        <span className="font-medium">{task.status === "approved" ? t("你已核可", "You approved") : t("你已要求修改", "You requested changes")}</span>
        <span className="text-ink-3">
          {task.caseId} · {task.title}
        </span>
        {task.decisionNote && <span className="text-ink-2">“{task.decisionNote}”</span>}
        {task.decidedAt && <span className="ml-auto text-[12.5px] text-ink-3">{time(task.decidedAt)}</span>}
      </div>
    );

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 overflow-hidden rounded-2xl border-2 border-warn/40 bg-card shadow-[0_10px_30px_-18px_rgba(180,83,9,0.45)]">
      <div className="grid gap-5 px-6 py-5 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 text-[13px] font-medium text-warn">
              <Hand size={14} /> {t("需要你決定", "Your decision")} · {task.caseId} {caseRec?.applicantLabel}
            </div>
            <div className="mt-1.5 text-[20px] font-semibold leading-snug text-ink">{question}</div>
            <ul className="mt-2.5 space-y-1.5 text-[15px] leading-relaxed text-ink">
              {(caseRec?.issues?.length ? caseRec.issues : [task.issue]).slice(0, 4).map((i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                  {i}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-start gap-2 rounded-xl bg-accent-soft/60 px-4 py-3 text-[14.5px] leading-relaxed">
            <Sparkles size={15} className="mt-[4px] shrink-0 text-accent" />
            <span className="text-ink">{task.recommendation}</span>
          </div>
        </div>

        {task.draft && (
          <div className="flex flex-col">
            <div className="mb-1.5 text-[12.5px] text-ink-3">
              {task.kind === "forward_for_approval" ? t("審查摘要草稿", "Review summary draft") : t("通知草稿", "Notice draft")}
              {" · "}
              {task.draftSource === "llm" ? t("AI 撰寫", "written by AI") : t("範本", "template")}
              {" · "}
              {t("可直接修改・核可前不會寄出", "editable · nothing is sent before you approve")}
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(13, Math.max(7, draft.split("\n").length + 1))}
              className="w-full flex-1 resize-y rounded-xl border border-line bg-paper/60 px-4 py-3 text-[14px] leading-relaxed text-ink outline-none focus:border-accent/50 focus:bg-card"
            />
          </div>
        )}
      </div>

      <div className="space-y-3 border-t border-line-2 px-6 py-4">
        {changing && (
          <div className="flex gap-2">
            <input
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("要怎麼改？例如：語氣再委婉、期限改 14 日", "What should change? e.g. softer tone, 14-day deadline")}
              className="flex-1 rounded-xl border border-line bg-card px-4 py-2.5 text-[14.5px] outline-none focus:border-accent/50"
            />
            <button disabled={!note.trim() || !!busy} onClick={() => decide("request_changes")} className="rounded-xl bg-ink px-5 text-[14.5px] font-medium text-paper disabled:opacity-40">
              {busy === "request_changes" ? <Loader2 size={15} className="animate-spin" /> : t("請 AI 重擬", "Redraft")}
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={!!busy} onClick={() => decide("approve")} className="inline-flex items-center gap-2 rounded-xl bg-ink px-6 py-3 text-[15.5px] font-semibold text-paper hover:opacity-90 disabled:opacity-50">
            {busy === "approve" ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {approveLabel}
          </button>
          <button onClick={() => setChanging((v) => !v)} className="rounded-xl border border-line px-5 py-3 text-[15.5px] text-ink hover:bg-paper">
            {t("要修改", "Request changes")}
          </button>
          <span className="text-[12.5px] text-ink-3">{t("核可只是內部作業確認，不是行政處分。", "Approving is an internal step, not an administrative decision.")}</span>
          <button onClick={() => setShowWhy((v) => !v)} className="ml-auto inline-flex items-center gap-1 text-[13.5px] text-ink-2 hover:text-ink">
            {t("依據與證據", "Evidence & sources")} {showWhy ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>

        {showWhy && (
          <div className="grid gap-4 border-t border-line-2 pt-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13.5px]">
                {task.evidence.map((e, i) => (
                  <div key={i} className="contents">
                    <span className="text-ink-3">{e.label}</span>
                    <span className="text-ink">{e.value}</span>
                  </div>
                ))}
              </div>
              {task.citations.length > 0 && <Citations items={task.citations.slice(0, 5)} />}
            </div>
            {caseRec && <EvidenceList c={caseRec} />}
          </div>
        )}
      </div>
    </motion.div>
  );
}

const DOC_LABELS: Record<string, [string, string]> = {
  application_form: ["申請書", "Application form"],
  household_record: ["戶籍資料", "Household record"],
  student_status: ["在學／畢業證明", "Enrolment proof"],
  ai_course_proof: ["AI 課程證明", "AI course proof"],
  ai_course_teacher_cert: ["教師證明書", "Instructor letter"],
  subscription_receipt: ["訂閱憑證", "Receipt"],
  bank_receipt: ["領據＋存摺", "Receipt form"],
  usage_reflection: ["使用心得", "Usage essay"],
  self_checklist: ["自主檢核表", "Self-check list"],
  low_income_proof: ["低收證明", "Low-income cert."],
  unknown: ["無法辨識", "Unrecognised"],
};

function EvidenceList({ c }: { c: CaseRecord }) {
  const { t, lang } = usePrefs();
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="rounded-lg border border-line-2">
      <div className="border-b border-line-2 bg-paper px-3 py-1.5 text-[11.5px] text-ink-3">{t("原始文件（OCR 文字，視為不可信資料，不會被當作指令執行）", "Source documents (OCR text — treated as untrusted data, never as instructions)")}</div>
      {c.documents.map((d) => (
        <div key={d.id} className="border-b border-line-2 last:border-0">
          <button onClick={() => setOpenId(openId === d.id ? null : d.id)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-paper">
            <FileText size={12} className="text-ink-3" />
            <span className="font-mono text-[11.5px] text-ink-2">{d.fileName}</span>
            <span className="text-ink">{d.classifiedAs ? (DOC_LABELS[d.classifiedAs]?.[lang === "zh" ? 0 : 1] ?? d.classifiedAs) : t("未分類", "Unclassified")}</span>
            {d.readable === false && <span className="rounded bg-bad-soft px-1 text-[10.5px] text-bad">{t("無法判讀", "unreadable")}</span>}
            {d.injectionSuspected && (
              <span className="inline-flex items-center gap-0.5 rounded bg-bad-soft px-1 text-[10.5px] text-bad">
                <ShieldAlert size={10} /> {t("疑似指令注入", "prompt injection")}
              </span>
            )}
          </button>
          {openId === d.id && <pre className="whitespace-pre-wrap bg-paper px-3 py-2 font-sans text-[12px] leading-relaxed text-ink-2">{d.text}</pre>}
        </div>
      ))}
    </div>
  );
}

/* --------------------------------- composer -------------------------------- */

function Composer({ onSend, busy, suggestions, onPickFiles }: { onSend: (t: string) => void; busy: boolean; suggestions: string[]; onPickFiles: (f: FileList | null) => void }) {
  const { t } = usePrefs();
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const submit = () => {
    if (!text.trim()) return;
    onSend(text);
    setText("");
  };
  return (
    <div className="border-t border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto max-w-[920px] px-6 pb-5 pt-3.5 lg:px-10">
        <div className="mb-2.5 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s} disabled={busy} onClick={() => onSend(s)} className="rounded-full border border-line bg-card px-3.5 py-1.5 text-[13px] text-ink-2 hover:border-ink/20 hover:text-ink disabled:opacity-50">
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-card px-3 py-2.5 shadow-sm focus-within:border-accent/40">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,application/pdf,image/*,text/plain"
            className="hidden"
            onChange={(e) => {
              onPickFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button onClick={() => fileRef.current?.click()} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-line-2" aria-label={t("上傳文件", "Upload documents")} title={t("上傳文件（PDF／圖片／文字）", "Upload documents (PDF / image / text)")}>
            <Paperclip size={17} />
          </button>
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
            placeholder={t("告訴 GovFlow 要做什麼…", "Tell GovFlow what to do…")}
            className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-[16px] outline-none placeholder:text-ink-3"
          />
          <button onClick={submit} disabled={busy || !text.trim()} className="grid h-9 w-9 place-items-center rounded-full bg-ink text-paper disabled:opacity-30" aria-label={t("送出", "Send")}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- upload ---------------------------------- */

function UploadTray({ files, setFiles, cases }: { files: File[]; setFiles: (f: File[]) => void; cases: CaseRecord[] }) {
  const { t, lang } = usePrefs();
  const targets = cases.filter((c) => c.status === "awaiting_correction" || c.status === "awaiting_human");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const total = files.reduce((n, f) => n + f.size, 0);
  const tooBig = total > 4 * 1024 * 1024;

  const upload = async () => {
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    fd.append("lang", lang);
    if (target) fd.append("caseId", target);
    try {
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErr(j.error ?? `HTTP ${r.status}`);
      else setFiles([]);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-line bg-card">
      <div className="mx-auto max-w-[920px] space-y-3 px-6 py-4 lg:px-10">
        <div className="flex items-center gap-2 text-[14px] font-medium">
          <Upload size={15} className="text-accent" />
          {t(`準備上傳 ${files.length} 個檔案`, `${files.length} file(s) ready to upload`)}
          <span className="text-[12.5px] font-normal text-ink-3">· {(total / 1024 / 1024).toFixed(1)} MB / 4 MB</span>
          <button onClick={() => setFiles([])} className="ml-auto text-[13px] text-ink-3 hover:text-ink">
            {t("取消", "Cancel")}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper px-2.5 py-1 text-[12.5px]">
              <FileText size={12} className="text-ink-3" />
              {f.name}
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-ink-3 hover:text-bad" aria-label="remove">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="rounded-lg border border-line bg-paper px-3 py-2 text-[14px] text-ink outline-none">
            <option value="">{t("這是一件新申請", "This is a new application")}</option>
            {targets.map((c) => (
              <option key={c.id} value={c.id}>
                {t(`補件：${c.id} ${c.applicantLabel}`, `Correction for ${c.id} ${c.applicantLabel}`)}
              </option>
            ))}
          </select>
          <button disabled={busy || tooBig} onClick={upload} className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-2 text-[14.5px] font-semibold text-paper disabled:opacity-40">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {t("交給 GovFlow 處理", "Hand to GovFlow")}
          </button>
          <span className="text-[12px] text-warn">{t("展示網站為公開環境：請只上傳測試／合成文件，勿上傳真實個資。", "Public demo: upload test/synthetic documents only — no real personal data.")}</span>
        </div>
        {(err || tooBig) && <div className="text-[13px] text-bad">{tooBig ? t("檔案總大小超過 4 MB", "Total size is over 4 MB") : err}</div>}
      </div>
    </div>
  );
}
