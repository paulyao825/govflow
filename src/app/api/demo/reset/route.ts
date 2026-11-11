import { resetDemo } from "@/lib/actions";

export async function POST() {
  await resetDemo();
  return Response.json({ ok: true });
}
