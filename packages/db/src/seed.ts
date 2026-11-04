import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  complianceChecks,
  complianceRules,
  complianceRuns,
  contentItems,
  contentVariants,
  verticals,
  verticalVersions,
} from "./schema/index.js";

/*
 * Development and test seed data. Run with the OWNER connection (it writes
 * platform config and bypasses RLS). Never run against production.
 *
 * The rule pack below is a DRAFT for building the UI and engine. It has not been
 * reviewed by a health-law specialist and must not be presented as legal advice.
 */

export const RULESET_VERSION = "medicina-br@draft-1";

const DRAFT_RULES = [
  {
    code: "CFM-IDENTIFICACAO",
    severity: "require_field",
    kind: "required_field",
    title: "Identificação profissional (nome, CRM/UF e RQE)",
    sourceReference: "CFM Res. 2.336/2023",
  },
  {
    code: "CFM-PROMESSA-RESULTADO",
    severity: "block",
    kind: "lexicon_llm",
    title: "Promessa ou garantia de resultado",
    sourceReference: "CFM Res. 2.336/2023",
  },
  {
    code: "CFM-SENSACIONALISMO",
    severity: "warn",
    kind: "llm_judge",
    title: "Sensacionalismo",
    sourceReference: "CFM Res. 2.336/2023",
  },
  {
    code: "CFM-AUTOPROMOCAO",
    severity: "warn",
    kind: "lexicon_llm",
    title: "Autopromoção e superlativos",
    sourceReference: "CFM Res. 2.336/2023",
  },
  {
    code: "CFM-HORMONIO-ESTETICO",
    severity: "hard_block",
    kind: "llm_judge",
    title: "Hormônios para fins estéticos ou de desempenho",
    sourceReference: "CFM Res. 2.333/2023",
  },
  {
    code: "ANVISA-MEDICAMENTO-PRESCRICAO",
    severity: "block",
    kind: "lexicon_llm",
    title: "Promoção de medicamento sob prescrição",
    sourceReference: "ANVISA RDC 96/2008",
  },
] as const;

type RuleCode = (typeof DRAFT_RULES)[number]["code"];

/** Creates the `medicina-br` vertical with the draft rule pack. Idempotent. */
export async function seedMedicinaVertical(owner: Database) {
  const [existing] = await owner.select().from(verticals).where(eq(verticals.slug, "medicina-br"));
  const vertical =
    existing ??
    (
      await owner
        .insert(verticals)
        .values({ slug: "medicina-br", country: "BR", language: "pt-BR", regulator: "CFM" })
        .returning()
    )[0];
  if (!vertical) throw new Error("Could not create vertical");

  const [version] = await owner
    .insert(verticalVersions)
    .values({
      verticalId: vertical.id,
      version: 1,
      config: { status: "draft_pending_legal_review" },
    })
    .onConflictDoNothing()
    .returning();

  const rules = {} as Record<RuleCode, string>;
  for (const rule of DRAFT_RULES) {
    await owner
      .insert(complianceRules)
      .values({
        verticalId: vertical.id,
        code: rule.code,
        version: 1,
        severity: rule.severity,
        kind: rule.kind,
        sourceReference: rule.sourceReference,
        definition: { title: rule.title, status: "draft_pending_legal_review" },
      })
      .onConflictDoNothing();
    const [row] = await owner
      .select({ id: complianceRules.id })
      .from(complianceRules)
      .where(and(eq(complianceRules.verticalId, vertical.id), eq(complianceRules.code, rule.code)));
    if (row) rules[rule.code] = row.id;
  }
  return { verticalId: vertical.id, verticalVersionId: version?.id, rules };
}

interface CheckSeed {
  rule: RuleCode;
  result: "pass" | "warn" | "block";
  evidence?: Record<string, unknown>;
}

interface VariantSeed {
  label: string;
  format: "carousel" | "reel" | "image";
  strategyTags: string[];
  body: Record<string, unknown>;
  checks: CheckSeed[];
}

const allPass = (except: RuleCode[] = []): CheckSeed[] =>
  DRAFT_RULES.filter((r) => !except.includes(r.code)).map((r) => ({
    rule: r.code,
    result: "pass",
  }));

