"use client";

import { CalendarClock, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, StatusBadge } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { ApiError, api, type Publication } from "@/lib/api";
import { formatLabel, formatSlot, fromLocalInput, toLocalInput } from "@/lib/format";

const STATUS: Record<
  Publication["status"],
  { status: "pass" | "warn" | "block" | "pending"; label: string }
> = {
  scheduled: { status: "pending", label: "Agendado" },
  publishing: { status: "pending", label: "Publicando" },
  published: { status: "pass", label: "Publicado" },
  failed: { status: "block", label: "Não publicado" },
  cancelled: { status: "pending", label: "Cancelado" },
};

function Row({
  publication,
  onChanged,
}: {
  publication: Publication;
  onChanged: (text: string) => Promise<void>;
}) {
  const { workspace } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(toLocalInput(publication.scheduledAt));
  const [error, setError] = useState<string | null>(null);
  const canManage = workspace.role !== "viewer";
  const base = `/v1/workspaces/${workspace.id}/publications/${publication.id}`;
  const s = STATUS[publication.status];

  async function reschedule() {
    try {
      await api(base, {
        method: "PATCH",
        body: JSON.stringify({ scheduledAt: fromLocalInput(value) }),
      });
      setEditing(false);
      await onChanged(`Reagendado para ${formatSlot(fromLocalInput(value), workspace.timezone)}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível reagendar.");
    }
  }

  async function cancel() {
    if (!window.confirm("Cancelar esta publicação? O post volta para aprovados.")) return;
    try {
      await api(base, { method: "DELETE" });
      await onChanged("Publicação cancelada.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível cancelar.");
    }
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={s.status} label={s.label} />
          <span className="text-xs text-ink-2">
            {formatLabel(publication.format)}
            {publication.label ? ` · ${publication.label}` : ""}
          </span>
        </div>
        <p className="mt-1.5 font-semibold">{publication.title ?? "Sem título"}</p>
        <p className="text-sm text-ink-2">
          {publication.status === "published" && publication.publishedAt
            ? `Publicado em ${formatSlot(publication.publishedAt, workspace.timezone)}`
            : formatSlot(publication.scheduledAt, workspace.timezone)}
        </p>
        {publication.errorMessage && (
          <p className="mt-1 text-sm text-block">{publication.errorMessage}</p>
        )}
        {error && (
          <p role="alert" className="mt-1 text-sm text-block">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {publication.permalink && (
          <a
            href={publication.permalink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-semibold text-teal underline"
          >
            Ver no Instagram
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
        )}
        {publication.status === "scheduled" &&
          canManage &&
          (editing ? (
            <>
              <input
                type="datetime-local"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-label="Novo horário"
                className="h-9 rounded-control border border-line px-2 text-sm"
              />
              <Button className="h-9" onClick={reschedule}>
                Salvar
              </Button>
              <Button variant="ghost" className="h-9" onClick={() => setEditing(false)}>
                Voltar
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" className="h-9" onClick={() => setEditing(true)}>
                <CalendarClock aria-hidden className="size-4" />
                Reagendar
              </Button>
              <Button variant="danger" className="h-9" onClick={cancel}>
                Cancelar
              </Button>
            </>
          ))}
      </div>
    </li>
  );
}

export default function ScheduledPage() {
  const { workspace } = useWorkspace();
  const [publications, setPublications] = useState<Publication[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await api<{ publications: Publication[] }>(
      `/v1/workspaces/${workspace.id}/publications`,
    );
    setPublications(data.publications);
  }, [workspace.id]);

  useEffect(() => {
    load().catch(() => setNotice("Não foi possível carregar as publicações."));
  }, [load]);

  const upcoming = (publications ?? [])
    .filter((p) => p.status === "scheduled" || p.status === "publishing")
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const history = (publications ?? []).filter(
    (p) => p.status !== "scheduled" && p.status !== "publishing",
  );
  const onChanged = async (text: string) => {
    setNotice(text);
    await load();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-[28px] font-bold leading-9 tracking-tight">Agendados</h1>
        <p className="mt-1 text-ink-2">
          Posts aprovados e agendados. Na hora marcada, a Destra confere tudo de novo antes de
          publicar.
        </p>
      </div>
      {workspace.publishingPausedAt && (
        <p className="rounded-control border border-review-line bg-review-bg p-3 text-sm text-review">
          As publicações estão pausadas. Os posts abaixo esperam até você retomar.
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-control border border-pass-line bg-pass-bg p-3 text-sm text-pass"
        >
          {notice}
        </p>
      )}
      <Card>
        <h2 className="border-b border-line px-5 py-3 font-semibold">Próximos</h2>
        {publications === null ? (
          <p className="p-5 text-ink-2">Carregando…</p>
        ) : upcoming.length === 0 ? (
          <p className="p-5 text-ink-2">Nada agendado. Aprove e agende posts na Fila de revisão.</p>
        ) : (
          <ul className="divide-y divide-line">
            {upcoming.map((p) => (
              <Row key={p.id} publication={p} onChanged={onChanged} />
            ))}
          </ul>
        )}
      </Card>
      {history.length > 0 && (
        <Card>
          <h2 className="border-b border-line px-5 py-3 font-semibold">Histórico</h2>
          <ul className="divide-y divide-line">
            {history.map((p) => (
              <Row key={p.id} publication={p} onChanged={onChanged} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
