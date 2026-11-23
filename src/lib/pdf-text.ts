// FINNY-72: open a PDF in the browser with pdf.js and return its text for the statement readers. The file and its
// password stay in this tab: pdf.js runs in a worker served by Finny, nothing is uploaded, the password isn't kept.
import type { PageText } from "./statement-rule.ts";
import { pageText } from "./pdf-items.ts";

export class PdfLocked extends Error { constructor(public wrong: boolean) { super(wrong ? "That password didn't open it. Try again." : "This PDF is locked."); } }

let worker: Worker | null = null;
export async function readPdfText(bytes: ArrayBuffer, password?: string): Promise<PageText[]> {
  const pdfjs = await import("pdfjs-dist");
  if (!worker) {
    worker = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
    pdfjs.GlobalWorkerOptions.workerPort = worker;
  }
  // pdf.js hands the bytes to its worker, so it gets a copy each time (a wrong password means reading again).
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)), password, verbosity: 0 });
  try {
    const doc = await task.promise;
    const pages: PageText[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      pages.push(pageText(tc.items as never, vp.width, vp.height));
    }
    return pages;
  } catch (e) {
    const err = e as { name?: string; code?: number };
    if (err?.name === "PasswordException") throw new PdfLocked(err.code === 2);
    throw new Error("This file isn't a PDF Finny can open.");
  } finally {
    await task.destroy();
  }
}

/** The file's SHA-256, so the same statement isn't saved twice. */
export async function fingerprint(bytes: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
