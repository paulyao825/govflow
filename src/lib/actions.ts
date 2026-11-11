import "server-only";
import { createHash } from "node:crypto";
import { bi, pick, type Lang } from "./i18n";
import { processCase } from "./pipeline";
import { agentSay, logEvent } from "./runtime";
import { CORRECTIONS, SCENARIOS, type SeedDoc } from "./seed";
import { db, uid } from "./store";
import type { CaseDocument, CaseRecord } from "./types";
import { youthAiSubsidyWorkflow } from "./workflows/youth-ai-subsidy";

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const toDoc = (d: SeedDoc): CaseDocument => ({ id: uid("doc"), fileName: d.fileName, text: d.text, sha: sha(d.text), addedAt: Date.now() });

/** Incoming-application event (scanner / mailroom / online form). Returns caseId or null if duplicate. */
export async function receiveApplication(scenarioKey: string, lang: Lang = "en"): Promise<{ caseId: string | null; duplicate: boolean }> {
  const s = SCENARIOS.find((x) => x.key === scenarioKey);
  if (!s) throw new Error("unknown scenario");
  const key = sha(s.docs.map((d) => d.text).join("|"));
  const existing = (await db.list("cases")).find((c) => c.idempotencyKey === key);
  if (existing) {
    await logEvent({ runId: uid("run"), caseId: existing.id, lang }, { actor: "system", tool: "receive_application", title: bi(`重複進件事件（與 ${existing.id} 內容相同），已略過、不重複處理`, `Duplicate submission (same content as ${existing.id}) — skipped, not processed twice`), status: "warn" });
    return { caseId: existing.id, duplicate: true };
  }
  const now = Date.now();
  const c: CaseRecord = {
    id: s.caseId,
    workflowId: youthAiSubsidyWorkflow.id,
    applicantLabel: s.applicant,
    receivedVia: s.receivedVia,
    scenario: s.title,
    status: "received",
    stage: "receive_documents",
    documents: s.docs.map(toDoc),
    idempotencyKey: key,
    lock: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.set("cases", c);
  return { caseId: c.id, duplicate: false };
}

/** Applicant's correction documents arrive → resume the case where it stopped. */
export async function receiveCorrection(caseId: string, docs?: SeedDoc[], lang: Lang = "en") {
  const c = await db.get("cases", caseId);
  if (!c) throw new Error("case not found");
  const add = docs ?? CORRECTIONS[caseId];
  if (!add?.length) throw new Error("no correction documents for this case");
  const known = new Set(c.documents.map((d) => d.sha));
  const fresh = add.map(toDoc).filter((d) => !known.has(d.sha));
  if (!fresh.length) {
    await logEvent({ runId: uid("run"), caseId, lang }, { actor: "system", tool: "receive_application", title: bi("補件內容與既有文件相同，已略過", "Correction identical to existing documents — skipped"), status: "warn" });
    return false;
  }
  // unreadable docs are superseded by a re-submission of the same type
  await db.patch("cases", caseId, { documents: [...c.documents, ...fresh], status: "received", updatedAt: Date.now() });
  return true;
}

export async function processInBackground(caseId: string, trigger: string | import("./i18n").Bi, lang: Lang = "en") {
  await processCase(caseId, { trigger, lang });
}

/** Human decision on a review task. The ONLY path by which anything leaves the building. */
export async function decideTask(taskId: string, action: "approve" | "request_changes", note?: string, editedDraft?: string, lang: Lang = "en") {
  const t_ = bi;
  const t = await db.get("tasks", taskId);
  if (!t) throw new Error("task not found");
  if (t.status !== "pending") throw new Error("task already decided");
  const now = Date.now();
  const ctx = { runId: uid("run"), caseId: t.caseId, lang };
  await db.patch("tasks", taskId, { status: action === "approve" ? "approved" : "changes_requested", decisionNote: note, decidedAt: now, updatedAt: now, ...(editedDraft ? { draft: { ...(typeof t.draft === "object" ? t.draft : { zh: t.draft ?? "", en: t.draft ?? "" }), [lang]: editedDraft } } : {}) });

  if (action === "request_changes") {
    await logEvent(ctx, { actor: "human", title: t_(`承辦人要求修改：${note || "（未填寫）"}`, `Officer requested changes: ${note || "(no note)"}`), status: "ok", tool: "human_review" });
    return { redraft: true };
  }

  await logEvent(ctx, { actor: "human", title: t_(`承辦人核可：${pick(t.title, "zh")}`, `Officer approved: ${pick(t.title, "en")}`), detail: note, status: "ok", tool: "human_review" });
  if (t.kind === "forward_for_approval") {
    await db.patch("cases", t.caseId, { status: "ready_for_approval", updatedAt: Date.now() });
    await logEvent(ctx, { tool: "update_case_state", title: t_(`${t.caseId} 已轉陳核定（承辦人確認；正式核准仍屬權責主管）`, `${t.caseId} forwarded for approval (officer confirmed; the formal decision stays with the supervisor)`), status: "ok" });
    await agentSay({ kind: "notice", caseIds: [t.caseId], text: t_(`收到。${t.caseId} 已標記為「已轉陳核定」，審查摘要附在案卷。正式核准與撥款仍由權責主管決行，我不會代為處理。`, `Done. ${t.caseId} is marked "forwarded for approval" with the summary attached. The formal approval and payment stay with your supervisor; I will not do either.`) });
  } else {
    // outbound communication: draft-only outbox, never actually sent from this prototype
    await db.set("outbox", { id: uid("out"), caseId: t.caseId, taskId, channel: "draft_only", body: editedDraft ?? pick(t.draft, lang), createdAt: Date.now(), updatedAt: Date.now() });
    await db.patch("cases", t.caseId, { status: "awaiting_correction", updatedAt: Date.now() });
    await logEvent(ctx, { tool: "update_case_state", title: t_(`通知已放入寄件匣（展示模式：不會真的寄出），${t.caseId} 等待申請人補件`, `Notice placed in the outbox (demo: never actually sent); ${t.caseId} waiting for the applicant`), status: "waiting" });
    await agentSay({ kind: "notice", caseIds: [t.caseId], text: t_(`已依你的核可，把 ${t.caseId} 的通知放進寄件匣（展示模式只會留存草稿，不會真的寄出）。申請人補件進來後，我會自動從中斷的階段續行。`, `Approved. The notice for ${t.caseId} is in the outbox (demo mode keeps it as a draft; nothing is really sent). When the applicant replies, I will pick the case up where it stopped.`) });
  }
  return { redraft: false };
}

export async function resetDemo(lang: Lang = "en") {
  await db.clear();
  await agentSay({
    kind: "proactive",
    text: bi(
      "早安。我是 GovFlow，青年局「青年 AI 工具補助」的值班 agent。新申請一進來（掃描、臨櫃或網路），我會自動讀文件、比對 SOP P49000012 與計畫條文、用 Jev 做窄範圍判斷，再把需要你決定的事情整理到這裡。所有對外通知和核定都要你點頭。",
      "Good morning. I am GovFlow, on duty for the Youth Department's AI Tool Subsidy. When an application arrives (scanned mail, counter or online), I read the documents, check them against SOP P49000012 and the programme rules, use Jev for narrow judgments, and bring you only what needs your decision. Nothing goes out and nothing is approved without your OK.",
    ),
  });
}

export interface UploadFile {
  name: string;
  mime: string;
  bytes: Buffer;
}

/**
 * Officer uploads scanned files: either a brand-new application, or a correction for an existing case.
 * The case is created immediately (so the UI shows it), then OCR + the workflow run in the background.
 */
export async function receiveUpload(files: UploadFile[], lang: Lang, targetCaseId?: string): Promise<{ caseId: string; duplicate: boolean; token: number }> {
  const key = sha(files.map((f) => createHash("sha256").update(f.bytes).digest("hex")).join("|"));
  if (targetCaseId) {
    const c = await db.get("cases", targetCaseId);
    if (!c) throw new Error("case not found");
    return { caseId: c.id, duplicate: false, token: c.createdAt };
  }
  const existing = (await db.list("cases")).find((c) => c.idempotencyKey === key);
  if (existing) {
    await logEvent({ runId: uid("run"), caseId: existing.id, lang }, { actor: "system", tool: "receive_application", title: bi(`重複上傳（與 ${existing.id} 內容相同），已略過`, `Duplicate upload (same files as ${existing.id}) — skipped`), status: "warn" });
    return { caseId: existing.id, duplicate: true, token: existing.createdAt };
  }
  const n = (await db.list("cases")).filter((c) => c.id.startsWith("U-")).length + 1;
  const now = Date.now();
  const c: CaseRecord = {
    id: `U-${String(n).padStart(3, "0")}`,
    workflowId: youthAiSubsidyWorkflow.id,
    applicantLabel: "",
    receivedVia: "承辦人上傳 / uploaded by officer",
    scenario: "upload",
    status: "received",
    stage: "receive_documents",
    documents: [],
    idempotencyKey: key,
    lock: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.set("cases", c);
  return { caseId: c.id, duplicate: false, token: c.createdAt };
}

/** Background half of an upload: OCR each file as a logged agent step, attach, then run the workflow. */
export async function ocrAndProcess(caseId: string, files: UploadFile[], lang: Lang, isCorrection: boolean, token: number) {
  const { ocrFile, splitPages } = await import("./ocr");
  const { runTool } = await import("./runtime");
  const ctx = { runId: uid("run"), caseId, lang };
  const docs = await runTool(ctx, { tool: "parse_documents", permission: "read_documents", step: "receive_documents", title: bi(`OCR 讀取 ${files.length} 個上傳檔案`, `OCR-reading ${files.length} uploaded file(s)`) }, async () => {
    const out = await Promise.all(files.map(async (f) => ({ f, r: await ocrFile(f.name, f.mime, f.bytes) })));
    return {
      // multi-page PDFs often bundle several documents (form + receipt form + essays + checklist): one doc per page
      result: out.flatMap(({ f, r }) => splitPages(f.name, r.text)),
      detail: out.map(({ f, r }) => `${f.name}: ${r.method === "vision" ? "vision OCR" : r.method === "text" ? "text" : "OCR unavailable"} · ${r.text.length} chars`).join("\n"),
      status: out.some(({ r }) => r.method === "unavailable") ? ("warn" as const) : ("ok" as const),
    };
  });
  const c = await db.get("cases", caseId);
  // the demo may have been reset (and the id reused) while OCR was running: never write into a different case
  if (!c || c.createdAt !== token) return;
  const known = new Set(c.documents.map((d) => d.sha));
  const fresh = docs.map(toDoc).filter((d) => !known.has(d.sha));
  const name = fresh.map((d) => d.text.match(/申請人[：:]\s*(.+)/)?.[1]?.trim()).find(Boolean);
  await db.patch("cases", caseId, { documents: [...c.documents, ...fresh], status: "received", updatedAt: Date.now(), ...(name && !isCorrection ? { applicantLabel: name } : {}) });
  await processCase(caseId, { trigger: isCorrection ? bi("承辦人上傳補件", "Officer uploaded a correction") : bi("承辦人上傳新申請", "Officer uploaded a new application"), lang });
}
