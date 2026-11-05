"use client";

import { CircleAlert, CircleCheck, Link2Off, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Mono, StatusBadge } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { ApiError, api, type Candidate, type Connection } from "@/lib/api";
import { formatCount, formatDate } from "@/lib/format";

/** What went wrong in Facebook Login, in the doctor's words, with what to do next. */
const ERRORS: Record<string, { title: string; help: string }> = {
  cancelled: {
    title: "A conexão foi cancelada.",
    help: "Tudo bem. Quando quiser, clique em Conectar com Facebook de novo.",
  },
  no_pages: {
    title: "Sua conta do Facebook não administra nenhuma Página.",
    help: "O Instagram só libera a integração para contas profissionais ligadas a uma Página do Facebook. Veja o passo a passo abaixo.",
  },
  no_instagram: {
    title: "Nenhuma das suas Páginas tem uma conta do Instagram vinculada.",
    help: "No app do Instagram: Configurações › Central de Contas › adicione sua Página do Facebook. Depois conecte de novo.",
  },
  missing_permissions: {
    title: "Algumas permissões foram desmarcadas.",
    help: "Precisamos ler seu perfil, suas Páginas e as métricas dos posts. Conecte de novo e mantenha todas as opções marcadas.",
  },
  session_mismatch: {
    title: "A conexão foi iniciada por outra pessoa ou em outra sessão.",
    help: "Entre com a mesma conta da Destra que iniciou a conexão e tente de novo.",
  },
  invalid_state: {
    title: "O link de conexão expirou.",
    help: "Comece a conexão de novo por esta página.",
  },
  forbidden: {
    title: "Seu papel neste espaço não permite conectar redes.",
    help: "Peça a quem é proprietária(o) do espaço.",
  },
  meta_error: {
    title: "A Meta não respondeu como esperado.",
    help: "Tente de novo em alguns minutos.",
  },
};

const REQUIREMENTS = [
  "Conta profissional do Instagram (Criador de conteúdo ou Empresa)",
  "Conta vinculada a uma Página do Facebook",
  "Você administra essa Página",
];

