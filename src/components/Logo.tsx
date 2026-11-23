// Finny's mark (option B1, chosen by the owner 23 Nov 2026) and its logotype (Nunito, the app's own typeface).
// Source: docs/diagrams/finny/logo/finny-mark.svg. The gradient ids are per instance so two marks on a page don't clash.
import { useId } from "react";

export function Mark({ size = 32, title }: { size?: number; title?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} style={{ flex: "none", display: "block" }}>
      <defs>
        <linearGradient id={`bg${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f472b6" /><stop offset="1" stopColor="#a78bfa" /></linearGradient>
        <linearGradient id={`gd${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fef3c7" /><stop offset="1" stopColor="#fcd34d" /></linearGradient>
      </defs>
      <rect width="100" height="100" rx="22.5" fill={`url(#bg${id})`} />
      <rect x="31" y="22" width="13" height="56" rx="6.5" fill="#fff" />
      <rect x="31" y="22" width="38" height="13" rx="6.5" fill="#fff" />
      <path d="M38 45 C48 39 58 40 66 47 C58 49 50 52 44 57 Z" fill="#fff" stroke="#fff" strokeWidth="5" strokeLinejoin="round" />
      <circle cx="66" cy="68" r="9" fill={`url(#gd${id})`} stroke="#fff" strokeWidth="2.5" />
    </svg>
  );
}

/** The mark and the word "Finny" side by side. */
export function Lockup({ size = 30 }: { size?: number }) {
  return <span className="fy-lockup" style={{ fontSize: size * 0.62 }}><Mark size={size} /><span>Finny</span></span>;
}
