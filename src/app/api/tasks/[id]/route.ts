import { after } from "next/server";
import { decideTask } from "@/lib/actions";
import { redraftTask } from "@/lib/pipeline";
import { asLang } from "@/lib/i18n";

export const maxDuration = 120;

// Human decision endpoint. In a real deployment this sits behind the agency's SSO and records
// the officer's identity; the demo records the decision as "承辦人（展示帳號）".
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { action, note, draft, lang: l } = await req.json();
  const lang = asLang(l);
  if (action !== "approve" && action !== "request_changes") return Response.json({ error: "bad action" }, { status: 400 });
  try {
    const r = await decideTask(id, action, note, draft, lang);
    if (r.redraft) after(() => redraftTask(id, note || (lang === "zh" ? "請修改" : "please revise"), lang));
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 409 });
  }
}
