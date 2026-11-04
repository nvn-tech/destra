import {
  ArrowRight,
  BadgeCheck,
  CircleAlert,
  CirclePause,
  ClipboardCheck,
  FileClock,
  type LucideIcon,
  Mic,
  OctagonX,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo, Mono, StatusBadge } from "@/components/ui";

export const metadata: Metadata = {
  title: "Destra · Conteúdo médico para Instagram, no seu tom",
  description:
    "A Destra sugere posts no seu tom e verifica cada texto contra as regras de publicidade médica antes de você aprovar.",
};

/*
 * Values the business still has to confirm before this page goes public.
 * The bracketed placeholders are shown on purpose so they can't ship unnoticed.
 */
const COMPANY = { legalName: "[Razão social]", cnpj: "[CNPJ]", city: "[Cidade/UF]" };

const PLANS = [
  {
    name: "Individual",
    audience: "1 profissional",
    price: "R$ 197",
    period: "/mês",
    features: [
      "Instagram conectado",
      "Sugestões de posts no seu tom",
      "Verificação de publicidade médica em cada texto",
      "CRM e RQE incluídos automaticamente",
      "Histórico de aprovações",
    ],
    cta: "Criar conta",
    highlight: false,
  },
  {
    name: "Clínica",
    audience: "Até 3 profissionais",
    price: "R$ 497",
    period: "/mês",
    features: [
      "Tudo do plano Individual",
      "Um espaço por profissional",
      "Papéis de equipe: edição, aprovação e leitura",
      "Relatório de verificação por post",
    ],
    cta: "Criar conta",
    highlight: true,
  },
  {
    name: "Redes e hospitais",
    audience: "Sob medida",
    price: "Sob consulta",
    period: "",
    features: [
      "Vários espaços e equipes",
      "Integração com seus fluxos de aprovação",
      "Contrato e DPA sob medida",
    ],
    cta: "Falar com a equipe",
    highlight: false,
  },
];

const CHECKS: { title: string; detail: string; source: string }[] = [
  {
    title: "Identificação profissional",
    detail: "Nome, CRM/UF e RQE em todo post; especialidade só com RQE.",
    source: "CFM Res. 2.336/2023",
  },
  {
    title: "Promessa de resultado",
    detail: "Frases que garantem cura ou resultado são sinalizadas e reescritas.",
    source: "CFM Res. 2.336/2023",
  },
  {
    title: "Sensacionalismo e autopromoção",
    detail: "“Segredo revelado”, superlativos e comparações com colegas.",
    source: "CFM Res. 2.336/2023",
  },
  {
    title: "Hormônios para fins estéticos",
    detail: "Conteúdo que associa hormônios a estética ou desempenho é bloqueado.",
    source: "CFM Res. 2.333/2023",
  },
  {
    title: "Medicamentos sob prescrição",
    detail: "Promoção de medicamentos ao público é sinalizada.",
    source: "ANVISA RDC 96/2008",
  },
  {
    title: "Imagens de pacientes",
    detail: "Antes e depois e pacientes identificáveis exigem cuidado e consentimento.",
    source: "CFM Res. 2.336/2023",
  },
];

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: UserRoundCheck,
    title: "Conecte seu Instagram",
    text: "Pelo login do Facebook, com sua conta profissional ligada a uma Página. Você informa CRM e RQE uma vez.",
  },
  {
    icon: Mic,
    title: "Ensine o seu tom",
    text: "Grave 2 minutos explicando um tema como faria no consultório, ou deixe a Destra ler seus posts anteriores.",
  },
  {
    icon: Sparkles,
    title: "Revise as sugestões",
    text: "Cada ideia chega em até três variantes, com os trechos sinalizados, o motivo e uma sugestão de ajuste.",
  },
  {
    icon: ClipboardCheck,
    title: "Aprove e acompanhe",
    text: "Você aprova post a post. Depois, vê o que funcionou comparado com a sua própria média.",
  },
];

const CONTROLS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: BadgeCheck,
    title: "Aprovação post a post",
    text: "Cada publicação exige a sua aprovação e a confirmação de que você revisou o conteúdo.",
  },
  {
    icon: CirclePause,
    title: "Pausa em um clique",
    text: "Um botão interrompe todas as publicações agendadas até você retomar.",
  },
  {
    icon: FileClock,
    title: "Histórico de aprovações",
    text: "Quem aprovou, quando e quais regras foram verificadas ficam registrados e não podem ser alterados.",
  },
  {
    icon: ShieldCheck,
    title: "Seus dados protegidos",
    text: "Tratamento conforme a LGPD. Seus dados não são vendidos e você pode excluí-los quando quiser.",
  },
];

