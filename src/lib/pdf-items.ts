// FINNY-72: pdf.js text content → the statement reader's pages (shared by the browser and the tests). Pure.
import type { PageText } from "./statement-rule.ts";

type PdfItem = { str?: string; transform?: number[]; width?: number; height?: number };
/** y grows downwards (top of the page = 0), like reading. */
export function pageText(items: PdfItem[], width: number, height: number): PageText {
  return {
    w: width, h: height,
    items: items.filter((i) => typeof i.str === "string" && i.transform).map((i) => ({
      s: i.str!, x: i.transform![4], y: height - i.transform![5], w: i.width ?? 0, h: i.height || Math.abs(i.transform![3]) || 8,
    })),
  };
}
