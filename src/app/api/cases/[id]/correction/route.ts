import { after } from "next/server";
import { processInBackground, receiveCorrection } from "@/lib/actions";

export const maxDuration = 300;

// Applicant's correction documents arrive (synthetic) → resume the case automatically.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const ok = await receiveCorrection(id);
    if (ok) after(() => processInBackground(id, "事件觸發：申請人補件到達"));
    return Response.json({ ok });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400 });
  }
}
