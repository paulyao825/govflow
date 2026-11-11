import { after } from "next/server";
import { processInBackground, receiveApplication } from "@/lib/actions";
import { asLang } from "@/lib/i18n";

export const maxDuration = 300;

// "Overnight mail" arrives: several applications land in the queue; each one triggers the agent.
// Nobody has to type a command.
export async function POST(req: Request) {
  const { scenarios = ["A", "B", "C"], lang: l } = await req.json().catch(() => ({}));
  const lang = asLang(l);
  after(async () => {
    for (const s of scenarios as string[]) {
      const r = await receiveApplication(s, lang);
      if (r.caseId && !r.duplicate) await processInBackground(r.caseId, lang === "zh" ? "事件觸發：收件匣新申請" : "Event: new application in the inbox", lang);
    }
  });
  return Response.json({ ok: true });
}
