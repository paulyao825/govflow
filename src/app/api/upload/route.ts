import { unzipSync } from "fflate";
import { after } from "next/server";
import { ocrAndProcess, receiveUpload, type UploadFile } from "@/lib/actions";
import { asLang, bi } from "@/lib/i18n";
import { agentSay } from "@/lib/runtime";

export const maxDuration = 300;

const MAX_TOTAL = 4 * 1024 * 1024; // Vercel request body limit is ~4.5 MB
const OK_TYPE = /^(application\/pdf|image\/(png|jpe?g|webp)|text\/plain)$/;
const OK_EXT = /\.(pdf|png|jpe?g|webp|txt)$/i;
const IS_ZIP = (f: File) => /zip/.test(f.type) || /\.zip$/i.test(f.name);
const MIME: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", txt: "text/plain" };
const MAX_FILES = 20;
const MAX_UNZIPPED = 15 * 1024 * 1024;

/** macOS zips store UTF-8 names without the UTF-8 flag, so they decode as latin1: recover them. */
function fixName(n: string) {
  if (/[\u0080-\u00ff]/.test(n) && !/[\u0100-\uffff]/.test(n)) {
    const u = Buffer.from(n, "latin1").toString("utf8");
    if (!u.includes("\ufffd")) n = u;
  }
  return n.normalize("NFC");
}

/** Unpack ZIPs (e.g. a whole applicant folder); keep only supported documents, skip macOS metadata. */
async function expand(raw: File[]): Promise<UploadFile[] | { error: string }> {
  const out: UploadFile[] = [];
  let unzipped = 0;
  for (const f of raw) {
    const bytes = Buffer.from(await f.arrayBuffer());
    if (!IS_ZIP(f)) {
      if (!OK_TYPE.test(f.type) && !OK_EXT.test(f.name)) return { error: `unsupported type: ${f.name}` };
      out.push({ name: f.name, mime: f.type, bytes });
      continue;
    }
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(new Uint8Array(bytes), { filter: (e) => OK_EXT.test(e.name) && !/(^|\/)(__MACOSX|\.)/.test(e.name) && e.originalSize < 8 * 1024 * 1024 });
    } catch {
      return { error: `could not read zip: ${f.name}` };
    }
    for (const [path, data] of Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))) {
      unzipped += data.length;
      if (unzipped > MAX_UNZIPPED) return { error: "zip contents too large (max 15 MB)" };
      const name = fixName(path.split("/").pop()!);
      out.push({ name, mime: MIME[name.split(".").pop()!.toLowerCase()] ?? "application/octet-stream", bytes: Buffer.from(data) });
    }
  }
  if (!out.length) return { error: "no PDF / image / text files found" };
  if (out.length > MAX_FILES) return { error: `max ${MAX_FILES} documents` };
  return out;
}

// Officer uploads scanned documents (new application or correction). OCR + workflow run after the response.
export async function POST(req: Request) {
  const form = await req.formData();
  const lang = asLang(form.get("lang"));
  const target = (form.get("caseId") as string) || undefined;
  const raw = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!raw.length) return Response.json({ error: "no files" }, { status: 400 });
  const total = raw.reduce((n, f) => n + f.size, 0);
  if (total > MAX_TOTAL) return Response.json({ error: "files too large (max 4 MB total)" }, { status: 413 });
  const expanded = await expand(raw);
  if ("error" in expanded) return Response.json({ error: expanded.error }, { status: 415 });
  const files = expanded;
  const text = String(form.get("text") ?? "").trim().slice(0, 2000);
  const names = files.map((f) => f.name).join(", ");
  if (text || files.length) await agentSay({ role: "user", kind: "chat", text: `${text || "📎"}\n📎 ${names}` });
  try {
    const r = await receiveUpload(files, lang, target);
    if (!r.duplicate) {
      await agentSay({
        kind: "chat",
        caseIds: [r.caseId],
        text: target
          ? bi(`收到 ${files.length} 個補件檔案，已附到 ${r.caseId}，我從中斷的地方繼續審查。`, `Got ${files.length} file(s) as a correction for ${r.caseId}. Picking the case up where it stopped.`)
          : bi(`收到 ${files.length} 個檔案，已開立案件 ${r.caseId}。我先讀取文件、比對 SOP 與計畫條文，需要你決定的地方會整理在下面。`, `Got ${files.length} file(s) and opened case ${r.caseId}. I'm reading them and checking them against the SOP and programme rules; anything that needs you will show up below.`),
      });
      after(() => ocrAndProcess(r.caseId, files, lang, !!target, r.token));
    }
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400 });
  }
}
