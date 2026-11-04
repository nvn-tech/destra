"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { Button, Card, Field, Input, Logo } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"entrar" | "criar">("entrar");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Links from the landing page open straight on sign-up: /entrar?modo=criar
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("modo") === "criar") setMode("criar");
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    setPending(true);
    setError(null);
    const result =
      mode === "entrar"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: String(form.get("name")) });
    setPending(false);
    if (result.error) {
      setError(
        mode === "entrar"
          ? "E-mail ou senha incorretos."
          : (result.error.message ?? "Não foi possível criar a conta."),
      );
      return;
    }
    router.push("/workspaces");
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Card className="p-8">
          <h1 className="text-2xl font-bold tracking-tight">
            {mode === "entrar" ? "Entrar" : "Criar conta"}
          </h1>
          <p className="mt-1 text-ink-2">
            Conteúdo para Instagram no seu tom, com verificação de publicidade médica.
          </p>
          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            {mode === "criar" && (
              <Field label="Nome completo">
                <Input name="name" required autoComplete="name" />
              </Field>
            )}
            <Field label="E-mail">
              <Input name="email" type="email" required autoComplete="email" />
            </Field>
            <Field label="Senha" hint={mode === "criar" ? "Pelo menos 10 caracteres" : undefined}>
              <Input
                name="password"
                type="password"
                required
                minLength={10}
                autoComplete={mode === "entrar" ? "current-password" : "new-password"}
              />
            </Field>
            {error && (
              <p role="alert" className="text-sm font-medium text-block">
                {error}
              </p>
            )}
            <Button type="submit" disabled={pending} className="w-full">
              {mode === "entrar" ? "Entrar" : "Criar conta"}
            </Button>
          </form>
          <Button
            variant="ghost"
            className="mt-3 w-full"
            onClick={() => setMode(mode === "entrar" ? "criar" : "entrar")}
          >
            {mode === "entrar" ? "Ainda não tenho conta" : "Já tenho conta"}
          </Button>
        </Card>
        <p className="mt-6 text-center text-xs text-ink-2">
          Seus dados são tratados conforme a LGPD.
        </p>
      </div>
    </main>
  );
}
