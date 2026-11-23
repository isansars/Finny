// Writes the made-up workbooks (tests/fixtures/books-fixture.mjs) as real .xlsx files for the e2e suite.
//   node tests/fixtures/make-workbooks.mjs <dir>  →  <dir>/Pengeluaran-contoh.xlsx, <dir>/Wealth-contoh.xlsx
import writeExcelFile from "write-excel-file/node";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { BOOKS, WEALTH } from "./books-fixture.mjs";

const cell = (v) => (v instanceof Date ? { value: v, type: Date, format: "yyyy-mm-dd" } : v ?? null);
const sheets = (wb) => wb.map((s) => ({ sheet: s.sheet, data: (s.data.length ? s.data : [[]]).map((r) => (r.length ? r.map(cell) : [null])) }));
export async function makeWorkbooks(dir) {
  mkdirSync(dir, { recursive: true });
  const books = path.join(dir, "Pengeluaran-contoh.xlsx"), wealth = path.join(dir, "Wealth-contoh.xlsx");
  await writeExcelFile(sheets(BOOKS)).toFile(books);
  await writeExcelFile(sheets(WEALTH)).toFile(wealth);
  return { books, wealth };
}
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) console.log(await makeWorkbooks(process.argv[2] ?? "qa-fixtures"));
