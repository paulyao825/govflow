import "server-only";
import OpenAI from "openai";

// Language model = writer + conversational orchestrator. It never makes eligibility decisions.
// When OPENAI_API_KEY is missing or the call fails, callers fall back to clearly-labelled templates.

// GOVFLOW_OPENAI_API_KEY wins over OPENAI_API_KEY so a stale key exported in the shell can't shadow .env.local
const apiKey = () => process.env.GOVFLOW_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
export const llmMode = (): "openai" | "fallback" => (apiKey() ? "openai" : "fallback");
export const LLM_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";

let _client: OpenAI | null = null;
export function openai() {
  _client ??= new OpenAI({ apiKey: apiKey(), timeout: 45_000, maxRetries: 1 });
  return _client;
}

const WRITER_SYSTEM = `你是臺北市政府青年局承辦人員的公文撰寫助理。
- 一律使用正式、精簡的臺灣公文繁體中文。
- 只能使用使用者提供的「結構化案件事實」與「官方條文引用」，不得自行增加法規、條件或承諾。
- 不得表示案件已核准或駁回；所有內容都是「草稿」，需經承辦人核可。
- 不要使用 Markdown 標題符號，可用「一、二、三」條列。`;

export async function writeDraft(task: string, facts: unknown): Promise<{ text: string; source: "llm" | "template" } | null> {
  if (llmMode() === "fallback") return null;
  try {
    const r = await openai().chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: "system", content: WRITER_SYSTEM },
        { role: "user", content: `${task}\n\n<structured_case_facts>\n${JSON.stringify(facts, null, 2)}\n</structured_case_facts>` },
      ],
    });
    const text = r.choices[0]?.message?.content?.trim();
    return text ? { text, source: "llm" } : null;
  } catch (e) {
    console.error("[llm] draft failed", e);
    return null;
  }
}