function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 px-4 py-20">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold text-teal">{eyebrow}</p>
        <h2 className="mt-2 max-w-3xl text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          {title}
        </h2>
        {intro && <p className="mt-3 max-w-2xl text-base leading-7 text-ink-2">{intro}</p>}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

function ExampleCard() {
  return (
    <div className="rounded-panel border border-line bg-card p-5 shadow-overlay">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">Verificação de um rascunho</p>
        <span className="rounded-full bg-subtle px-2 py-0.5 text-xs font-medium text-ink-2">
          Exemplo ilustrativo
        </span>
      </div>

      <div className="mt-4 rounded-control border border-block-line bg-block-bg p-4">
        <StatusBadge status="block" label="Impede a aprovação" />
        <p className="mt-3 text-sm leading-6 text-ink">
          “Quer secar a barriga em 30 dias? Veja o{" "}
          <mark className="bg-flag px-0.5 underline decoration-flag-line decoration-2 underline-offset-4">
            antes e depois
          </mark>{" "}
          da minha paciente que usou nosso{" "}
          <mark className="bg-flag px-0.5 underline decoration-flag-line decoration-2 underline-offset-4">
            protocolo hormonal
          </mark>
          .”
        </p>
        <ul className="mt-3 space-y-1 text-xs text-block">
          <li className="flex gap-1.5">
            <OctagonX aria-hidden className="size-3.5 shrink-0" /> Hormônios para fins estéticos ·
            CFM Res. 2.333/2023
          </li>
          <li className="flex gap-1.5">
            <OctagonX aria-hidden className="size-3.5 shrink-0" /> Promessa de resultado · CFM Res.
            2.336/2023
          </li>
          <li className="flex gap-1.5">
            <CircleAlert aria-hidden className="size-3.5 shrink-0" /> Imagem de paciente · exige
            condições e consentimento
          </li>
        </ul>
      </div>

      <div className="mt-3 rounded-control border border-pass-line bg-pass-bg p-4">
        <StatusBadge status="pass" label="Sugestão de reescrita" />
        <p className="mt-3 text-sm leading-6 text-ink">
          “O peso responde a muitos fatores, e os hormônios são só uma parte da história. Neste
          carrossel eu explico o que os exames mostram e quando vale investigar.”
        </p>
        <Mono className="mt-3 block text-ink-2">Dra. Ana Souza | CRM-SP 123456 | RQE 7890</Mono>
      </div>

      <p className="mt-3 text-xs text-ink-2">
        A verificação é um apoio. A decisão e a responsabilidade pela publicação são sempre suas.
      </p>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" aria-label="Destra, início">
            <Logo />
          </Link>
          <nav aria-label="Seções" className="hidden gap-6 text-sm font-medium text-ink-2 md:flex">
            <a href="#como-funciona" className="hover:text-ink">
              Como funciona
            </a>
            <a href="#verificacao" className="hover:text-ink">
              O que verificamos
            </a>
            <a href="#controle" className="hover:text-ink">
              Controle
            </a>
            <a href="#planos" className="hover:text-ink">
              Planos
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/entrar"
              className="rounded-control px-3 py-2 text-sm font-semibold text-pine hover:bg-subtle"
            >
              Entrar
            </Link>
            <Link
              href="/entrar?modo=criar"
              className="rounded-control bg-pine px-4 py-2 text-sm font-semibold text-white hover:bg-pine-hover"
            >
              Criar conta
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="px-4 pb-20 pt-16 sm:pt-24">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <p className="inline-flex rounded-full border border-line bg-card px-3 py-1 text-sm font-medium text-ink-2">
                Para médicas e médicos · Instagram
              </p>
              <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight text-ink sm:text-5xl">
                Cresça no Instagram sem abrir mão da ética médica.
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-8 text-ink-2">
                A Destra aprende o seu jeito de explicar, sugere carrosséis e roteiros, e verifica
                cada texto contra as regras de publicidade do CFM. Nada é publicado sem a sua
                aprovação.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/entrar?modo=criar"
                  className="inline-flex h-12 items-center gap-2 rounded-control bg-pine px-5 font-semibold text-white hover:bg-pine-hover"
                >
                  Criar conta
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
                <a
                  href="#como-funciona"
                  className="inline-flex h-12 items-center rounded-control border border-line bg-card px-5 font-semibold text-pine hover:border-line-strong"
                >
                  Ver como funciona
                </a>
              </div>
              <ul className="mt-10 grid max-w-xl gap-3 text-sm text-ink-2 sm:grid-cols-2">
                {[
                  "CRM e RQE em todo post",
                  "Você aprova cada publicação",
                  "Pausa de publicações em um clique",
                  "Dados tratados conforme a LGPD",
                ].map((fact) => (
                  <li key={fact} className="flex items-center gap-2">
                    <BadgeCheck aria-hidden className="size-4 shrink-0 text-teal" />
                    {fact}
                  </li>
                ))}
              </ul>
            </div>
            <ExampleCard />
          </div>
        </section>

        <div className="border-y border-line bg-card">
          <Section
            id="como-funciona"
            eyebrow="Como funciona"
            title="Do seu conhecimento ao post pronto, em quatro etapas."
            intro="Feito para quem não tem tempo de escrever do zero e não quer arriscar a reputação construída em anos de formação."
          >
            <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <li key={step.title} className="rounded-panel border border-line bg-canvas p-5">
                    <div className="flex items-center justify-between">
                      <span className="grid size-10 place-items-center rounded-control bg-pine-soft text-pine">
                        <Icon aria-hidden className="size-5" />
                      </span>
                      <Mono className="text-ink-3">0{i + 1}</Mono>
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-ink">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-ink-2">{step.text}</p>
                  </li>
                );
              })}
            </ol>
          </Section>
        </div>

        <Section
          id="verificacao"
          eyebrow="O que verificamos"
          title="Regras de publicidade médica, aplicadas a cada texto."
          intro="Cada sugestão passa por uma verificação baseada nas resoluções do CFM e nas normas da ANVISA. O que precisa de atenção aparece destacado, com o motivo."
        >
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {CHECKS.map((check) => (
              <li
                key={check.title}
                className="rounded-panel border border-line bg-card p-5 shadow-card"
              >
                <h3 className="font-semibold text-ink">{check.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-2">{check.detail}</p>
                <Mono className="mt-3 block text-ink-3">{check.source}</Mono>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-ink-2">
            Em breve para outras profissões regulamentadas: odontologia, nutrição, psicologia,
            fisioterapia e advocacia.
          </p>
        </Section>

        <div className="border-y border-line bg-card">
          <Section
            id="controle"
            eyebrow="Você no controle"
            title="A ferramenta sugere. Quem decide é você."
          >
            <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {CONTROLS.map((control) => {
                const Icon = control.icon;
                return (
                  <li
                    key={control.title}
                    className="rounded-panel border border-line bg-canvas p-5"
                  >
                    <Icon aria-hidden className="size-6 text-teal" />
                    <h3 className="mt-3 font-semibold text-ink">{control.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-ink-2">{control.text}</p>
                  </li>
                );
              })}
            </ul>
          </Section>
        </div>

        <Section id="planos" eyebrow="Planos" title="Planos para consultórios e clínicas.">
          <ul className="grid gap-4 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <li
                key={plan.name}
                className={`flex flex-col rounded-panel border bg-card p-6 shadow-card ${plan.highlight ? "border-pine ring-1 ring-pine" : "border-line"}`}
              >
                <p className="text-sm font-semibold text-teal">{plan.audience}</p>
                <h3 className="mt-1 text-xl font-bold text-ink">{plan.name}</h3>
                <p className="mt-4">
                  <span className="text-3xl font-bold text-ink">{plan.price}</span>
                  <span className="text-ink-2">{plan.period}</span>
                </p>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm text-ink-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <BadgeCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-teal" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/entrar?modo=criar"
                  className={`mt-8 inline-flex h-11 items-center justify-center rounded-control font-semibold ${
                    plan.highlight
                      ? "bg-pine text-white hover:bg-pine-hover"
                      : "border border-line text-pine hover:border-line-strong"
                  }`}
                >
                  {plan.cta}
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        <section className="bg-pine px-4 py-20 text-white">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Sua reputação levou anos para ser construída.
            </h2>
            <p className="mt-4 text-lg leading-8 text-white/85">
              Publique com constância, no seu tom, revisando cada post antes que ele vá ao ar.
            </p>
            <Link
              href="/entrar?modo=criar"
              className="mt-8 inline-flex h-12 items-center gap-2 rounded-control bg-white px-6 font-semibold text-pine hover:bg-pine-soft"
            >
              Criar conta
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-card px-4 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 text-sm text-ink-2 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-3">
              Conteúdo para redes sociais com verificação de publicidade para profissionais
              regulamentados.
            </p>
          </div>
          <div>
            <p className="font-semibold text-ink">
              {COMPANY.legalName} · CNPJ {COMPANY.cnpj}
            </p>
            <p className="mt-1">{COMPANY.city}</p>
            <p className="mt-3">
              © 2026 Destra. A verificação automática não substitui a avaliação profissional nem a
              orientação jurídica.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
