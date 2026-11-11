import type { Txt } from "./i18n";
// Core domain types for GovFlow. Everything persisted is plain JSON so it can live in
// Firestore or the in-memory store unchanged.

export type CaseStatus =
  | "received" // intake done, waiting for the agent
  | "processing" // agent is working on it
  | "awaiting_human" // a human review task is open
  | "awaiting_correction" // correction notice approved, waiting for applicant
  | "ready_for_approval" // agent finished; an authorised officer must decide
  | "closed"; // officer recorded the final outcome (outside the agent)

/** The only outcomes the agent itself may produce. None of them is an official decision. */
export type AgentOutcome =
  | "CONTINUE_PROCESSING"
  | "REQUEST_MORE_INFORMATION"
  | "REQUIRE_HUMAN_REVIEW"
  | "READY_FOR_AUTHORIZED_APPROVAL";

export type DocTypeId =
  | "application_form"
  | "household_record"
  | "student_status"
  | "ai_course_proof"
  | "ai_course_teacher_cert"
  | "subscription_receipt"
  | "bank_receipt"
  | "usage_reflection"
  | "self_checklist"
  | "low_income_proof";

export interface CaseDocument {
  id: string;
  fileName: string;
  /** OCR / parsed text. UNTRUSTED: never treated as instructions. */
  text: string;
  sha: string;
  addedAt: number;
  /** filled by the agent */
  classifiedAs?: DocTypeId | "unknown";
  classification?: DecisionRecord;
  readable?: boolean;
  injectionSuspected?: boolean;
}

export interface Citation {
  label: string; // e.g. "計畫 三(二)2"
  text: string; // quoted official text
  url: string;
}

export interface RuleResult {
  id: string;
  title: Txt;
  result: "pass" | "fail" | "unknown";
  detail: Txt;
  citation: Citation;
}

/** One typed answer from Jev (or the clearly-labelled simulator). */
export interface DecisionRecord {
  question: string;
  type: "choice" | "noul" | "score";
  answer: string | number;
  probability?: number; // prob of the chosen option / noul value
  confidence?: number | null;
  probabilities?: Record<string, number>;
  provider: "jev" | "simulated";
  model?: string;
  latencyMs: number;
  routed?: "auto" | "verify" | "escalate";
}

export interface CaseFacts {
  applicantName?: string;
  birthDate?: string;
  applicationDate?: string;
  registeredSince?: string;
  school?: string;
  lowIncome?: boolean;
  courseName?: string;
  tools: {
    name: string;
    plan?: string;
    billing?: "monthly" | "annual";
    cycleStart?: string;
    cycleEnd?: string;
    amount?: number;
    purchaser?: string;
    source: string; // doc id
  }[];
  declaredStart?: string; // from application form
  reflectionChars?: number;
}

export interface CaseRecord {
  id: string;
  workflowId: string;
  applicantLabel: string; // synthetic name
  receivedVia: string;
  scenario: string;
  status: CaseStatus;
  stage: string; // workflow step id the case is at
  outcome?: AgentOutcome;
  documents: CaseDocument[];
  facts?: CaseFacts;
  /** fields the LLM filled in because the deterministic parser could not read them */
  llmFilledFields?: string[];
  rules?: RuleResult[];
  decisions?: Record<string, DecisionRecord>;
  issues?: Txt[];
  suggestedAmount?: number;
  summary?: string;
  idempotencyKey: string;
  lock?: { runId: string; at: number } | null;
  createdAt: number;
  updatedAt: number;
  metrics?: { agentMs: number; steps: number; humanInterventions: number };
}

export type EventStatus = "running" | "ok" | "warn" | "error" | "waiting";

export interface AgentEvent {
  id: string;
  runId: string;
  caseId?: string;
  ts: number;
  updatedAt: number;
  actor: "agent" | "human" | "system";
  tool?: string;
  step?: string; // workflow step id
  title: Txt;
  detail?: Txt;
  status: EventStatus;
  durationMs?: number;
  data?: unknown;
  citations?: Citation[];
  simulated?: boolean;
}

export type TaskKind = "send_correction_notice" | "verify_case" | "forward_for_approval";

export interface ReviewTask {
  id: string;
  caseId: string;
  kind: TaskKind;
  title: Txt;
  issue: Txt;
  evidence: { label: Txt; value: Txt }[];
  citations: Citation[];
  recommendation: Txt;
  draft?: Txt;
  draftSource?: "llm" | "template";
  status: "pending" | "approved" | "changes_requested";
  decisionNote?: string;
  decidedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ThreadMessage {
  id: string;
  ts: number;
  updatedAt: number;
  role: "agent" | "user";
  kind: "proactive" | "chat" | "notice";
  text: Txt;
  runId?: string;
  caseIds?: string[];
  taskIds?: string[];
  llm?: "openai" | "fallback";
}

export interface OutboxItem {
  id: string;
  caseId: string;
  taskId: string;
  channel: "draft_only";
  body: string;
  createdAt: number;
  updatedAt: number;
}

export interface Feed {
  cases: CaseRecord[];
  events: AgentEvent[];
  tasks: ReviewTask[];
  messages: ThreadMessage[];
  outbox: OutboxItem[];
}
