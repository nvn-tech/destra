import type { QueueItem } from "@/lib/api";
import { formatLabel, formatSlot } from "@/lib/format";
import { type Status, StatusBadge } from "../ui";

/** Best status among an item's variants: what the doctor can approve right away. */
export function bestStatus(item: QueueItem): Status {
  const statuses = item.variants.map((v) => v.complianceStatus);
  if (statuses.includes("pass")) return "pass";
  if (statuses.includes("warn")) return "warn";
  if (statuses.includes("block")) return "block";
  return "pending";
}

export function QueueList({
  items,
  selectedId,
  timeZone,
  onSelect,
}: {
  items: QueueItem[];
  selectedId: string | null;
  timeZone: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav aria-label="Posts aguardando revisão">
      <ul className="space-y-2">
        {items.map((item) => {
          const selected = item.id === selectedId;
          const format = item.variants[0]?.format ?? "";
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={selected ? "true" : undefined}
                className={`w-full rounded-panel border bg-card p-4 text-left shadow-card transition-colors ${
                  selected ? "border-pine ring-1 ring-pine" : "border-line hover:border-line-strong"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink-2">
                    {formatLabel(format)} · {item.variants.length}{" "}
                    {item.variants.length === 1 ? "variante" : "variantes"}
                  </span>
                  <StatusBadge status={bestStatus(item)} />
                </div>
                <p className="mt-2 font-semibold leading-snug text-ink">
                  {item.title ?? "Sem título"}
                </p>
                <p className="mt-1 text-xs text-ink-2">
                  Sugerido: {formatSlot(item.suggestedSlot, timeZone)}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
