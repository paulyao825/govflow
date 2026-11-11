import { handleCommand } from "@/lib/agent";
import { asLang } from "@/lib/i18n";

export const maxDuration = 300;

export async function POST(req: Request) {
  const { text, lang } = await req.json();
  if (!text || typeof text !== "string" || text.length > 2000) return Response.json({ error: "bad request" }, { status: 400 });
  await handleCommand(text.trim(), asLang(lang));
  return Response.json({ ok: true });
}
