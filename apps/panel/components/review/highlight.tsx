import type { ReactNode } from "react";

export interface Flag {
  quote: string;
  status: "warn" | "block";
}

/** Wraps each flagged quote found in `text` (case-insensitive) in a highlighted <mark>. */
export function Highlighted({ text, flags }: { text: string; flags: Flag[] }) {
  if (flags.length === 0) return <>{text}</>;
  const lower = text.toLowerCase();
  const ranges: { start: number; end: number; status: Flag["status"] }[] = [];
  for (const flag of flags) {
    const at = lower.indexOf(flag.quote.toLowerCase());
    if (at >= 0) ranges.push({ start: at, end: at + flag.quote.length, status: flag.status });
  }
  ranges.sort((a, b) => a.start - b.start);

  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    parts.push(text.slice(cursor, range.start));
    parts.push(
      <mark
        key={range.start}
        className={`rounded-sm px-0.5 text-ink underline decoration-2 underline-offset-4 ${
          range.status === "block"
            ? "bg-block-bg decoration-block-icon"
            : "bg-flag decoration-flag-line"
        }`}
      >
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  }
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}
