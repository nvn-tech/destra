"use client";

import { CalendarClock, Check, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "../ui";

export interface ScheduleOption {
  /** Null when scheduling is possible; otherwise why not (approval still works). */
  unavailableReason: { text: string; href?: string; linkText?: string } | null;
  value: string;
  onChange: (value: string) => void;
}

export function ApprovalBar({
  blockedReason,
  attested,
  onAttest,
  busy,
  schedule,
  onApprove,
  onReject,
}: {
  /** When set, approval is impossible and this explains why. */
  blockedReason: { text: string; href?: string; linkText?: string } | null;
  attested: boolean;
  onAttest: (value: boolean) => void;
  busy: boolean;
  schedule: ScheduleOption;
  onApprove: (withSchedule: boolean) => void;
  onReject: (comment: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState("");
  const canSchedule = !schedule.unavailableReason;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (rejecting) {
    return (
      <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-line bg-card/95 px-4 py-4 shadow-overlay backdrop-blur lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-w-64 flex-1 flex-col gap-1">
            <span className="text-xs font-semibold text-ink-2">Motivo da recusa (opcional)</span>
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="h-10 rounded-control border border-line px-3 text-sm focus:border-focus focus:outline-none"
              placeholder="Ex.: tema já publicado"
            />
          </label>
          <Button variant="ghost" onClick={() => setRejecting(false)}>
            Cancelar
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => onReject(comment)}>
            <X aria-hidden className="size-4" />
            Recusar este post
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-line bg-card/95 px-4 py-4 shadow-overlay backdrop-blur lg:-mx-8 lg:px-8">
      {blockedReason ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-ink-2">
            {blockedReason.text}{" "}
            {blockedReason.href && (
              <Link href={blockedReason.href} className="font-semibold text-teal underline">
                {blockedReason.linkText}
              </Link>
            )}
          </p>
          <Button variant="danger" onClick={() => setRejecting(true)} disabled={busy}>
            Recusar
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="flex items-start gap-2.5 text-sm text-ink lg:max-w-xs">
            <input
              type="checkbox"
              checked={attested}
              onChange={(e) => onAttest(e.target.checked)}
              className="mt-0.5 size-[18px] shrink-0 accent-pine"
            />
            Revisei este conteúdo e sou responsável pela publicação.
          </label>

          <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
            {canSchedule ? (
              <label className="flex items-center gap-2 text-sm text-ink-2">
                <CalendarClock aria-hidden className="size-4" />
                <span className="sr-only">Data e horário da publicação</span>
                <input
                  type="datetime-local"
                  value={schedule.value}
                  onChange={(e) => schedule.onChange(e.target.value)}
                  className="h-10 rounded-control border border-line px-2 text-sm text-ink focus:border-focus focus:outline-none"
                  aria-describedby="schedule-tz"
                />
                <span id="schedule-tz" className="text-xs">
                  {timeZone}
                </span>
              </label>
            ) : (
              <span className="text-xs text-ink-2">
                {schedule.unavailableReason?.text}{" "}
                {schedule.unavailableReason?.href && (
                  <Link
                    href={schedule.unavailableReason.href}
                    className="font-semibold text-teal underline"
                  >
                    {schedule.unavailableReason.linkText}
                  </Link>
                )}
              </span>
            )}
            <Button variant="danger" onClick={() => setRejecting(true)} disabled={busy}>
              Recusar
            </Button>
            {canSchedule && (
              <Button
                variant="secondary"
                onClick={() => onApprove(false)}
                disabled={busy || !attested}
              >
                Aprovar sem agendar
              </Button>
            )}
            <Button
              onClick={() => onApprove(canSchedule)}
              disabled={busy || !attested || (canSchedule && !schedule.value)}
            >
              <Check aria-hidden className="size-4" />
              {canSchedule ? "Aprovar e agendar" : "Aprovar esta variante"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
