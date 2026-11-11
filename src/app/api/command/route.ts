import { handleCommand } from "@/lib/agent";

export const maxDuration = 300;

export async function POST(req: Request) {
  const { text } = await req.json();
  if (!text || typeof text !== "string" || text.length > 2000) return Response.json({ error: "bad request" }, { status: 400 });
  await handleCommand(text.trim());
  return Response.json({ ok: true });
}
