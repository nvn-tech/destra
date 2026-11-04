"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, api, type WorkspaceSummary } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

const ROLE_LABELS: Record<WorkspaceSummary["role"], string> = {
  owner: "Proprietário(a)",
  editor: "Editor(a)",
  approver: "Aprovador(a)",
  viewer: "Leitura",
};

export default function WorkspacesPage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ workspaces: WorkspaceSummary[] }>("/v1/workspaces");
      setWorkspaces(data.workspaces);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/entrar");
        return;
      }
      setError("Não foi possível carregar seus espaços.");
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name"));
    try {
      await api("/v1/workspaces", { method: "POST", body: JSON.stringify({ name }) });
      form.reset();
      await load();
    } catch {
      setError("Não foi possível criar o espaço.");
    }
  }

  async function onSignOut() {
    await authClient.signOut();
    router.replace("/entrar");
  }

  return (
    <main className="stack">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Seus espaços</h1>
        <button type="button" className="secondary" onClick={onSignOut}>
          Sair
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section className="card">
        {workspaces === null ? (
          <p className="muted">Carregando…</p>
        ) : workspaces.length === 0 ? (
          <p className="muted">Você ainda não tem um espaço. Crie o primeiro abaixo.</p>
        ) : (
          <ul className="list">
            {workspaces.map((w) => (
              <li key={w.id}>
                <strong>{w.name}</strong>
                <span className="muted">{ROLE_LABELS[w.role]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <form className="card stack" onSubmit={onCreate} style={{ maxWidth: 400 }}>
        <label>
          Nome do espaço
          <input name="name" required placeholder="Dra. Ana Souza" />
        </label>
        <button type="submit">Criar espaço</button>
      </form>
    </main>
  );
}
