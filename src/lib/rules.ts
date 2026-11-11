// Deterministic parsing + eligibility rules. Pure functions (no I/O) so they are unit-testable.
import type { CaseDocument, CaseFacts, DocTypeId, RuleResult } from "./types";
import { L, type Lang } from "./i18n";
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
      // short canonical name ("ChatGPT Plus"), the full plan text stays in `plan`
      name: (kv(t, "方案") ?? toolLine.split("｜")[0] ?? "").replace(/[（(].*$/, "").trim(),
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

export function evaluateRules(f: CaseFacts, docs: CaseDocument[], lang: Lang = "zh"): { rules: RuleResult[]; suggestedAmount?: number } {
  const R: RuleResult[] = [];
  const add = (r: RuleResult) => R.push(r);
  const t_ = (zh: string, en: string) => L(lang, zh, en);
  const appDate = f.applicationDate;

  // 年齡
  const ageTitle = t_("年齡 18–35 歲（以申請日計）", "Age 18–35 on application date");
  if (f.birthDate && appDate) {
    const age = ageOn(f.birthDate, appDate);
    add({ id: "age", title: ageTitle, result: age >= 18 && age <= 35 ? "pass" : "fail", detail: t_(`申請日 ${appDate} 時 ${age} 歲`, `${age} years old on ${appDate}`), citation: CITES.eligibilityAge });
  } else add({ id: "age", title: ageTitle, result: "unknown", detail: t_("缺出生日期或申請日期", "Birth date or application date missing"), citation: CITES.eligibilityAge });

  // 設籍
  const resTitle = t_("設籍臺北市滿 6 個月", "Registered in Taipei ≥ 6 months");
  if (f.registeredSince && appDate) {
    const ok = addMonths(f.registeredSince, 6) <= appDate;
    add({ id: "residence", title: resTitle, result: ok ? "pass" : "fail", detail: t_(`遷入日期 ${f.registeredSince}`, `Moved in ${f.registeredSince}`), citation: CITES.eligibilityAge });
  } else add({ id: "residence", title: resTitle, result: "unknown", detail: t_("戶籍文件無法判讀遷入日期", "Move-in date unreadable on household record"), citation: CITES.eligibilityAge });

  // 學籍
  const stu = byType(docs, "student_status")[0]?.text ?? "";
  add({ id: "student", title: t_("大專院校學籍或 115 年度應屆畢業", "Enrolled student or 2026 graduate"), result: /在學|115年|中華民國115/.test(stu) ? "pass" : "unknown", detail: stu ? t_(stu.split("\n")[0], /畢業/.test(stu) ? "Graduation certificate on file" : "Enrolment certificate on file") : t_("未提供", "Not provided"), citation: CITES.student });

  // 課程
  const courseTitle = t_("AI 相關課程修習證明", "Proof of an AI-related course");
  if (!f.courseName) add({ id: "course", title: courseTitle, result: "fail", detail: t_("未檢附課程修習證明", "No course transcript submitted"), citation: CITES.course });
  else if (courseNamedAI(f.courseName)) add({ id: "course", title: courseTitle, result: "pass", detail: t_(`課程「${f.courseName}」名稱含 AI／人工智慧`, `Course "${f.courseName}" is named as AI`), citation: CITES.course });
  else
    add({
      id: "course",
      title: courseTitle,
      result: byType(docs, "ai_course_teacher_cert").length ? "unknown" : "fail",
      detail: t_(`課程「${f.courseName}」名稱未含 AI 字樣，需教師證明書並判斷內容是否涉及 AI`, `Course "${f.courseName}" is not named as AI — needs an instructor letter and a judgment on whether it covers AI`),
      citation: CITES.courseCert,
    });

  // 工具數
  add({ id: "max_tools", title: t_("最多 2 項 AI 工具", "At most 2 AI tools"), result: f.tools.length <= 2 ? "pass" : "fail", detail: t_(`申請 ${f.tools.length} 項`, `${f.tools.length} claimed`), citation: CITES.maxTools });

  let amount = 0;
  let amountKnown = true;
  for (const t of f.tools) {
    const name = t.name || t_("AI 工具", "AI tool");
    const prc = PRC_TOOLS.some((p) => name.toLowerCase().includes(p));
    add({ id: `prc_${t.source}`, title: t_(`${name}：非中國大陸開發工具`, `${name}: not a PRC-developed tool`), result: prc ? "fail" : "pass", detail: prc ? t_("列於不予補助名單", "On the excluded list") : t_("未列於不予補助名單", "Not on the excluded list"), citation: CITES.prc });
    const shared = /家庭|family|企業|enterprise|team|business/i.test(t.plan ?? "");
    const personal = /個人|individual/i.test(t.plan ?? "");
    add({
      id: `personal_${t.source}`,
      title: t_(`${name}：個人使用版本`, `${name}: personal plan`),
      result: shared ? "unknown" : personal ? "pass" : "unknown",
      detail: shared ? t_(`收據顯示「${t.plan}」，是否屬多人共用版本需判斷`, "Receipt mentions family sharing / multi-user use — needs judgment on whether this counts as a shared plan") : personal ? t_("收據標示個人方案", "Receipt says individual plan") : t_("收據未標示方案類型", "Plan type not stated"),
      citation: CITES.personal,
    });
    add({ id: `purchaser_${t.source}`, title: t_(`${name}：購買人為申請人本人`, `${name}: purchased by the applicant`), result: t.purchaser && t.purchaser === f.applicantName ? "pass" : "unknown", detail: t_(`購買人：${t.purchaser ?? "未載明"}`, `Purchaser: ${t.purchaser ?? "not stated"}`), citation: CITES.purchaser });

    const months = eligibleMonths(t);
    const conflict = !!(f.declaredStart && t.cycleStart && f.declaredStart !== t.cycleStart);
    if (!t.cycleStart) {
      add({ id: `period_${t.source}`, title: t_(`${name}：訂閱週期在補助期間內`, `${name}: billing cycle inside Aug 1 – Oct 31`), result: "unknown", detail: t_("無法判讀訂閱週期", "Billing cycle unreadable"), citation: CITES.period });
      amountKnown = false;
    } else if (t.billing === "annual") {
      add({
        id: `period_${t.source}`,
        title: t_(`${name}：年訂閱以月折算之週期在補助期間內`, `${name}: annual plan, pro-rated months inside the period`),
        result: conflict || t.cycleStart < SUBSIDY_PERIOD.start ? "unknown" : months >= 1 ? "pass" : "fail",
        detail: t_(
          `收據訂閱日 ${t.cycleStart}${conflict ? `，申請書填寫 ${f.declaredStart}（不一致）` : ""}；依收據折算可認列 ${months} 個月`,
          `Receipt date ${t.cycleStart}${conflict ? `, form says ${f.declaredStart} (conflict)` : ""}; ${months} eligible month(s) per receipt`,
        ),
        citation: CITES.annual,
      });
      if (conflict) amountKnown = false;
      amount += Math.round(((t.amount ?? 0) / 12) * months);
    } else {
      const inside = t.cycleStart >= SUBSIDY_PERIOD.start && !!t.cycleEnd && t.cycleEnd <= SUBSIDY_PERIOD.end;
      add({
        id: `period_${t.source}`,
        title: t_(`${name}：月訂閱週期起訖均在 8/1–10/31`, `${name}: monthly cycle starts and ends within Aug 1 – Oct 31`),
        result: conflict ? "unknown" : inside ? "pass" : "fail",
        detail: `${t.cycleStart} ~ ${t.cycleEnd ?? "?"}${conflict ? t_(`；申請書填寫 ${f.declaredStart}（不一致）`, `; form says ${f.declaredStart} (conflict)`) : ""}`,
        citation: CITES.monthly,
      });
      if (conflict) amountKnown = false;
      if (inside) amount += t.amount ?? 0;
    }
    add({ id: `month_${t.source}`, title: t_(`${name}：訂閱週期滿 1 個月`, `${name}: at least one full month`), result: months >= 1 ? "pass" : "fail", detail: t_(`可認列 ${months} 個月`, `${months} eligible month(s)`), citation: CITES.underMonth });

    if (appDate && t.cycleStart) {
      const lastMet = eligibleCycles(t).at(-1)?.end ?? t.cycleEnd ?? appDate;
      const limit = [addMonths(addDays(lastMet, 1), 1), FINAL_DEADLINE].sort()[0];
      add({ id: `deadline_${t.source}`, title: t_(`${name}：於期限內提出申請`, `${name}: applied before the deadline`), result: appDate <= limit ? "pass" : "fail", detail: t_(`申請日 ${appDate}；期限 ${limit}`, `Applied ${appDate}; deadline ${limit}`), citation: CITES.deadline });
    }
  }

  const need = 300 * Math.max(1, f.tools.length);
  add({ id: "reflection", title: t_("使用心得每項至少 300 字", "Usage essay ≥ 300 characters per tool"), result: (f.reflectionChars ?? 0) >= need ? "pass" : "fail", detail: t_(`共 ${f.reflectionChars ?? 0} 字（需 ${need} 字）`, `${f.reflectionChars ?? 0} characters (needs ${need})`), citation: CITES.reflection });

  const cap = f.lowIncome ? 8000 : 4000;
  return { rules: R, suggestedAmount: amountKnown ? Math.min(amount, cap) : undefined };
}
