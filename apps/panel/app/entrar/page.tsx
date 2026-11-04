"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"entrar" | "criar">("entrar");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
      setError(result.error.message ?? "Não foi possível entrar.");
      return;
    }
    router.push("/workspaces");
  }

  return (
    <main>
      <h1>{mode === "entrar" ? "Entrar no Destra" : "Criar conta"}</h1>
      <form className="card stack" onSubmit={onSubmit} style={{ maxWidth: 400 }}>
        {mode === "criar" && (
          <label>
            Nome completo
            <input name="name" required autoComplete="name" />
          </label>
        )}
        <label>
          E-mail
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Senha
          <input
            name="password"
            type="password"
            required
            minLength={10}
            autoComplete={mode === "entrar" ? "current-password" : "new-password"}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending}>
          {mode === "entrar" ? "Entrar" : "Criar conta"}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => setMode(mode === "entrar" ? "criar" : "entrar")}
        >
          {mode === "entrar" ? "Criar conta" : "Já tenho conta"}
        </button>
        <p className="muted">Seus dados protegidos conforme a LGPD.</p>
      </form>
    </main>
  );
}
