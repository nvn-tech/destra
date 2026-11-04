"use client";

import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { ApiError, api, type WorkspaceDetail } from "@/lib/api";

interface WorkspaceContextValue {
  workspace: WorkspaceDetail;
  refresh: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}

export function WorkspaceProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setWorkspace(await api<WorkspaceDetail>(`/v1/workspaces/${workspaceId}`));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return router.replace("/entrar");
      if (err instanceof ApiError && err.status === 404) return router.replace("/workspaces");
      setError("Não foi possível carregar este espaço. Tente de novo em instantes.");
    }
  }, [workspaceId, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (error) {
    return (
      <p role="alert" className="p-8 text-block">
        {error}
      </p>
    );
  }
  if (!workspace) {
    return <p className="p-8 text-ink-2">Carregando…</p>;
  }
  return (
    <WorkspaceContext.Provider value={{ workspace, refresh }}>{children}</WorkspaceContext.Provider>
  );
}
