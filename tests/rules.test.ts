// Deterministic policy-rule tests (no network, no models).
import assert from "node:assert/strict";
import { test } from "node:test";
import { addMonths, ageOn, eligibleMonths, evaluateRules, extractFacts, requiredDocs, wholeMonths } from "../src/lib/rules";
import { CORRECTIONS, SCENARIOS } from "../src/lib/seed";
import type { CaseDocument, DocTypeId } from "../src/lib/types";

const TYPE: [RegExp, DocTypeId][] = [
  [/檢核表/, "self_checklist"], [/申請書/, "application_form"], [/課程內容證明書/, "ai_course_teacher_cert"],
  [/戶籍|戶口|謄本/, "household_record"], [/在學證明|畢業證書/, "student_status"], [/成績單|成績證明/, "ai_course_proof"],
  [/收據/, "subscription_receipt"], [/領據/, "bank_receipt"], [/心得/, "usage_reflection"],
];
const docs = (key: string, extra: { fileName: string; text: string }[] = []): CaseDocument[] =>
  [...SCENARIOS.find((s) => s.key === key)!.docs, ...extra].map((d, i) => ({
    id: `d${i}`, fileName: d.fileName, text: d.text, sha: String(i), addedAt: 0,
    classifiedAs: TYPE.find(([re]) => re.test(d.text))?.[1] ?? "unknown",
    readable: (d.text.match(/▯/g)?.length ?? 0) <= 5,
  }));
const run = (key: string, extra?: { fileName: string; text: string }[]) => {
  const d = docs(key, extra);
  const f = extractFacts(d);
  return { f, ...evaluateRules(f, d), req: requiredDocs(f), have: new Set(d.filter((x) => x.readable).map((x) => x.classifiedAs)) };
};
const res = (rules: { id: string; result: string }[], prefix: string) => rules.filter((r) => r.id.startsWith(prefix)).map((r) => r.result);

test("date helpers", () => {
  assert.equal(addMonths("2026-08-05", 1), "2026-09-05");
  assert.equal(wholeMonths("2026-08-05", "2026-10-04"), 2);
  assert.equal(ageOn("2001-04-12", "2026-11-03"), 25);
  assert.equal(ageOn("1990-11-04", "2026-11-03"), 35);
  assert.equal(eligibleMonths({ name: "x", cycleStart: "2026-07-28", cycleEnd: "2027-07-27", billing: "annual", source: "s" }), 2);
  assert.equal(eligibleMonths({ name: "x", cycleStart: "2026-10-15", cycleEnd: "2026-11-14", billing: "monthly", source: "s" }), 0);
});

test("Case A: missing AI course proof is detected; everything else passes", () => {
  const r = run("A");
  assert.ok(!r.have.has("ai_course_proof"));
  assert.ok(r.req.includes("ai_course_proof"));
  assert.deepEqual(r.rules.filter((x) => x.result !== "pass").map((x) => x.id), ["course"]);
  assert.equal(r.suggestedAmount, 1300);
});

test("Case A after correction: all rules pass", () => {
  const r = run("A", CORRECTIONS["A-001"]);
  assert.equal(r.f.courseName, "人工智慧導論");
  assert.ok(r.rules.every((x) => x.result === "pass"), JSON.stringify(r.rules.filter((x) => x.result !== "pass")));
});

test("Case B: complete application passes every deterministic rule", () => {
  const r = run("B");
  assert.ok(r.req.every((d) => r.have.has(d)));
  assert.ok(r.rules.every((x) => x.result === "pass"), JSON.stringify(r.rules.filter((x) => x.result !== "pass")));
  assert.equal(r.suggestedAmount, 1300);
});

test("Case C: conflicting start date, shared plan and non-AI course name are not auto-passed", () => {
  const r = run("C");
  assert.equal(r.f.declaredStart, "2026-08-01");
  assert.equal(r.f.tools[0].cycleStart, "2026-07-28");
  assert.deepEqual(res(r.rules, "period_"), ["unknown"]);
  assert.deepEqual(res(r.rules, "personal_"), ["unknown"]);
  assert.equal(r.rules.find((x) => x.id === "course")!.result, "unknown");
  assert.ok(r.req.includes("ai_course_teacher_cert"));
  assert.equal(r.suggestedAmount, undefined, "amount must not be computed while dates conflict");
});

test("Case D: unreadable household record leaves residence unknown (never pass)", () => {
  const r = run("D");
  assert.equal(r.rules.find((x) => x.id === "residence")!.result, "unknown");
});

test("No rule ever approves: results are only pass/fail/unknown", () => {
  for (const k of ["A", "B", "C", "D"]) for (const x of run(k).rules) assert.ok(["pass", "fail", "unknown"].includes(x.result));
});

test("Monthly cycle outside 8/1–10/31 fails; PRC tool fails", () => {
  const d = docs("B").map((x) =>
    x.classifiedAs === "subscription_receipt"
      ? { ...x, text: x.text.replace("方案：Claude Pro", "方案：CapCut Pro").replace("2026-08-10 ~ 2026-10-09", "2026-10-10 ~ 2026-12-09") }
      : x.classifiedAs === "application_form"
        ? { ...x, text: x.text.replace("2026-08-10", "2026-10-10") }
        : x,
  );
  const r = evaluateRules(extractFacts(d), d);
  assert.deepEqual(res(r.rules, "period_"), ["fail"]);
  assert.deepEqual(res(r.rules, "prc_"), ["fail"]);
});
