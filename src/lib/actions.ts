import "server-only";
import { createHash } from "node:crypto";
import { processCase } from "./pipeline";
import { agentSay, logEvent } from "./runtime";
import { CORRECTIONS, SCENARIOS, type SeedDoc } from "./seed";
import { db, uid } from "./store";
import type { CaseDocument, CaseRecord } from "./types";
import { youthAiSubsidyWorkflow } from "./workflows/youth-ai-subsidy";

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const toDoc = (d: SeedDoc): CaseDocument => ({ id: uid("doc"), fileName: d.fileName, text: d.text, sha: sha(d.text), addedAt: Date.now() });

/** Incoming-application event (scanner / mailroom / online form). Returns caseId or null if duplicate. */
export async function receiveApplication(scenarioKey: string): Promise<{ caseId: string | null; duplicate: boolean }> {
  const s = SCENARIOS.find((x) => x.key === scenarioKey);
  if (!s) throw new Error("unknown scenario");
  const key = sha(s.docs.map((d) => d.text).join("|"));
  const existing = (await db.list("cases")).find((c) => c.idempotencyKey === key);
  if (existing) {
    await logEvent({ runId: uid("run"), caseId: existing.id }, { actor: "system", tool: "receive_application", title: `重複進件事件（與 ${existing.id} 內容相同），已略過、不重複處理`, status: "warn" });
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
export async function receiveCorrection(caseId: string, docs?: SeedDoc[]) {
  const c = await db.get("cases", caseId);
  if (!c) throw new Error("case not found");
  const add = docs ?? CORRECTIONS[caseId];
  if (!add?.length) throw new Error("no correction documents for this case");
  const known = new Set(c.documents.map((d) => d.sha));
  const fresh = add.map(toDoc).filter((d) => !known.has(d.sha));
  if (!fresh.length) {
    await logEvent({ runId: uid("run"), caseId }, { actor: "system", tool: "receive_application", title: "補件內容與既有文件相同，已略過", status: "warn" });
    return false;
  }
  // unreadable docs are superseded by a re-submission of the same type
  await db.patch("cases", caseId, { documents: [...c.documents, ...fresh], status: "received", updatedAt: Date.now() });
  return true;
}

export async function processInBackground(caseId: string, trigger: string) {
  await processCase(caseId, { trigger });
}

/** Human decision on a review task. The ONLY path by which anything leaves the building. */
export async function decideTask(taskId: string, action: "approve" | "request_changes", note?: string, editedDraft?: string) {
  const t = await db.get("tasks", taskId);
  if (!t) throw new Error("task not found");
  if (t.status !== "pending") throw new Error("task already decided");
  const now = Date.now();
  const ctx = { runId: uid("run"), caseId: t.caseId };
  await db.patch("tasks", taskId, { status: action === "approve" ? "approved" : "changes_requested", decisionNote: note, decidedAt: now, updatedAt: now, ...(editedDraft ? { draft: editedDraft } : {}) });

  if (action === "request_changes") {
    await logEvent(ctx, { actor: "human", title: `承辦人要求修改：${note || "（未填寫）"}`, status: "ok", tool: "human_review" });
    return { redraft: true };
  }

  await logEvent(ctx, { actor: "human", title: `承辦人核可：${t.title}`, detail: note, status: "ok", tool: "human_review" });
  if (t.kind === "forward_for_approval") {
    await db.patch("cases", t.caseId, { status: "ready_for_approval", updatedAt: Date.now() });
    await logEvent(ctx, { tool: "update_case_state", title: `${t.caseId} 已轉陳核定（承辦人確認；正式核准仍屬權責主管）`, status: "ok" });
    await agentSay({ kind: "notice", caseIds: [t.caseId], text: `收到。${t.caseId} 已標記為「已轉陳核定」，審查摘要附在案卷。正式核准與撥款仍由權責主管決行，我不會代為處理。` });
  } else {
    // outbound communication: draft-only outbox, never actually sent from this prototype
    await db.set("outbox", { id: uid("out"), caseId: t.caseId, taskId, channel: "draft_only", body: editedDraft ?? t.draft ?? "", createdAt: Date.now(), updatedAt: Date.now() });
    await db.patch("cases", t.caseId, { status: "awaiting_correction", updatedAt: Date.now() });
    await logEvent(ctx, { tool: "update_case_state", title: `通知已放入寄件匣（展示模式：不會真的寄出），${t.caseId} 等待申請人補件`, status: "waiting" });
    await agentSay({ kind: "notice", caseIds: [t.caseId], text: `已依你的核可，把 ${t.caseId} 的通知放進寄件匣（展示模式只會留存草稿，不會真的寄出）。申請人補件進來後，我會自動從中斷的階段續行。` });
  }
  return { redraft: false };
}

export async function resetDemo() {
  await db.clear();
  await agentSay({
    kind: "proactive",
    text: "早安。我是 GovFlow，青年局「青年 AI 工具補助」的值班 agent。新申請一進來（掃描、臨櫃或網路），我會自動讀文件、比對 SOP P49000012 與計畫條文、用 Jev 做窄範圍判斷，再把需要你決定的事情整理到這裡。所有對外通知和核定都要你點頭。",
  });
}
