import { after } from "next/server";
import { processInBackground, receiveCorrection } from "@/lib/actions";
import { asLang } from "@/lib/i18n";

export const maxDuration = 300;

// Applicant's correction documents arrive (synthetic) → resume the case automatically.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { lang: l } = await req.json().catch(() => ({}));
    const lang = asLang(l);
    const ok = await receiveCorrection(id, undefined, lang);
    if (ok) after(() => processInBackground(id, lang === "zh" ? "事件觸發：申請人補件到達" : "Event: applicant correction arrived", lang));
    return Response.json({ ok });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400 });
  }
}
