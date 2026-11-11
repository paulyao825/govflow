// Deterministic parsing + eligibility rules. Pure functions (no I/O) so they are unit-testable.
import type { CaseDocument, CaseFacts, DocTypeId, RuleResult } from "./types";
import { CITES, FINAL_DEADLINE, PRC_TOOLS, SUBSIDY_PERIOD } from "./workflows/youth-ai-subsidy";

const kv = (text: string, key: string) => text.match(new RegExp(`${key}[：:]\\s*(.+)`))?.[1]?.trim();
const date = (s?: string) => s?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
const num = (s?: string) => (s ? Number(s.replace(/[^\d.]/g, "")) || undefined : undefined);

export function addMonths(d: string, n: number) {
  const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, day));
  return dt.toISOString().slice(0, 10);
}
export function addDays(d: string, n: number) {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
/** Whole months between start (inclusive) and end (inclusive), e.g. 08-05..10-04 = 2 */
export function wholeMonths(start: string, end: string) {
  let n = 0;
  while (addDays(addMonths(start, n + 1), -1) <= end) n++;
  return n;
}
export function ageOn(birth: string, on: string) {
  const [by, bm, bd] = birth.split("-").map(Number);
  const [y, m, d] = on.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

const byType = (docs: CaseDocument[], t: DocTypeId) => docs.filter((d) => d.classifiedAs === t && d.readable !== false);

export function extractFacts(docs: CaseDocument[]): CaseFacts {
  const form = byType(docs, "application_form")[0]?.text ?? "";
  const house = byType(docs, "household_record")[0]?.text ?? "";
  const course = byType(docs, "ai_course_proof")[0]?.text ?? "";
  const reflections = byType(docs, "usage_reflection");

  const toolLine = kv(form, "申請工具1") ?? "";
  const courseNames = [...course.matchAll(/課程名稱[：:]\s*([^｜|\n]+)/g)].map((m) => m[1].trim());
  const aiCourse = courseNames.find((c) => /AI|人工智慧|Artificial Intelligence/i.test(c));

  const tools = byType(docs, "subscription_receipt").map((r) => {
    const t = r.text;
    const period = kv(t, "訂閱週期");
    const [s, e] = period ? (period.match(/\d{4}-\d{2}-\d{2}/g) ?? []) : [];
    const billing: "monthly" | "annual" | undefined = /年繳|年訂閱|annual/i.test(t) ? "annual" : /月繳|月訂閱|monthly/i.test(t) ? "monthly" : undefined;
    const start = s ?? date(kv(t, "訂閱日期"));
    return {
      name: (kv(t, "方案") ?? toolLine.split("｜")[0] ?? "").trim(),
      plan: [kv(t, "方案"), kv(t, "家庭共用") ? `家庭共用：${kv(t, "家庭共用")}` : undefined].filter(Boolean).join("；"),
      billing,
      cycleStart: start,
      cycleEnd: e ?? (billing === "annual" && start ? addDays(addMonths(start, 12), -1) : undefined),
      amount: num(kv(t, "金額")),
      purchaser: kv(t, "購買人"),
      source: r.id,
    };
  });

  return {
    applicantName: kv(form, "申請人"),
    birthDate: date(kv(form, "出生日期")),
    applicationDate: date(kv(form, "申請日期")),
    registeredSince: date(kv(house, "遷入日期")),
    school: kv(form, "就讀學校"),
    lowIncome: /是/.test(kv(form, "低收入戶或中低收入戶") ?? ""),
    courseName: aiCourse ?? courseNames[0],
    tools,
    declaredStart: date(kv(form, "訂閱起始日1")),
    reflectionChars: reflections.reduce((n, d) => n + d.text.split("\n").slice(1).join("").replace(/\s/g, "").length, 0),
  };
}

export const courseNamedAI = (name?: string) => !!name && /AI|人工智慧|Artificial Intelligence/i.test(name);

/** Which conditional documents apply, given extracted facts. */
export function requiredDocs(f: CaseFacts): DocTypeId[] {
  const req: DocTypeId[] = [
    "application_form",
    "household_record",
    "student_status",
    "ai_course_proof",
    "subscription_receipt",
    "bank_receipt",
    "usage_reflection",
    "self_checklist",
  ];
  if (f.courseName && !courseNamedAI(f.courseName)) req.push("ai_course_teacher_cert");
  if (f.lowIncome) req.push("low_income_proof");
  return req;
}

/** Months of a tool's cycle that fall fully inside the subsidy period (annual = 以月折算). */
export function eligibleMonths(t: CaseFacts["tools"][number]) {
  return eligibleCycles(t).length;
}
export function eligibleCycles(t: CaseFacts["tools"][number]) {
  const out: { start: string; end: string }[] = [];
  if (!t.cycleStart) return out;
  for (let i = 0; i < 12; i++) {
    const s = addMonths(t.cycleStart, i);
    const e = addDays(addMonths(t.cycleStart, i + 1), -1);
    if (t.cycleEnd && e > t.cycleEnd) break;
    if (s >= SUBSIDY_PERIOD.start && e <= SUBSIDY_PERIOD.end) out.push({ start: s, end: e });
  }
  return out;
}

export function evaluateRules(f: CaseFacts, docs: CaseDocument[]): { rules: RuleResult[]; suggestedAmount?: number } {
  const R: RuleResult[] = [];
  const add = (r: RuleResult) => R.push(r);
  const appDate = f.applicationDate;

  // 年齡
  if (f.birthDate && appDate) {
    const age = ageOn(f.birthDate, appDate);
    add({ id: "age", title: "年齡 18–35 歲（以申請日計）", result: age >= 18 && age <= 35 ? "pass" : "fail", detail: `申請日 ${appDate} 時 ${age} 歲`, citation: CITES.eligibilityAge });
  } else add({ id: "age", title: "年齡 18–35 歲（以申請日計）", result: "unknown", detail: "缺出生日期或申請日期", citation: CITES.eligibilityAge });

  // 設籍
  if (f.registeredSince && appDate) {
    const ok = addMonths(f.registeredSince, 6) <= appDate;
    add({ id: "residence", title: "設籍臺北市滿 6 個月", result: ok ? "pass" : "fail", detail: `遷入日期 ${f.registeredSince}`, citation: CITES.eligibilityAge });
  } else add({ id: "residence", title: "設籍臺北市滿 6 個月", result: "unknown", detail: "戶籍文件無法判讀遷入日期", citation: CITES.eligibilityAge });

  // 學籍
  const stu = byType(docs, "student_status")[0]?.text ?? "";
  add({ id: "student", title: "大專院校學籍或 115 年度應屆畢業", result: /在學|115年|中華民國115/.test(stu) ? "pass" : "unknown", detail: stu ? stu.split("\n")[0] : "未提供", citation: CITES.student });

  // 課程
  if (!f.courseName) add({ id: "course", title: "AI 相關課程修習證明", result: "fail", detail: "未檢附課程修習證明", citation: CITES.course });
  else if (courseNamedAI(f.courseName)) add({ id: "course", title: "AI 相關課程修習證明", result: "pass", detail: `課程「${f.courseName}」名稱含 AI／人工智慧`, citation: CITES.course });
  else
    add({
      id: "course",
      title: "AI 相關課程修習證明",
      result: byType(docs, "ai_course_teacher_cert").length ? "unknown" : "fail",
      detail: `課程「${f.courseName}」名稱未含 AI 字樣，需教師證明書並判斷內容是否涉及 AI`,
      citation: CITES.courseCert,
    });

  // 工具數
  add({ id: "max_tools", title: "最多 2 項 AI 工具", result: f.tools.length <= 2 ? "pass" : "fail", detail: `申請 ${f.tools.length} 項`, citation: CITES.maxTools });

  let amount = 0;
  let amountKnown = true;
  for (const t of f.tools) {
    const name = t.name || "AI 工具";
    // 中國大陸工具
    const prc = PRC_TOOLS.some((p) => name.toLowerCase().includes(p));
    add({ id: `prc_${t.source}`, title: `${name}：非中國大陸開發工具`, result: prc ? "fail" : "pass", detail: prc ? "列於不予補助名單" : "未列於不予補助名單", citation: CITES.prc });
    // 個人版
    const shared = /家庭|family|企業|enterprise|team|business/i.test(t.plan ?? "");
    const personal = /個人|individual/i.test(t.plan ?? "");
    add({
      id: `personal_${t.source}`,
      title: `${name}：個人使用版本`,
      result: shared ? "unknown" : personal ? "pass" : "unknown",
      detail: shared ? `收據顯示「${t.plan}」，是否屬多人共用版本需判斷` : personal ? "收據標示個人方案" : "收據未標示方案類型",
      citation: CITES.personal,
    });
    // 購買人
    add({ id: `purchaser_${t.source}`, title: `${name}：購買人為申請人本人`, result: t.purchaser && t.purchaser === f.applicantName ? "pass" : "unknown", detail: `購買人：${t.purchaser ?? "未載明"}`, citation: CITES.purchaser });

    // 期間
    const months = eligibleMonths(t);
    const conflict = !!(f.declaredStart && t.cycleStart && f.declaredStart !== t.cycleStart);
    if (!t.cycleStart) {
      add({ id: `period_${t.source}`, title: `${name}：訂閱週期在補助期間內`, result: "unknown", detail: "無法判讀訂閱週期", citation: CITES.period });
      amountKnown = false;
    } else if (t.billing === "annual") {
      add({
        id: `period_${t.source}`,
        title: `${name}：年訂閱以月折算之週期在補助期間內`,
        result: conflict || t.cycleStart < SUBSIDY_PERIOD.start ? "unknown" : months >= 1 ? "pass" : "fail",
        detail: `收據訂閱日 ${t.cycleStart}${conflict ? `，申請書填寫 ${f.declaredStart}（不一致）` : ""}；依收據折算可認列 ${months} 個月`,
        citation: CITES.annual,
      });
      if (conflict) amountKnown = false;
      amount += Math.round(((t.amount ?? 0) / 12) * months);
    } else {
      const inside = t.cycleStart >= SUBSIDY_PERIOD.start && !!t.cycleEnd && t.cycleEnd <= SUBSIDY_PERIOD.end;
      add({
        id: `period_${t.source}`,
        title: `${name}：月訂閱週期起訖均在 8/1–10/31`,
        result: conflict ? "unknown" : inside ? "pass" : "fail",
        detail: `${t.cycleStart} ~ ${t.cycleEnd ?? "?"}${conflict ? `；申請書填寫 ${f.declaredStart}（不一致）` : ""}`,
        citation: CITES.monthly,
      });
      if (conflict) amountKnown = false;
      if (inside) amount += t.amount ?? 0;
    }
    add({ id: `month_${t.source}`, title: `${name}：訂閱週期滿 1 個月`, result: months >= 1 ? "pass" : "fail", detail: `可認列 ${months} 個月`, citation: CITES.underMonth });

    // 申請期限
    if (appDate && t.cycleStart) {
      const lastMet = eligibleCycles(t).at(-1)?.end ?? t.cycleEnd ?? appDate;
      const limit = [addMonths(addDays(lastMet, 1), 1), FINAL_DEADLINE].sort()[0];
      add({ id: `deadline_${t.source}`, title: `${name}：於期限內提出申請`, result: appDate <= limit ? "pass" : "fail", detail: `申請日 ${appDate}；期限 ${limit}`, citation: CITES.deadline });
    }
  }

  // 心得字數
  const need = 300 * Math.max(1, f.tools.length);
  add({ id: "reflection", title: `使用心得每項至少 300 字`, result: (f.reflectionChars ?? 0) >= need ? "pass" : "fail", detail: `共 ${f.reflectionChars ?? 0} 字（需 ${need} 字）`, citation: CITES.reflection });

  const cap = f.lowIncome ? 8000 : 4000;
  return { rules: R, suggestedAmount: amountKnown ? Math.min(amount, cap) : undefined };
}
