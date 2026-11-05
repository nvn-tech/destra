"use client";

import { Trash2, UsersRound } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { ApiError, api, type Connection, type Influence, type Reference } from "@/lib/api";
import { formatCount, formatDate } from "@/lib/format";

const INFLUENCE_LABELS: Record<Influence, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};

export default function ReferencesPage() {
  const { workspace } = useWorkspace();
  const base = `/v1/workspaces/${workspace.id}`;
  const [references, setReferences] = useState<Reference[] | null>(null);
  const [limit, setLimit] = useState(10);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [username, setUsername] = useState("");
  const [influence, setInfluence] = useState<Influence>("media");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = workspace.role === "owner" || workspace.role === "editor";

  const load = useCallback(async () => {
    const [refs, conns] = await Promise.all([
      api<{ references: Reference[]; limit: number }>(`${base}/references`),
      api<{ connections: Connection[] }>(`${base}/connections`),
    ]);
    setReferences(refs.references);
    setLimit(refs.limit);
    setConnected(
      conns.connections.some((c) => c.platform === "instagram" && c.status === "active"),
    );
  }, [base]);

  useEffect(() => {
    load().catch(() => setError("Não foi possível carregar as referências."));
  }, [load]);

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/references`, {
        method: "POST",
        body: JSON.stringify({ username, influence }),
      });
      setUsername("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível adicionar.");
    } finally {
      setBusy(false);
    }
  }

  async function update(ref: Reference, next: Influence) {
    await api(`${base}/references/${ref.sourceAccountId}`, {
      method: "PATCH",
      body: JSON.stringify({ influence: next }),
    });
    await load();
  }

  async function remove(ref: Reference) {
    if (!window.confirm(`Remover @${ref.username} das referências?`)) return;
    await api(`${base}/references/${ref.sourceAccountId}`, { method: "DELETE" });
    await load();
  }

  const full = (references?.length ?? 0) >= limit;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-[28px] font-bold leading-9 tracking-tight">Perfis de referência</h1>
        <p className="mt-1 text-ink-2">
          Perfis que você admira. A Destra estuda a estrutura dos posts que funcionam (ganchos,
          formatos, ritmo), nunca copia o texto ou as imagens.
        </p>
      </div>

      {connected === false && (
        <Card className="p-5">
          <p className="font-semibold">Conecte seu Instagram primeiro</p>
          <p className="mt-1 text-sm text-ink-2">
            A Meta só permite analisar outros perfis profissionais através de uma conta conectada.
          </p>
          <Link
            href={`/w/${workspace.id}/conexoes`}
            className="mt-3 inline-block text-sm font-semibold text-teal underline"
          >
            Ir para Conexões
          </Link>
        </Card>
      )}

      {canEdit && connected && (
        <Card className="p-5">
          <form onSubmit={add} className="grid items-end gap-3 sm:grid-cols-[1fr_160px_auto]">
            <Field
              label="Perfil do Instagram"
              hint="Somente contas profissionais públicas podem ser analisadas."
            >
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="@perfil ou link do perfil"
                required
                disabled={full}
              />
            </Field>
            <Field label="Influência no seu estilo">
              <Select
                value={influence}
                onChange={(e) => setInfluence(e.target.value as Influence)}
                disabled={full}
              >
                {(Object.keys(INFLUENCE_LABELS) as Influence[]).map((k) => (
                  <option key={k} value={k}>
                    {INFLUENCE_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" disabled={busy || full} className="sm:mb-[22px]">
              {busy ? "Verificando…" : "Adicionar"}
            </Button>
          </form>
          {error && (
            <p role="alert" className="mt-3 text-sm font-medium text-block">
              {error}
            </p>
          )}
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-semibold">Suas referências</h2>
          <span className="text-sm text-ink-2">
            {references?.length ?? 0} de {limit}
          </span>
        </div>
        {references === null ? (
          <p className="p-5 text-ink-2">Carregando…</p>
        ) : references.length === 0 ? (
          <div className="flex flex-col items-center p-10 text-center">
            <UsersRound aria-hidden className="size-9 text-ink-3" />
            <p className="mt-3 font-semibold">Nenhuma referência ainda</p>
            <p className="mt-1 text-sm text-ink-2">
              Adicione de 3 a 10 perfis da sua especialidade que comunicam bem.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {references.map((ref) => (
              <li
                key={ref.sourceAccountId}
                className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold">@{ref.username}</p>
                  <p className="text-sm text-ink-2">
                    {formatCount(ref.followers)} seguidores · {ref.postsAnalyzed} posts analisados ·{" "}
                    {ref.lastSyncedAt
                      ? `atualizado ${formatDate(ref.lastSyncedAt, workspace.timezone)}`
                      : "aguardando a primeira análise"}
                  </p>
                  {ref.status === "gone" && (
                    <p className="mt-1 text-sm text-review">
                      Não está mais disponível como conta profissional pública.
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-2 text-sm text-ink-2">
                    <span aria-hidden>Influência</span>
                    <Select
                      value={ref.influence}
                      onChange={(e) => update(ref, e.target.value as Influence)}
                      disabled={!canEdit}
                      className="h-9"
                      aria-label={`Influência de @${ref.username}`}
                    >
                      {(Object.keys(INFLUENCE_LABELS) as Influence[]).map((k) => (
                        <option key={k} value={k}>
                          {INFLUENCE_LABELS[k]}
                        </option>
                      ))}
                    </Select>
                  </span>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      className="h-9 px-2"
                      aria-label={`Remover @${ref.username}`}
                      onClick={() => remove(ref)}
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
