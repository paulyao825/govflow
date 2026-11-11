import { after } from "next/server";
import { ocrAndProcess, receiveUpload, type UploadFile } from "@/lib/actions";
import { L, asLang } from "@/lib/i18n";
import { agentSay } from "@/lib/runtime";

export const maxDuration = 300;

const MAX_TOTAL = 4 * 1024 * 1024; // Vercel request body limit is ~4.5 MB
const OK_TYPE = /^(application\/pdf|image\/(png|jpe?g|webp)|text\/plain)$/;

// Officer uploads scanned documents (new application or correction). OCR + workflow run after the response.
export async function POST(req: Request) {
  const form = await req.formData();
  const lang = asLang(form.get("lang"));
  const target = (form.get("caseId") as string) || undefined;
  const raw = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!raw.length) return Response.json({ error: "no files" }, { status: 400 });
  if (raw.length > 12) return Response.json({ error: "max 12 files" }, { status: 400 });
  const total = raw.reduce((n, f) => n + f.size, 0);
  if (total > MAX_TOTAL) return Response.json({ error: "files too large (max 4 MB total)" }, { status: 413 });
  const bad = raw.find((f) => !OK_TYPE.test(f.type) && !/\.(pdf|png|jpe?g|webp|txt)$/i.test(f.name));
  if (bad) return Response.json({ error: `unsupported type: ${bad.name}` }, { status: 415 });

  const files: UploadFile[] = await Promise.all(raw.map(async (f) => ({ name: f.name, mime: f.type, bytes: Buffer.from(await f.arrayBuffer()) })));
  const text = String(form.get("text") ?? "").trim().slice(0, 2000);
  const names = files.map((f) => f.name).join(", ");
  if (text || files.length) await agentSay({ role: "user", kind: "chat", text: `${text || L(lang, "（上傳文件）", "(uploaded documents)")}\n📎 ${names}` });
  try {
    const r = await receiveUpload(files, lang, target);
    if (!r.duplicate) {
      await agentSay({
        kind: "chat",
        caseIds: [r.caseId],
        text: target
          ? L(lang, `收到 ${files.length} 個補件檔案，已附到 ${r.caseId}，我從中斷的地方繼續審查。`, `Got ${files.length} file(s) as a correction for ${r.caseId}. Picking the case up where it stopped.`)
          : L(lang, `收到 ${files.length} 個檔案，已開立案件 ${r.caseId}。我先讀取文件、比對 SOP 與計畫條文，需要你決定的地方會整理在下面。`, `Got ${files.length} file(s) and opened case ${r.caseId}. I'm reading them and checking them against the SOP and programme rules; anything that needs you will show up below.`),
      });
      after(() => ocrAndProcess(r.caseId, files, lang, !!target));
    }
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400 });
  }
}
