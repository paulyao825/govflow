import { after } from "next/server";
import { processInBackground, receiveApplication } from "@/lib/actions";

export const maxDuration = 300;

// Incoming-application event (in production: scanner folder, mailroom, online form webhook).
export async function POST(req: Request) {
  const { scenario } = await req.json();
  const r = await receiveApplication(String(scenario));
  if (r.caseId && !r.duplicate) after(() => processInBackground(r.caseId!, "事件觸發：新申請進件"));
  return Response.json(r);
}
