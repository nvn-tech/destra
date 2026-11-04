"use client";

import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { WorkspaceProvider } from "@/components/workspace-context";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  return (
    <WorkspaceProvider workspaceId={workspaceId}>
      <AppShell>{children}</AppShell>
    </WorkspaceProvider>
  );
}
