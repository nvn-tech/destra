import type { ProfessionalProfile } from "./api";

/** "ter., 12 nov. · 19:00" in the workspace's time zone. */
export function formatSlot(iso: string | null, timeZone: string): string {
  if (!iso) return "Sem horário sugerido";
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).format(date);
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
  return `${day} · ${time}`;
}

/** Mandatory identification line, built from the profile (never written by the AI). */
export function signatureLine(profile: ProfessionalProfile): string {
  const rqes = profile.specialties
    .filter((s) => s.rqe)
    .map((s) => `RQE ${s.rqe}`)
    .join(" · ");
  return [
    profile.fullName,
    `${profile.council}-${profile.councilUf} ${profile.councilNumber}`,
    rqes,
  ]
    .filter(Boolean)
    .join(" | ");
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

const FORMAT_LABELS: Record<string, string> = {
  carousel: "Carrossel",
  reel: "Reel",
  image: "Imagem",
  video: "Vídeo",
};

export function formatLabel(format: string): string {
  return FORMAT_LABELS[format] ?? format;
}

const TAG_LABELS: Record<string, string> = {
  "hook:myth_vs_fact": "Mito vs. fato",
  "hook:stat": "Estatística",
  "hook:question": "Pergunta",
  "hook:story": "História",
  "cta:save": "CTA: salvar",
  "cta:comment": "CTA: comentar",
};

/** Human labels for strategy tags; format tags are shown elsewhere. */
export function strategyLabels(tags: string[] = []): string[] {
  return tags.filter((t) => !t.startsWith("format:")).map((t) => TAG_LABELS[t] ?? t);
}
