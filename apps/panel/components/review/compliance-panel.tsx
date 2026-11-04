import { ArrowRight, CircleCheck, Wand2 } from "lucide-react";
import type { ComplianceCheck, QueueVariant } from "@/lib/api";
import { Card, Mono, StatusBadge } from "../ui";

function IssueCard({ check }: { check: ComplianceCheck }) {
  const blocked = check.result === "block";
  return (
    <li
      className={`rounded-control border-l-4 bg-canvas p-3 ${blocked ? "border-block-icon" : "border-review-icon"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          status={blocked ? "block" : "warn"}
          label={blocked ? "Impede a aprovação" : "Revisar"}
        />
        <p className="text-sm font-semibold text-ink">{check.ruleTitle}</p>
      </div>
      {check.evidence?.quote && (
        <p className="mt-2 text-sm italic text-ink">“{check.evidence.quote}”</p>
      )}
      {check.evidence?.explanation && (
        <p className="mt-1 text-sm text-ink-2">{check.evidence.explanation}</p>
      )}
      {check.evidence?.suggestion && (
        <p className="mt-2 rounded-control border border-pass-line bg-pass-bg p-2 text-sm text-pass">
          Sugestão: “{check.evidence.suggestion}”
        </p>
      )}
      <Mono className="mt-2 block text-ink-3">{check.sourceReference ?? check.ruleCode}</Mono>
    </li>
  );
}

export function CompliancePanel({ variant }: { variant: QueueVariant }) {
  const checks = variant.compliance?.checks ?? [];
  const issues = checks
    .filter((c) => c.result !== "pass")
    .sort((a, b) => (a.result === "block" ? -1 : 0) - (b.result === "block" ? -1 : 0));
  const autoFixes = checks.filter((c) => c.result === "pass" && c.evidence?.autoFix);
  const passed = checks.filter((c) => c.result === "pass");
  const blocks = issues.filter((c) => c.result === "block").length;

  const summary =
    blocks > 0
      ? {
          status: "block" as const,
          text: `${blocks === 1 ? "1 ponto impede" : `${blocks} pontos impedem`} a aprovação`,
        }
      : issues.length > 0
        ? {
            status: "warn" as const,
            text: `${issues.length === 1 ? "1 ponto" : `${issues.length} pontos`} para revisar`,
          }
        : { status: "pass" as const, text: "Sem alertas nas regras verificadas" };

  return (
    <Card className="p-5">
      <h3 className="text-base font-semibold">Verificação de publicidade médica</h3>
      <div className="mt-3">
        <StatusBadge status={summary.status} label={summary.text} />
      </div>

      {!variant.compliance && (
        <p className="mt-3 text-sm text-ink-2">Esta variante ainda não foi verificada.</p>
      )}

      {issues.length > 0 && (
        <ul className="mt-4 space-y-3">
          {issues.map((c) => (
            <IssueCard key={c.id} check={c} />
          ))}
        </ul>
      )}

      {autoFixes.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-ink-2">Ajustes feitos antes de chegar à fila</p>
          <ul className="mt-2 space-y-2">
            {autoFixes.map((c) => (
              <li key={c.id} className="rounded-control border border-line bg-canvas p-3 text-sm">
                <p className="flex items-center gap-1.5 font-semibold text-ink">
                  <Wand2 aria-hidden className="size-4 text-teal" />
                  {c.ruleTitle}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-ink-2">
                  <span className="line-through">“{c.evidence?.autoFix?.from}”</span>
                  <ArrowRight aria-hidden className="size-3.5" />
                  <span className="text-ink">“{c.evidence?.autoFix?.to}”</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {passed.length > 0 && (
        <details className="mt-4 group">
          <summary className="cursor-pointer text-sm font-semibold text-ink-2 hover:text-ink">
            {passed.length} {passed.length === 1 ? "regra sem alerta" : "regras sem alerta"}
          </summary>
          <ul className="mt-2 space-y-1.5">
            {passed.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-sm text-ink-2">
                <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-pass" />
                <span>
                  {c.ruleTitle} <Mono className="text-ink-3">· {c.sourceReference}</Mono>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="mt-5 border-t border-line pt-3 text-xs text-ink-2">
        Verificação automática de apoio. A decisão final e a responsabilidade pela publicação são
        suas.
        {variant.compliance && (
          <>
            {" "}
            Regras: <Mono>{variant.compliance.rulesetVersion}</Mono>
          </>
        )}
      </p>
    </Card>
  );
}
