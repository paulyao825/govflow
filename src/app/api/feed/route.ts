import { jevMode } from "@/lib/jev";
import { llmMode, LLM_MODEL } from "@/lib/llm";
import { db, readFeed } from "@/lib/store";
import { connection } from "next/server";

export async function GET() {
  await connection();
  const feed = await readFeed();
  return Response.json({ ...feed, meta: { jev: jevMode(), llm: llmMode(), llmModel: LLM_MODEL, store: db.kind } });
}
