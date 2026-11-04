"use client";

import { Check, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "../ui";

export function ApprovalBar({
  blockedReason,
  attested,
  onAttest,
  busy,
  onApprove,
  onReject,
}: {
  /** When set, approval is impossible and this explains why. */
  blockedReason: { text: string; href?: string; linkText?: string } | null;
  attested: boolean;
  onAttest: (value: boolean) => void;
  busy: boolean;
  onApprove: () => void;
  onReject: (comment: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState("");

  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-line bg-card/95 px-4 py-4 shadow-overlay backdrop-blur lg:-mx-8 lg:px-8">
      {rejecting ? (
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
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4">
          {blockedReason ? (
            <p className="text-sm text-ink-2">
              {blockedReason.text}{" "}
              {blockedReason.href && (
                <Link href={blockedReason.href} className="font-semibold text-teal underline">
                  {blockedReason.linkText}
                </Link>
              )}
            </p>
          ) : (
            <label className="flex max-w-xl items-start gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={attested}
                onChange={(e) => onAttest(e.target.checked)}
                className="mt-0.5 size-[18px] shrink-0 accent-pine"
              />
              Revisei este conteúdo e sou responsável pela publicação.
            </label>
          )}
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => setRejecting(true)} disabled={busy}>
              Recusar
            </Button>
            <Button onClick={onApprove} disabled={busy || Boolean(blockedReason) || !attested}>
              <Check aria-hidden className="size-4" />
              Aprovar esta variante
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
