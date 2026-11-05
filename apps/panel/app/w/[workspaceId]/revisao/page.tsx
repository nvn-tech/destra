"use client";

import { Inbox } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApprovalBar } from "@/components/review/approval-bar";
import { CompliancePanel } from "@/components/review/compliance-panel";
import { QueueList } from "@/components/review/queue-list";
import { VariantPreview } from "@/components/review/variant-preview";
import { Card, Chip, StatusBadge } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { ApiError, api, type Connection, type QueueItem, type QueueVariant } from "@/lib/api";
import {
  formatLabel,
  formatSlot,
  fromLocalInput,
  strategyLabels,
  toLocalInput,
} from "@/lib/format";

/** Prefers a variant without alerts, then one to review; blocked variants come last. */
function defaultVariant(item: QueueItem): QueueVariant | undefined {
  const rank = { pass: 0, warn: 1, pending: 2, block: 3 } as const;
  return [...item.variants].sort((a, b) => rank[a.complianceStatus] - rank[b.complianceStatus])[0];
}

export default function ReviewQueuePage() {
  const { workspace } = useWorkspace();
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [instagramActive, setInstagramActive] = useState(false);
  const [scheduleValue, setScheduleValue] = useState("");

  const load = useCallback(async () => {
    const data = await api<{ items: QueueItem[] }>(`/v1/workspaces/${workspace.id}/review-queue`);
    setItems(data.items);
    return data.items;
  }, [workspace.id]);

  useEffect(() => {
    load().catch(() => setNotice({ kind: "error", text: "Não foi possível carregar a fila." }));
    api<{ connections: Connection[] }>(`/v1/workspaces/${workspace.id}/connections`)
      .then((d) =>
        setInstagramActive(
          d.connections.some((c) => c.platform === "instagram" && c.status === "active"),
        ),
      )
      .catch(() => setInstagramActive(false));
  }, [load, workspace.id]);

  const item = useMemo(() => items?.find((i) => i.id === itemId) ?? items?.[0], [items, itemId]);
  const variant =
    item?.variants.find((v) => v.id === variantId) ?? (item ? defaultVariant(item) : undefined);

  // Default the schedule to the suggested slot of the selected post.
  const suggestedSlot = item?.suggestedSlot ?? null;
  useEffect(() => {
    setScheduleValue(toLocalInput(suggestedSlot));
  }, [suggestedSlot]);

  function selectItem(id: string) {
    setItemId(id);
    setVariantId(null);
    setAttested(false);
  }

  function selectVariant(id: string) {
    setVariantId(id);
    setAttested(false); // the attestation is for the exact content shown
  }

  async function afterDecision(text: string) {
    const remaining = await load();
    setItemId(remaining[0]?.id ?? null);
    setVariantId(null);
    setAttested(false);
    setNotice({ kind: "ok", text });
  }

  async function approve(withSchedule: boolean) {
    if (!variant) return;
    setBusy(true);
    setNotice(null);
    try {
      const scheduledAt = withSchedule && scheduleValue ? fromLocalInput(scheduleValue) : undefined;
      await api(`/v1/workspaces/${workspace.id}/variants/${variant.id}/approve`, {
        method: "POST",
        body: JSON.stringify(
          scheduledAt ? { attestation: true, scheduledAt } : { attestation: true },
        ),
      });
      await afterDecision(
        scheduledAt
          ? `Post aprovado e agendado para ${formatSlot(scheduledAt, workspace.timezone)}.`
          : "Post aprovado. Você pode agendá-lo depois.",
      );
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof ApiError ? err.message : "Não foi possível aprovar.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function reject(comment: string) {
    if (!item) return;
    setBusy(true);
    setNotice(null);
    try {
      await api(`/v1/workspaces/${workspace.id}/content-items/${item.id}/reject`, {
        method: "POST",
        body: JSON.stringify(comment.trim() ? { comment: comment.trim() } : {}),
      });
      await afterDecision("Post recusado e removido da fila.");
    } catch {
      setNotice({ kind: "error", text: "Não foi possível recusar." });
    } finally {
      setBusy(false);
    }
  }

  const canApprove = workspace.role !== "viewer";
  const blockedReason = !canApprove
    ? { text: "Seu papel neste espaço permite apenas visualizar." }
    : !workspace.professionalProfile
      ? {
          text: "Para aprovar, complete seu CRM e RQE.",
          href: `/w/${workspace.id}/perfil`,
          linkText: "Completar perfil",
        }
      : variant?.complianceStatus === "block"
        ? {
            text: "Esta variante tem um trecho que impede a aprovação. Escolha outra variante ou recuse o post.",
          }
        : null;

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="mb-6">
        <h1 className="text-[28px] font-bold leading-9 tracking-tight">Fila de revisão</h1>
        <p className="mt-1 text-ink-2">
          Revise cada post e aprove a variante que representa você. Nada é publicado sem a sua
          aprovação.
        </p>
      </div>

      {notice && (
        <p
          role="status"
          className={`mb-4 rounded-control border px-4 py-3 text-sm font-medium ${
            notice.kind === "ok"
              ? "border-pass-line bg-pass-bg text-pass"
              : "border-block-line bg-block-bg text-block"
          }`}
        >
          {notice.text}
        </p>
      )}

      {items === null ? (
        <p className="text-ink-2">Carregando…</p>
      ) : items.length === 0 || !item || !variant ? (
        <Card className="flex flex-col items-center p-12 text-center">
          <Inbox aria-hidden className="size-10 text-ink-3" />
          <p className="mt-3 text-base font-semibold">Nenhum post aguardando revisão</p>
          <p className="mt-1 max-w-md text-ink-2">
            Quando novos rascunhos forem gerados, eles aparecem aqui para você revisar.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)_380px]">
            <QueueList
              items={items}
              selectedId={item.id}
              timeZone={workspace.timezone}
              onSelect={selectItem}
            />

            <div className="min-w-0 space-y-4">
              <Card className="p-5">
                <p className="text-xs font-semibold text-ink-2">
                  {formatLabel(variant.format)} · sugerido para{" "}
                  {formatSlot(item.suggestedSlot, workspace.timezone)}
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight">{item.title}</h2>
                <div role="tablist" aria-label="Variantes" className="mt-4 flex flex-wrap gap-2">
                  {item.variants.map((v, i) => {
                    const active = v.id === variant.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => selectVariant(v.id)}
                        className={`flex items-center gap-2 rounded-control border px-3 py-2 text-left text-sm ${
                          active
                            ? "border-pine bg-pine-soft"
                            : "border-line hover:border-line-strong"
                        }`}
                      >
                        <span className="font-semibold">
                          {String.fromCharCode(65 + i)} · {v.body.label}
                        </span>
                        <StatusBadge status={v.complianceStatus} />
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {strategyLabels(variant.body.strategyTags).map((tag) => (
                    <Chip key={tag}>{tag}</Chip>
                  ))}
                </div>
              </Card>
              <VariantPreview
                key={variant.id}
                variant={variant}
                profile={workspace.professionalProfile}
              />
            </div>

            <div className="min-w-0">
              <div className="xl:sticky xl:top-6">
                <CompliancePanel variant={variant} />
              </div>
            </div>
          </div>

          <ApprovalBar
            blockedReason={blockedReason}
            attested={attested}
            onAttest={setAttested}
            busy={busy}
            schedule={{
              value: scheduleValue,
              onChange: setScheduleValue,
              unavailableReason: !instagramActive
                ? {
                    text: "Para agendar, conecte o Instagram.",
                    href: `/w/${workspace.id}/conexoes`,
                    linkText: "Conectar",
                  }
                : variant.format === "reel" || variant.format === "video"
                  ? { text: "Reels ainda são publicados manualmente, a partir do roteiro." }
                  : null,
            }}
            onApprove={approve}
            onReject={reject}
          />
        </>
      )}
    </div>
  );
}
