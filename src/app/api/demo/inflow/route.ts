import { after } from "next/server";
import { processInBackground, receiveApplication } from "@/lib/actions";

export const maxDuration = 300;

// "Overnight mail" arrives: several applications land in the queue; each one triggers the agent.
// Nobody has to type a command.
export async function POST(req: Request) {
  const { scenarios = ["A", "B", "C"] } = await req.json().catch(() => ({}));
  after(async () => {
    for (const s of scenarios as string[]) {
      const r = await receiveApplication(s);
      if (r.caseId && !r.duplicate) await processInBackground(r.caseId, "事件觸發：收件匣新申請");
    }
  });
  return Response.json({ ok: true });
}
