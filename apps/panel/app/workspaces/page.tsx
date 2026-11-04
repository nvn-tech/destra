"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Button, Card, Field, Input, Logo } from "@/components/ui";
import { ApiError, api, type WorkspaceSummary } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

const ROLE_LABELS: Record<WorkspaceSummary["role"], string> = {
  owner: "Proprietária(o)",
  editor: "Edição",
  approver: "Aprovação",
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
      if (err instanceof ApiError && err.status === 401) return router.replace("/entrar");
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
      const created = await api<{ id: string }>("/v1/workspaces", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      router.push(`/w/${created.id}/perfil`);
    } catch {
      setError("Não foi possível criar o espaço.");
    }
  }

  async function signOut() {
    await authClient.signOut();
    router.replace("/entrar");
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <Logo />
        <Button variant="ghost" onClick={signOut}>
          Sair
        </Button>
      </div>
      <h1 className="text-[28px] font-bold leading-9 tracking-tight">Seus espaços</h1>
      <p className="mt-1 text-ink-2">
        Cada espaço reúne o perfil, as redes e os posts de um profissional.
      </p>

      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-block">
          {error}
        </p>
      )}

      <Card className="mt-6 divide-y divide-line">
        {workspaces === null ? (
          <p className="p-5 text-ink-2">Carregando…</p>
        ) : workspaces.length === 0 ? (
          <p className="p-5 text-ink-2">Você ainda não tem um espaço. Crie o primeiro abaixo.</p>
        ) : (
          workspaces.map((w) => (
            <Link
              key={w.id}
              href={`/w/${w.id}/revisao`}
              className="flex items-center justify-between p-5 hover:bg-canvas"
            >
              <span>
                <span className="block font-semibold text-ink">{w.name}</span>
                <span className="text-sm text-ink-2">{ROLE_LABELS[w.role]}</span>
              </span>
              <ChevronRight aria-hidden className="size-5 text-ink-3" />
            </Link>
          ))
        )}
      </Card>

      <Card className="mt-6 p-5">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={onCreate}>
          <div className="flex-1">
            <Field label="Nome do novo espaço">
              <Input name="name" required placeholder="Dra. Ana Souza" />
            </Field>
          </div>
          <Button type="submit">Criar espaço</Button>
        </form>
      </Card>
    </main>
  );
}
