import { resetDemo } from "@/lib/actions";
import { asLang } from "@/lib/i18n";

export async function POST(req: Request) {
  const { lang } = await req.json().catch(() => ({}));
  await resetDemo(asLang(lang));
  return Response.json({ ok: true });
}
