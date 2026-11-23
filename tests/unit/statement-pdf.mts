// Test helper: reads a PDF with pdf.js (the legacy build runs in Node) into the reader's pages.
import { readFileSync } from "node:fs";
import { pageText } from "../../src/lib/pdf-items.ts";
import type { PageText } from "../../src/lib/statement-rule.ts";

export async function pdfPages(file: string, password?: string): Promise<PageText[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), password, verbosity: 0 });
  const doc = await task.promise;
  const pages: PageText[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    pages.push(pageText(tc.items as never, vp.width, vp.height));
  }
  await task.destroy();
  return pages;
}
