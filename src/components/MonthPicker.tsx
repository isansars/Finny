"use client";
// FINNY-206: jump to any month, as approved in "v0.22.1 · Design notes (Jump to any month, approved)". Tap the month name
// for "Pick a month" (the year with ‹ ›, twelve months, This month); ‹ › beside it still step one month at a time.
import { useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "./store";
import { Sheet } from "./ui";
import { monthLabel, shiftMonth, todayIn } from "@/lib/dates";

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const shortLabel = (m: string) => `${SHORT[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;

let monthsOnce: Promise<string[]> | null = null;
function useMonthsWithData(open: boolean) {
  const [months, setMonths] = useState<string[] | null>(null);
  useEffect(() => {
    if (!open) return;
    monthsOnce ??= api<{ months: string[] }>("transactions/months").then((r) => r.months).catch(() => { monthsOnce = null; return []; });
    let live = true; monthsOnce.then((m) => { if (live) setMonths(m); });
    return () => { live = false; };
  }, [open]);
  return months;
}

export function MonthSheet({ month, onPick, onClose }: { month: string; onPick: (m: string) => void; onClose: () => void }) {
  const now = todayIn().slice(0, 7), thisYear = Number(now.slice(0, 4));
  const months = useMonthsWithData(true);
  const firstYear = Math.min(Number(month.slice(0, 4)), months?.length ? Number(months[0].slice(0, 4)) : thisYear);
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const has = new Set(months ?? []);
  const pick = (m: string) => { onPick(m); onClose(); };
  return (
    <Sheet title="Pick a month" onClose={onClose}>
      <div className="fy-mp-year">
        <button type="button" className="fy-btn small" aria-label="Previous year" disabled={year <= firstYear} onClick={() => setYear(year - 1)}><ChevronLeft size={18} /></button>
        <b aria-live="polite">{year}</b>
        <button type="button" className="fy-btn small" aria-label="Next year" disabled={year >= thisYear} onClick={() => setYear(year + 1)}><ChevronRight size={18} /></button>
      </div>
      <div className="fy-mp-grid" role="group" aria-label={`Months of ${year}`}>
        {SHORT.map((s, i) => {
          const m = `${year}-${String(i + 1).padStart(2, "0")}`, later = m > now, on = m === month, dot = has.has(m);
          return (
            <button key={m} type="button" className={`fy-mp-m ${on ? "on" : ""} ${dot ? "dot" : ""}`} disabled={later} aria-pressed={on}
              aria-label={`${LONG[i]} ${year}${dot ? ", has transactions" : ""}`} onClick={() => pick(m)}>{s}</button>
          );
        })}
      </div>
      <div className="fy-sheet-foot"><button type="button" className="fy-btn block" onClick={() => pick(now)}>This month</button></div>
      <p className="fy-hint" style={{ textAlign: "center", margin: "10px 0 0" }}>A dot marks months with transactions. Months after this one are greyed out.</p>
    </Sheet>
  );
}

/** ‹ [Nov 2026 ▾] › : the pill on Budget and Reports (and ‹ › on Home, whose title opens the sheet). */
export function MonthNav({ month, setMonth, label = true }: { month: string; setMonth: (m: string) => void; label?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="fy-month" aria-label="Month">
        <button type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={18} /></button>
        {label && <button type="button" className="fy-mp-pill" aria-label={`${monthLabel(month)}, pick a month`} aria-haspopup="dialog" onClick={() => setOpen(true)}>{shortLabel(month)}<ChevronDown size={14} /></button>}
        <button type="button" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={18} /></button>
      </div>
      {open && <MonthSheet month={month} onPick={setMonth} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Home's title: "November 2026 ▾", which opens the sheet. */
export function MonthTitle({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <h1><button type="button" className="fy-month-title" aria-haspopup="dialog" aria-label={`${monthLabel(month)}, pick a month`} onClick={() => setOpen(true)}>
        <span data-testid="month">{monthLabel(month)}</span><span className="chev" aria-hidden="true"><ChevronDown size={16} /></span></button></h1>
      {open && <MonthSheet month={month} onPick={setMonth} onClose={() => setOpen(false)} />}
    </>
  );
}
