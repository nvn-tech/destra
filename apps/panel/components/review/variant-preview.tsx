"use client";

import { ChevronLeft, ChevronRight, Quote } from "lucide-react";
import { useState } from "react";
import type { ProfessionalProfile, QueueVariant } from "@/lib/api";
import { signatureLine, wordCount } from "@/lib/format";
import { Card, Mono, StatusBadge } from "../ui";
import { type Flag, Highlighted } from "./highlight";

const MAX_WORDS_PER_SLIDE = 25;
const MAX_PREVIEW_CHARS = 110;

export function flagsFor(variant: QueueVariant): Flag[] {
  return (variant.compliance?.checks ?? [])
    .filter((c) => c.result !== "pass" && c.evidence?.quote)
    .map((c) => ({
      quote: c.evidence?.quote ?? "",
      status: c.result === "block" ? "block" : "warn",
    }));
}

export function VariantPreview({
  variant,
  profile,
}: {
  variant: QueueVariant;
  profile: ProfessionalProfile | null;
}) {
  const flags = flagsFor(variant);
  const body = variant.body;
  const signature = profile ? signatureLine(profile) : null;
  const firstLine = body.previewLine ?? body.caption.split("\n")[0] ?? "";

  return (
    <div className="space-y-4">
      {body.slides && body.slides.length > 0 && (
        <SlidePreview variant={variant} flags={flags} signature={signature} />
      )}
      {body.script && body.script.length > 0 && (
        <Card className="p-5">
          <h3 className="text-base font-semibold">Roteiro do reel</h3>
          <ol className="mt-3 divide-y divide-line">
            {body.script.map((beat) => (
              <li key={beat.t} className="grid gap-1 py-3 sm:grid-cols-[72px_1fr]">
                <Mono className="text-ink-2">{beat.t}</Mono>
                <div>
                  <p className="text-ink">
                    <Highlighted text={beat.say} flags={flags} />
                  </p>
                  {beat.onScreen && (
                    <p className="mt-1 text-xs text-ink-2">Texto na tela: {beat.onScreen}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold">Legenda</h3>
          <span
            className={`text-xs ${firstLine.length > MAX_PREVIEW_CHARS ? "font-semibold text-review" : "text-ink-2"}`}
          >
            Primeira linha: {firstLine.length}/{MAX_PREVIEW_CHARS} caracteres
          </span>
        </div>
        <p className="mt-3 whitespace-pre-line text-ink">
          <Highlighted text={body.caption} flags={flags} />
        </p>
        {body.hashtags && body.hashtags.length > 0 && (
          <p className="mt-3 text-sm font-medium text-teal">{body.hashtags.join(" ")}</p>
        )}
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-xs font-semibold text-ink-2">Identificação incluída automaticamente</p>
          {signature ? (
            <Mono className="mt-1 block text-ink">{signature}</Mono>
          ) : (
            <p className="mt-1 text-sm text-review">
              Complete o perfil profissional para incluir CRM e RQE.
            </p>
          )}
        </div>
      </Card>

      {body.claims && body.claims.length > 0 && (
        <Card className="p-5">
          <h3 className="text-base font-semibold">Afirmações e referências</h3>
          <ul className="mt-3 space-y-3">
            {body.claims.map((claim) => (
              <li key={claim.text} className="flex gap-2 text-sm">
                <Quote aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" />
                <div>
                  <p className="text-ink">{claim.text}</p>
                  <p className="mt-0.5 text-xs text-ink-2">
                    {claim.citation?.url ? (
                      <a
                        href={claim.citation.url}
                        className="underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {claim.citation.label}
                      </a>
                    ) : (
                      (claim.citation?.label ?? "Sem referência")
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function SlidePreview({
  variant,
  flags,
  signature,
}: {
  variant: QueueVariant;
  flags: Flag[];
  signature: string | null;
}) {
  const slides = variant.body.slides ?? [];
  const [index, setIndex] = useState(0);
  const slide = slides[Math.min(index, slides.length - 1)];
  if (!slide) return null;
  const words = wordCount(`${slide.title} ${slide.body}`);
  const slideFlags = (n: number) => {
    const s = slides.find((x) => x.n === n);
    const text = `${s?.title ?? ""} ${s?.body ?? ""}`.toLowerCase();
    return flags.filter((f) => text.includes(f.quote.toLowerCase()));
  };
  const current = slideFlags(slide.n);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">
          Slide {index + 1} de {slides.length}
        </h3>
        <span
          className={`text-xs ${words > MAX_WORDS_PER_SLIDE ? "font-semibold text-review" : "text-ink-2"}`}
        >
          {words}/{MAX_WORDS_PER_SLIDE} palavras
        </span>
      </div>

      <div className="mx-auto mt-4 flex aspect-[4/5] max-w-sm flex-col justify-between rounded-panel bg-pine p-7 text-white">
        <div>
          {current.length > 0 && (
            <span className="mb-3 inline-block rounded-full bg-white px-2 py-0.5">
              <StatusBadge
                status={current.some((f) => f.status === "block") ? "block" : "warn"}
                label="Trecho sinalizado"
              />
            </span>
          )}
          <p
            className={`font-bold leading-tight ${slide.role === "hook" ? "text-3xl" : "text-xl"}`}
          >
            <Highlighted text={slide.title} flags={flags} />
          </p>
          {slide.body && (
            <p className="mt-4 text-base leading-relaxed text-white/90">
              <Highlighted text={slide.body} flags={flags} />
            </p>
          )}
        </div>
        <p className="border-t border-white/20 pt-3 font-mono text-xs text-white/80">
          {signature ?? "Identificação pendente"}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          aria-label="Slide anterior"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
          className="grid size-9 place-items-center rounded-control border border-line hover:bg-subtle disabled:opacity-40"
        >
          <ChevronLeft aria-hidden className="size-4" />
        </button>
        <div className="flex gap-1.5">
          {slides.map((s, i) => {
            const f = slideFlags(s.n);
            const color = f.some((x) => x.status === "block")
              ? "bg-block-icon"
              : f.length
                ? "bg-review-icon"
                : i === index
                  ? "bg-pine"
                  : "bg-line-strong";
            return (
              <button
                key={s.n}
                type="button"
                aria-label={`Ir para o slide ${i + 1}${f.length ? " (com trecho sinalizado)" : ""}`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => setIndex(i)}
                className={`h-2 rounded-full transition-all ${i === index ? "w-6" : "w-2"} ${color}`}
              />
            );
          })}
        </div>
        <button
          type="button"
          aria-label="Próximo slide"
          disabled={index === slides.length - 1}
          onClick={() => setIndex(index + 1)}
          className="grid size-9 place-items-center rounded-control border border-line hover:bg-subtle disabled:opacity-40"
        >
          <ChevronRight aria-hidden className="size-4" />
        </button>
      </div>
    </Card>
  );
}