const DEMO_ITEMS: { title: string; slotOffsetDays: number; variants: VariantSeed[] }[] = [
  {
    title: "5 mitos sobre a tireoide",
    slotOffsetDays: 2,
    variants: [
      {
        label: "Mito vs. fato",
        format: "carousel",
        strategyTags: ["hook:myth_vs_fact", "format:carousel", "cta:save"],
        body: {
          previewLine: "Você já ouviu que todo cansaço é “problema de tireoide”?",
          caption:
            "Você já ouviu que todo cansaço é “problema de tireoide”?\n\nNem sempre. A tireoide funciona como um termostato do corpo, e alguns sintomas podem ter outras causas. Um acompanhamento médico pode ajudar a entender o cansaço e investigar as causas com calma.\n\nSalve para consultar depois e compartilhe com quem precisa ler isso.",
          hashtags: ["#tireoide", "#endocrinologia", "#saudedamulher"],
          slides: [
            { n: 1, role: "hook", title: "5 mitos sobre a tireoide", body: "" },
            {
              n: 2,
              role: "point",
              title: "Mito 1: todo cansaço é tireoide",
              body: "O cansaço tem muitas causas. Exames e consulta ajudam a separar uma coisa da outra.",
            },
            {
              n: 3,
              role: "point",
              title: "Mito 2: hipotireoidismo sempre engorda",
              body: "O ganho de peso costuma ser pequeno. Hábitos e outras condições também contam.",
            },
            {
              n: 4,
              role: "point",
              title: "Mito 3: nódulo é sempre câncer",
              body: "A maioria dos nódulos é benigna. A avaliação define se precisa investigar mais.",
            },
            {
              n: 5,
              role: "point",
              title: "Mito 4: remédio para tireoide vicia",
              body: "Quando indicado, o tratamento repõe o que o corpo não produz. Não é vício.",
            },
            {
              n: 6,
              role: "point",
              title: "Mito 5: dá para ajustar a dose sozinha",
              body: "A dose depende de exames e acompanhamento. Nunca ajuste por conta própria.",
            },
            {
              n: 7,
              role: "cta",
              title: "Resumo",
              body: "Na dúvida, converse com seu médico. Salve este post para consultar depois.",
            },
          ],
          claims: [
            {
              text: "A maioria dos nódulos de tireoide é benigna.",
              citation: { label: "Referência a confirmar (diretriz da especialidade)" },
            },
          ],
        },
        checks: [
          ...allPass(["CFM-PROMESSA-RESULTADO"]),
          {
            rule: "CFM-PROMESSA-RESULTADO",
            result: "pass",
            evidence: {
              autoFix: { from: "cura o cansaço", to: "pode ajudar a entender o cansaço" },
              explanation:
                "A frase original prometia um resultado. Ela foi reescrita antes de chegar à fila.",
            },
          },
        ],
      },
      {
        label: "Estatística",
        format: "carousel",
        strategyTags: ["hook:stat", "format:carousel", "cta:save"],
        body: {
          previewLine: "Muitas pessoas convivem com alterações da tireoide sem saber.",
          caption:
            "Muitas pessoas convivem com alterações da tireoide sem saber. Neste carrossel eu explico os sinais mais comuns e quando vale procurar avaliação. Aqui você encontra o melhor tratamento para a sua tireoide.\n\nSalve para consultar depois.",
          hashtags: ["#tireoide", "#endocrinologia"],
          slides: [
            { n: 1, role: "hook", title: "Sua tireoide pode estar dando sinais", body: "" },
            {
              n: 2,
              role: "point",
              title: "Sinais comuns",
              body: "Cansaço, intestino preso, pele seca e frio fora do normal podem ter relação.",
            },
            {
              n: 3,
              role: "cta",
              title: "Quando procurar avaliação",
              body: "Se os sinais persistem, converse com seu médico e faça os exames indicados.",
            },
          ],
          claims: [],
        },
        checks: [
          ...allPass(["CFM-AUTOPROMOCAO"]),
          {
            rule: "CFM-AUTOPROMOCAO",
            result: "warn",
            evidence: {
              quote: "o melhor tratamento",
              explanation:
                "Superlativos sobre o próprio serviço podem ser entendidos como autopromoção.",
              suggestion: "um tratamento indicado para o seu caso",
            },
          },
        ],
      },
      {
        label: "História do consultório",
        format: "carousel",
        strategyTags: ["hook:story", "format:carousel", "cta:comment"],
        body: {
          previewLine: "Uma paciente chegou exausta ao consultório.",
          caption:
            "Uma paciente chegou exausta ao consultório. Com o protocolo certo, este tratamento cura o cansaço em poucas semanas.\n\nComente se você já passou por isso.",
          hashtags: ["#tireoide"],
          slides: [
            { n: 1, role: "hook", title: "Ela vivia exausta", body: "" },
            {
              n: 2,
              role: "point",
              title: "O que mudou",
              body: "Com o protocolo certo, este tratamento cura o cansaço em poucas semanas.",
            },
          ],
          claims: [],
        },
        checks: [
          ...allPass(["CFM-PROMESSA-RESULTADO"]),
          {
            rule: "CFM-PROMESSA-RESULTADO",
            result: "block",
            evidence: {
              quote: "cura o cansaço em poucas semanas",
              slide: 2,
              explanation: "Promete um resultado de tratamento. Reescreva antes de aprovar.",
              suggestion: "pode ajudar a investigar as causas do cansaço",
            },
          },
        ],
      },
    ],
  },
  {
    title: "Menopausa: o que é normal sentir?",
    slotOffsetDays: 4,
    variants: [
      {
        label: "Pergunta",
        format: "carousel",
        strategyTags: ["hook:question", "format:carousel", "cta:save"],
        body: {
          previewLine: "Calor, insônia, irritação: o que é normal na menopausa?",
          caption:
            "Calor, insônia, irritação: o que é normal na menopausa? Neste carrossel eu explico os sintomas mais comuns e quando conversar com o seu médico sobre opções de cuidado.\n\nSalve para consultar depois.",
          hashtags: ["#menopausa", "#endocrinologia", "#saudedamulher"],
          slides: [
            { n: 1, role: "hook", title: "O que é normal sentir na menopausa?", body: "" },
            {
              n: 2,
              role: "point",
              title: "Sintomas comuns",
              body: "Ondas de calor, alterações do sono e do humor são frequentes e variam muito.",
            },
            {
              n: 3,
              role: "cta",
              title: "Converse com seu médico",
              body: "Cada caso é único. A avaliação define o cuidado mais adequado para você.",
            },
          ],
          claims: [],
        },
        checks: allPass(),
      },
    ],
  },
  {
    title: "Cansaço constante pode ser a tireoide?",
    slotOffsetDays: 6,
    variants: [
      {
        label: "Roteiro de reel",
        format: "reel",
        strategyTags: ["hook:question", "format:reel"],
        body: {
          previewLine: "Você acorda cansada mesmo dormindo 8 horas?",
          caption:
            "Você acorda cansada mesmo dormindo 8 horas? O segredo que ninguém te conta sobre a tireoide está neste vídeo.",
          hashtags: ["#tireoide", "#cansaco"],
          script: [
            {
              t: "0–3 s",
              say: "Você acorda cansada mesmo dormindo 8 horas?",
              onScreen: "Cansaço todo dia?",
            },
            {
              t: "3–25 s",
              say: "A tireoide é uma das causas possíveis, mas não a única. Sono, alimentação e outras condições também contam.",
              onScreen: "Várias causas possíveis",
            },
            {
              t: "25–40 s",
              say: "Se o cansaço persiste, procure avaliação para investigar com calma.",
              onScreen: "Procure avaliação",
            },
          ],
          claims: [],
        },
        checks: [
          ...allPass(["CFM-SENSACIONALISMO"]),
          {
            rule: "CFM-SENSACIONALISMO",
            result: "warn",
            evidence: {
              quote: "O segredo que ninguém te conta",
              explanation:
                "Frases de “segredo revelado” tendem a ser vistas como sensacionalistas.",
              suggestion: "O que vale saber sobre a tireoide",
            },
          },
        ],
      },
    ],
  },
];

