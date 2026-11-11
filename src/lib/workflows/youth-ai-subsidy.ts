import type { Citation, DocTypeId } from "../types";

// Executable workflow definition derived from:
//  - 臺北市政府青年局「青年AI工具補助」作業流程圖 (SOP P49000012, 異動 115/08/01)
//  - 115年度青年AI工具補助計畫 (youth.gov.taipei)
// This is a hackathon modelling of the published text, NOT an authoritative rule set.

export const PROGRAM_URL =
  "https://youth.gov.taipei/services/05eb79e5-46b5-41e5-b1fd-0519d782b04a/0ecc1836-dd0d-4085-a34f-003609f00796";
export const SOP_URL = "https://laws.gov.taipei/Law/SOPContent/SOPContent?id=P49000012";

const cite = (label: string, text: string, url = PROGRAM_URL): Citation => ({ label, text, url });

export const CITES = {
  eligibilityAge: cite(
    "計畫 二(一)",
    "18歲以上至35歲（以申請日計算）設籍臺北市（以下簡稱本市）6個月以上青年。",
  ),
  student: cite("計畫 二(二)", "具經教育部承認之大專院校、研究所學籍或本年度應屆畢業生。"),
  course: cite(
    "計畫 二(三)",
    "曾修習人工智慧（AI）相關課程或參與本局青年以戰代訓銜接職場計畫，並取得學分、及格成績或相關結業證明文件者。",
  ),
  courseCert: cite(
    "計畫 四(四)",
    "證明文件上之名稱未明確包含「人工智慧」、「AI(Artificial Intelligence)」等文字…申請人需額外檢附授課單位或教師開立之證明書。",
  ),
  period: cite("計畫 三(一)", "補助期間：115年8月1日至10月31日止。"),
  monthly: cite("計畫 三(二)2", "月訂閱制：訂閱週期起始日及末日均應於補助期間內，按月計算訂閱費用。"),
  annual: cite(
    "計畫 三(二)3",
    "年訂閱制：以年訂閱費用總額按比例折算每月訂閱費用，並以月折算訂閱週期，且以月折算之訂閱週期起始日及末日均應於補助期間內。",
  ),
  underMonth: cite("計畫 三(二)4", "補助期間內訂閱週期未滿一個月者不予補助。"),
  maxTools: cite("計畫 三(三)1", "青年每年度以申請1次為限；每次申請最多得申請2項AI工具訂閱費用補助。"),
  deadline: cite(
    "計畫 三(三)2",
    "青年應於AI工具補助條件最後達成日次日起1個月內提出申請，但最遲應於11月10日前提出申請。",
  ),
  cap: cite(
    "計畫 三(四)1",
    "每人每年最高補助以新臺幣4,000元為限；青年屬本市低收入戶或中低收入戶者，最高補助以8,000元為限。",
  ),
  personal: cite(
    "計畫 三(四)2",
    "AI工具應以個人使用版本為原則，企業版本或家庭版本等多人共用版本不予補助。",
  ),
  prc: cite("計畫 三(四)3", "中國大陸開發之工具軟體不予補助。如CapCut、Kling、Meitu、美圖秀秀、Wink、WHEE及SenseAvatar 等。"),
  purchaser: cite(
    "計畫 四(五)",
    "AI工具訂閱紀錄及購買憑證（如發票或收據，購買人應為申請人本人，或申請人之法定代理人）。",
  ),
  reflection: cite("計畫 四(七)", "AI工具使用心得一篇（申請每項AI工具字數至少300字）。"),
  documents: cite("計畫 四", "青年申請本計畫補助，應檢具下列文件…"),
  correction: cite(
    "計畫 五",
    "申請文件如有欠缺，本局應通知申請者限期補正；屆期未補正或補正不全者，本局得駁回其申請或依現有文件逕為審核。",
  ),
  sopFlow: cite(
    "SOP P49000012",
    "1.收件(1日) → 2.審查(25日)：不符合→2.1通知補正→2.2補正資料審查 → 3.函復申請人(2日)；總處理時限28日。",
    SOP_URL,
  ),
} satisfies Record<string, Citation>;

export interface RequiredDoc {
  id: DocTypeId;
  label: string;
  description: string;
  required: boolean | "conditional";
}

