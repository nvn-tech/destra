"use client";

import {
  BarChart3,
  CalendarDays,
  CirclePause,
  CirclePlay,
  ClipboardCheck,
  LogOut,
  type LucideIcon,
  Mic,
  Repeat,
  Scale,
  Sparkles,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { signatureLine } from "@/lib/format";
import { Button, Logo, Mono } from "./ui";
import { useWorkspace } from "./workspace-context";

interface NavItem {
  label: string;
  href?: string;
  icon: LucideIcon;
}

const AUTONOMY_LABELS = {
  manual: "Modo manual",
  assisted: "Modo assistido",
  autopilot: "Piloto automático",
};

export function AppShell({ children }: { children: ReactNode }) {
  const { workspace } = useWorkspace();
  const base = `/w/${workspace.id}`;
  const pathname = usePathname();
  const router = useRouter();

  const main: NavItem[] = [
    { label: "Fila de revisão", href: `${base}/revisao`, icon: ClipboardCheck },
    { label: "Calendário", icon: CalendarDays },
    { label: "Inspiração", icon: Sparkles },
    { label: "Voz e estilo", icon: Mic },
    { label: "Resultados", icon: BarChart3 },
    { label: "Regras e auditoria", icon: Scale },
  ];
  const account: NavItem[] = [
    { label: "Perfil profissional", href: `${base}/perfil`, icon: UserRound },
    { label: "Trocar de espaço", href: "/workspaces", icon: Repeat },
  ];

  async function signOut() {
    await authClient.signOut();
    router.replace("/entrar");
  }

  const navLink = (item: NavItem) => {
    const Icon = item.icon;
    if (!item.href) {
      return (
        <li key={item.label}>
          <span
            className="flex items-center justify-between rounded-control px-3 py-2 text-sm text-ink-3"
            aria-disabled
          >
            <span className="flex items-center gap-2.5">
              <Icon aria-hidden className="size-4" />
              {item.label}
            </span>
            <span className="text-xs">Em breve</span>
          </span>
        </li>
      );
    }
    const active = pathname.startsWith(item.href);
    return (
      <li key={item.label}>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={`flex items-center gap-2.5 rounded-control px-3 py-2 text-sm font-medium ${
            active ? "bg-pine-soft text-pine" : "text-ink-2 hover:bg-subtle hover:text-ink"
          }`}
        >
          <Icon aria-hidden className="size-4" />
          {item.label}
        </Link>
      </li>
    );
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="hidden border-r border-line bg-card lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="border-b border-line p-5">
          <Logo />
        </div>
        <DoctorCard />
        <nav aria-label="Principal" className="flex-1 overflow-y-auto px-3">
          <ul className="space-y-0.5">{main.map(navLink)}</ul>
          <p className="mt-6 px-3 pb-1 text-xs font-semibold text-ink-3">Conta</p>
          <ul className="space-y-0.5">{account.map(navLink)}</ul>
        </nav>
        <div className="border-t border-line p-3">
          <Button variant="ghost" className="w-full justify-start" onClick={signOut}>
            <LogOut aria-hidden className="size-4" />
            Sair
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <TopBar autonomy={AUTONOMY_LABELS[workspace.autonomyLevel]} />
        <nav
          aria-label="Principal"
          className="flex gap-1 overflow-x-auto border-b border-line bg-card px-4 py-2 lg:hidden"
        >
          {[...main, ...account]
            .filter((i) => i.href)
            .map((item) => (
              <Link
                key={item.label}
                href={item.href ?? "#"}
                className="whitespace-nowrap rounded-control px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-subtle"
              >
                {item.label}
              </Link>
            ))}
        </nav>
        <main className="flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function DoctorCard() {
  const { workspace } = useWorkspace();
  const profile = workspace.professionalProfile;
  return (
    <div className="m-3 rounded-control border border-line bg-canvas p-3">
      <p className="text-xs font-semibold text-ink-3">Médica responsável</p>
      {profile ? (
        <>
          <p className="mt-1 text-sm font-semibold text-ink">{profile.fullName}</p>
          <Mono className="mt-0.5 block text-ink-2">
            {signatureLine(profile).split(" | ").slice(1).join(" · ")}
          </Mono>
        </>
      ) : (
        <Link
          href={`/w/${workspace.id}/perfil`}
          className="mt-1 block text-sm font-semibold text-review underline"
        >
          Complete seu perfil profissional
        </Link>
      )}
    </div>
  );
}

function TopBar({ autonomy }: { autonomy: string }) {
  const { workspace, refresh } = useWorkspace();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const paused = Boolean(workspace.publishingPausedAt);
  const canPause = workspace.role === "owner" || workspace.role === "editor";

  async function setPaused(next: boolean) {
    setBusy(true);
    try {
      await api(`/v1/workspaces/${workspace.id}/publishing`, {
        method: "PUT",
        body: JSON.stringify({ paused: next }),
      });
      await refresh();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <>
      {paused && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 border-b border-review-line bg-review-bg px-4 py-2.5 text-sm text-review lg:px-8"
        >
          <span className="flex items-center gap-2 font-semibold">
            <CirclePause aria-hidden className="size-4 text-review-icon" />
            Publicações pausadas. Nada será publicado até você retomar.
          </span>
          {canPause && (
            <Button
              variant="secondary"
              className="h-8"
              disabled={busy}
              onClick={() => setPaused(false)}
            >
              <CirclePlay aria-hidden className="size-4" />
              Retomar publicações
            </Button>
          )}
        </div>
      )}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-card px-4 py-3 lg:px-8">
        <div className="flex items-center gap-3">
          <span className="lg:hidden">
            <Logo />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">{workspace.name}</p>
            <p className="text-xs text-ink-2">{autonomy} · cada post passa pela sua aprovação</p>
          </div>
        </div>
        {canPause && !paused && (
          <div className="flex items-center gap-2">
            {confirming ? (
              <>
                <span className="text-sm text-ink-2">Pausar todas as publicações?</span>
                <Button variant="ghost" className="h-8" onClick={() => setConfirming(false)}>
                  Cancelar
                </Button>
                <Button
                  variant="danger"
                  className="h-8"
                  disabled={busy}
                  onClick={() => setPaused(true)}
                >
                  Sim, pausar
                </Button>
              </>
            ) : (
              <Button variant="danger" className="h-8" onClick={() => setConfirming(true)}>
                <CirclePause aria-hidden className="size-4" />
                Pausar publicações
              </Button>
            )}
          </div>
        )}
      </header>
    </>
  );
}