export default function ConnectionsPage() {
  const { workspace } = useWorkspace();
  const router = useRouter();
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [metaConfigured, setMetaConfigured] = useState(true);
  const [candidates, setCandidates] = useState<{ grantId: string; items: Candidate[] } | null>(
    null,
  );
  const [notice, setNotice] = useState<{
    kind: "ok" | "error";
    title: string;
    help?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const canManage = workspace.role === "owner" || workspace.role === "editor";
  const base = `/v1/workspaces/${workspace.id}`;

  const load = useCallback(async () => {
    const data = await api<{ connections: Connection[]; metaConfigured: boolean }>(
      `${base}/connections`,
    );
    setConnections(data.connections);
    setMetaConfigured(data.metaConfigured);
  }, [base]);

  // Read the result Facebook Login sent back, then clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const error = params.get("error");
    const grant = params.get("grant");
    if (status === "connected")
      setNotice({
        kind: "ok",
        title: "Instagram conectado. Estamos importando seus posts recentes.",
      });
    if (error)
      setNotice({ kind: "error", ...(ERRORS[error] ?? ERRORS.meta_error) } as {
        kind: "error";
        title: string;
        help: string;
      });
    if (grant) {
      api<{ candidates: Candidate[] }>(`${base}/connections/instagram/grants/${grant}`)
        .then((data) => setCandidates({ grantId: grant, items: data.candidates }))
        .catch(() =>
          setNotice({ kind: "error", title: "Este login expirou.", help: "Conecte de novo." }),
        );
    }
    if (status || error || grant) router.replace(`/w/${workspace.id}/conexoes`);
    load().catch(() =>
      setNotice({ kind: "error", title: "Não foi possível carregar as conexões." }),
    );
  }, [base, load, router, workspace.id]);

  async function connect() {
    setBusy(true);
    try {
      const { url } = await api<{ url: string }>(`${base}/connections/instagram/start`, {
        method: "POST",
      });
      window.location.assign(url);
    } catch (err) {
      setBusy(false);
      setNotice({
        kind: "error",
        title: err instanceof ApiError ? err.message : "Não foi possível iniciar a conexão.",
      });
    }
  }

  async function choose(candidate: Candidate) {
    if (!candidates) return;
    setBusy(true);
    try {
      await api(`${base}/connections/instagram/grants/${candidates.grantId}/complete`, {
        method: "POST",
        body: JSON.stringify({ instagramAccountId: candidate.instagramId }),
      });
      setCandidates(null);
      setNotice({
        kind: "ok",
        title: `@${candidate.username} conectado. Estamos importando seus posts recentes.`,
      });
      await load();
    } catch (err) {
      setNotice({
        kind: "error",
        title: err instanceof ApiError ? err.message : "Não foi possível concluir a conexão.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(connection: Connection) {
    if (
      !window.confirm(
        `Desconectar @${connection.username}? Os agendamentos dessa conta deixam de ser publicados.`,
      )
    )
      return;
    setBusy(true);
    try {
      await api(`${base}/connections/${connection.id}`, { method: "DELETE" });
      setNotice({ kind: "ok", title: "Conta desconectada. Os tokens de acesso foram apagados." });
      await load();
    } finally {
      setBusy(false);
    }
  }

  const instagram = connections?.find((c) => c.platform === "instagram");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-[28px] font-bold leading-9 tracking-tight">Conexões</h1>
        <p className="mt-1 text-ink-2">
          Conecte o Instagram para importar seus posts, aprender seu estilo e analisar perfis de
          referência.
        </p>
      </div>

      {notice && (
        <div
          role="status"
          className={`rounded-control border p-4 text-sm ${notice.kind === "ok" ? "border-pass-line bg-pass-bg text-pass" : "border-review-line bg-review-bg text-review"}`}
        >
          <p className="font-semibold">{notice.title}</p>
          {notice.help && <p className="mt-1">{notice.help}</p>}
        </div>
      )}

      {candidates && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Qual conta do Instagram você quer conectar?</h2>
          <p className="mt-1 text-sm text-ink-2">
            Encontramos mais de uma conta profissional nas suas Páginas.
          </p>
          <ul className="mt-4 divide-y divide-line">
            {candidates.items.map((c) => (
              <li
                key={c.instagramId}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-semibold">@{c.username}</p>
                  <p className="text-sm text-ink-2">
                    Página: {c.pageName} · {formatCount(c.followers)} seguidores
                    {!c.canPublish && " · sem permissão para publicar"}
                  </p>
                </div>
                <Button disabled={busy} onClick={() => choose(c)}>
                  Conectar esta conta
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {connections === null ? (
        <p className="text-ink-2">Carregando…</p>
      ) : instagram ? (
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-ink-2">Instagram</p>
              <p className="mt-1 text-xl font-semibold">@{instagram.username}</p>
              <p className="text-sm text-ink-2">{instagram.displayName}</p>
            </div>
            {instagram.status === "active" ? (
              <StatusBadge status="pass" label="Conectado" />
            ) : (
              <StatusBadge status="warn" label="Reconexão necessária" />
            )}
          </div>
          <dl className="mt-5 grid grid-cols-3 gap-4 border-y border-line py-4 text-center">
            <div>
              <dt className="text-xs text-ink-2">Seguidores</dt>
              <dd className="mt-1 text-lg font-bold">{formatCount(instagram.followers)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-2">Posts importados</dt>
              <dd className="mt-1 text-lg font-bold">{instagram.postsImported}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-2">Última atualização</dt>
              <dd className="mt-1 text-sm font-semibold">
                {formatDate(instagram.lastSyncedAt, workspace.timezone)}
              </dd>
            </div>
          </dl>
          {instagram.status !== "active" && (
            <p className="mt-4 flex gap-2 text-sm text-review">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-review-icon" />A Meta
              encerrou o acesso (senha alterada ou permissão removida). Reconecte para voltar a
              importar e publicar.
            </p>
          )}
          {canManage && (
            <div className="mt-5 flex flex-wrap gap-2">
              {instagram.status !== "active" && (
                <Button disabled={busy || !metaConfigured} onClick={connect}>
                  <RefreshCw aria-hidden className="size-4" />
                  Reconectar
                </Button>
              )}
              <Button variant="danger" disabled={busy} onClick={() => disconnect(instagram)}>
                <Link2Off aria-hidden className="size-4" />
                Desconectar
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Conecte seu Instagram profissional</h2>
          <ul className="mt-4 space-y-2">
            {REQUIREMENTS.map((r) => (
              <li key={r} className="flex gap-2 text-sm text-ink">
                <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-teal" />
                {r}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-ink-2">
            Usamos o login do Facebook porque é o único caminho que a Meta oferece para analisar
            perfis de referência. A Destra nunca acessa suas mensagens privadas e só publica o que
            você aprovar.
          </p>
          {canManage ? (
            <Button className="mt-5" disabled={busy || !metaConfigured} onClick={connect}>
              Conectar com Facebook
            </Button>
          ) : (
            <p className="mt-5 text-sm text-ink-2">
              Peça a quem tem papel de edição ou proprietário para conectar.
            </p>
          )}
          {!metaConfigured && (
            <p className="mt-2 text-sm text-review">
              A integração com a Meta ainda não está configurada neste ambiente.
            </p>
          )}

          <details className="mt-6 rounded-control border border-line p-4">
            <summary className="cursor-pointer text-sm font-semibold">
              Minha conta é pessoal ou não tem Página
            </summary>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink-2">
              <li>
                No app do Instagram, abra Configurações › Tipo de conta e ferramentas › Mudar para
                conta profissional.
              </li>
              <li>
                Escolha a categoria (por exemplo, Médico ou Saúde/Beleza) e o tipo Criador ou
                Empresa.
              </li>
              <li>
                Em Central de Contas, vincule uma Página do Facebook que você administra (ou crie
                uma).
              </li>
              <li>Volte aqui e clique em Conectar com Facebook.</li>
            </ol>
          </details>
        </Card>
      )}

      <p className="text-xs text-ink-2">
        Os tokens de acesso ficam criptografados (<Mono>AES-256-GCM</Mono>) e são apagados quando
        você desconecta ou remove o app nas configurações do Facebook.
      </p>
    </div>
  );
}
