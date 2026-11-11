import { after } from "next/server";
import { processInBackground, receiveApplication } from "@/lib/actions";
import { asLang } from "@/lib/i18n";

export const maxDuration = 300;

// Incoming-application event (in production: scanner folder, mailroom, online form webhook).
export async function POST(req: Request) {
  const { scenario, lang: l } = await req.json();
  const lang = asLang(l);
  const r = await receiveApplication(String(scenario), lang);
  if (r.caseId && !r.duplicate) after(() => processInBackground(r.caseId!, lang === "zh" ? "事件觸發：新申請進件" : "Event: new application received", lang));
  return Response.json(r);
}
