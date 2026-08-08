import "server-only";
// DOCX -> PDF conversion via LibreOffice headless, plus PDF text extraction
// for the extraction gate. Both are server-only (child_process, fs) and
// deliberately isolated in this one module so the memory-footprint
// tradeoff documented here stays in one place.
//
// MEMORY FOOTPRINT (measured, not assumed): a single `soffice --headless
// --convert-to pdf` conversion of a representative one-page resume .docx
// peaked at ~190MB RSS for the soffice.bin process, for the few seconds
// the conversion runs, then exits. This is a per-request, short-lived
// spike, not a resident cost — CareerOS is a personal, single-user tool
// (see CLAUDE.md: local-first, one operator), so concurrent conversions
// aren't a realistic load pattern. On a 2GB box that also runs Next.js +
// SQLite, a single ~190MB spike has headroom; the real risk was ever
// running MORE THAN ONE soffice instance at once (each spike is additive),
// which convertDocxToPdf below forecloses entirely by serializing every
// conversion through one queue. If this ever needs to run somewhere
// tighter than 2GB, or genuinely concurrent, swap this module for a
// pure-Node renderer — nothing outside this file knows HOW the PDF gets
// made, only that convertDocxToPdf(docx) -> pdf.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);
const CONVERT_TIMEOUT_MS = 30_000;

// Serializes every conversion through a single queue — see the memory
// footprint note above. This is the actual mitigation, not the peak RSS
// of any one conversion.
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(() => undefined, () => undefined);
  return run;
}

export async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  return serialize(async () => {
    const dir = await mkdtemp(join(tmpdir(), "resume-docx-"));
    const docxPath = join(dir, "resume.docx");
    const pdfPath = join(dir, "resume.pdf");
    const profileDir = join(dir, "loprofile");
    try {
      await writeFile(docxPath, docxBuffer);
      await execFileAsync("soffice", [
        "--headless", "--norestore", "--nolockcheck", "--nodefault", "--nofirststartwizard",
        `-env:UserInstallation=file://${profileDir}`,
        "--convert-to", "pdf", "--outdir", dir, docxPath,
      ], { timeout: CONVERT_TIMEOUT_MS });
      return await readFile(pdfPath);
    } catch (e: any) {
      throw new Error(`LibreOffice DOCX->PDF conversion failed: ${e.message ?? e}`);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });
}

export async function extractPdfText(pdfBuffer: Buffer): Promise<{ text: string; numpages: number }> {
  // require(), not import — same reason app/api/extract-pdf/route.ts uses
  // require(): pdf-parse must stay out of the webpack bundle
  // (serverExternalPackages), a static import would pull it in.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfParse = require("pdf-parse");
  const data = await pdfParse(pdfBuffer);
  return { text: (data.text ?? "").trim(), numpages: data.numpages ?? 0 };
}