/** Adds fictional review-queue content to a workspace (status in_review). */
export async function seedDemoReviewQueue(owner: Database, workspaceId: string) {
  const { rules } = await seedMedicinaVertical(owner);
  const createdIds: string[] = [];

  for (const item of DEMO_ITEMS) {
    const slot = new Date();
    slot.setUTCDate(slot.getUTCDate() + item.slotOffsetDays);
    slot.setUTCHours(22, 0, 0, 0); // 19:00 in São Paulo

    const contentItemId = randomUUID();
    createdIds.push(contentItemId);
    await owner.insert(contentItems).values({
      id: contentItemId,
      workspaceId,
      title: item.title,
      status: "in_review",
      strategyTags: item.variants[0]?.strategyTags ?? [],
      suggestedSlot: slot,
      createdBy: "system:seed",
    });

    for (const variant of item.variants) {
      const variantId = randomUUID();
      const worst = variant.checks.some((c) => c.result === "block")
        ? "block"
        : variant.checks.some((c) => c.result === "warn")
          ? "warn"
          : "pass";
      await owner.insert(contentVariants).values({
        id: variantId,
        workspaceId,
        contentItemId,
        platform: "instagram",
        format: variant.format,
        body: { label: variant.label, strategyTags: variant.strategyTags, ...variant.body },
        complianceStatus: worst,
      });
      const runId = randomUUID();
      await owner.insert(complianceRuns).values({
        id: runId,
        workspaceId,
        variantId,
        trigger: "generated",
        rulesetVersion: RULESET_VERSION,
        decision: worst === "pass" ? "pass" : worst === "warn" ? "review" : "block",
      });
      for (const check of variant.checks) {
        await owner.insert(complianceChecks).values({
          workspaceId,
          runId,
          ruleId: rules[check.rule],
          ruleVersion: 1,
          result: check.result,
          confidence: check.result === "pass" ? 0.97 : 0.86,
          evidence: check.evidence ?? null,
        });
      }
    }
  }
  return { contentItemIds: createdIds };
}