export const DOC_TYPES: RequiredDoc[] = [
  { id: "application_form", label: "申請書", description: "Subsidy application form with applicant data and claimed AI tools", required: true },
  { id: "household_record", label: "戶口名簿影本／戶籍謄本", description: "Household registration showing residence in Taipei City and registration date", required: true },
  { id: "student_status", label: "在學證明／畢業證書", description: "Certificate of enrolment or 115 graduation certificate", required: true },
  { id: "ai_course_proof", label: "AI課程修習證明", description: "Transcript or credit certificate showing a completed AI-related course", required: true },
  { id: "ai_course_teacher_cert", label: "AI課程證明書（教師開立）", description: "Letter from instructor certifying the course content includes AI", required: "conditional" },
  { id: "subscription_receipt", label: "AI工具訂閱紀錄及購買憑證", description: "Invoice, receipt or subscription record for an AI tool", required: true },
  { id: "bank_receipt", label: "領據正本及存摺封面影本", description: "Signed receipt form and bank passbook cover", required: true },
  { id: "usage_reflection", label: "AI工具使用心得", description: "Essay describing how the applicant used the AI tool", required: true },
  { id: "self_checklist", label: "補助案件自主檢核表", description: "Applicant self-check list", required: true },
  { id: "low_income_proof", label: "低收／中低收入戶證明", description: "Low-income household certificate", required: "conditional" },
];

const DOC_EN: Record<string, string> = {
  application_form: "Application form",
  household_record: "Household registration",
  student_status: "Enrolment / graduation proof",
  ai_course_proof: "AI course transcript",
  ai_course_teacher_cert: "Instructor letter (AI course)",
  subscription_receipt: "AI subscription receipt",
  bank_receipt: "Receipt form + passbook",
  usage_reflection: "Usage essay",
  self_checklist: "Self-check list",
  low_income_proof: "Low-income certificate",
};
export const docLabel = (id: string, lang: "en" | "zh" = "zh") =>
  lang === "en" ? (DOC_EN[id] ?? "Unrecognised") : (DOC_TYPES.find((d) => d.id === id)?.label ?? "無法辨識");

export const SUBSIDY_PERIOD = { start: "2026-08-01", end: "2026-10-31" };
export const FINAL_DEADLINE = "2026-11-10";
export const PRC_TOOLS = ["capcut", "kling", "meitu", "美圖秀秀", "wink", "whee", "senseavatar"];

/** The workflow, as configuration. The executor in pipeline.ts walks these steps. */
export const youthAiSubsidyWorkflow = {
  id: "taipei_youth_ai_subsidy_2026",
  name: "臺北市青年 AI 工具補助（115年度）",
  nameEn: "Taipei Youth AI Tool Subsidy (2026)",
  agency: "臺北市政府青年局 職涯支援科",
  agencyEn: "Taipei City Youth Department, Career Support Section",
  sopReference: "P49000012",
  trigger: "new_application",
  statutoryTimeline: { intake: "1日", review: "25日", reply: "2日", total: "28日（日曆日）" },
  steps: [
    { id: "receive_documents", label: "收件", sop: "1.收件" },
    { id: "classify_documents", label: "文件分類", sop: "2.審查" },
    { id: "validate_completeness", label: "完整性", sop: "2.審查" },
    { id: "extract_facts", label: "擷取事實", sop: "2.審查" },
    { id: "apply_eligibility_rules", label: "規則檢核", sop: "2.審查" },
    { id: "evaluate_uncertainties", label: "Jev 判斷", sop: "2.審查" },
    { id: "prepare_review", label: "擬辦", sop: "2.1通知補正 / 3.函復" },
    { id: "request_human_approval", label: "承辦人", sop: "人工核定" },
  ],
  /** Agent permission scope. Anything not listed is denied by the tool runner. */
  agentPermissions: [
    "read_documents",
    "classify",
    "extract",
    "evaluate_rules",
    "ask_jev",
    "draft_correspondence",
    "create_review_task",
    "update_internal_status",
    "write_audit_log",
  ],
  /** Explicitly human-only. */
  humanOnly: ["send_external_communication", "approve_subsidy", "reject_application", "disburse_funds"],
  thresholds: {
    // Illustrative starting thresholds — NOT validated production values.
    classifyAuto: 0.95,
    classifyVerify: 0.8,
    noulYes: 0.7,
    noulNo: 0.3,
  },
} as const;

export type WorkflowStepId = (typeof youthAiSubsidyWorkflow.steps)[number]["id"];
export type Permission = (typeof youthAiSubsidyWorkflow.agentPermissions)[number] | (typeof youthAiSubsidyWorkflow.humanOnly)[number];
