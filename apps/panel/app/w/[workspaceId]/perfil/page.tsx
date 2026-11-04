"use client";

import { CircleAlert, Info, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button, Card, Field, Input, Mono, Select } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { ApiError, api, type ProfessionalProfile, type Specialty } from "@/lib/api";
import { signatureLine } from "@/lib/format";

const UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];

const EMPTY: ProfessionalProfile = {
  fullName: "",
  council: "CRM",
  councilNumber: "",
  councilUf: "SP",
  specialties: [{ name: "", rqe: "" }],
};

export default function ProfessionalProfilePage() {
  const { workspace, refresh } = useWorkspace();
  const [profile, setProfile] = useState<ProfessionalProfile>(
    workspace.professionalProfile ?? EMPTY,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const canEdit = workspace.role === "owner";

  const update = (patch: Partial<ProfessionalProfile>) => setProfile((p) => ({ ...p, ...patch }));
  const updateSpecialty = (index: number, patch: Partial<Specialty>) =>
    update({
      specialties: profile.specialties.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    });

  const specialties = profile.specialties.filter((s) => s.name.trim());
  const missingRqe = specialties.some((s) => !s.rqe?.trim());
  const preview = signatureLine({
    ...profile,
    fullName: profile.fullName || "Seu nome",
    councilNumber: profile.councilNumber || "000000",
    specialties: specialties.map((s) => ({ ...s, rqe: s.rqe?.trim() || null })),
  });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await api(`/v1/workspaces/${workspace.id}/professional-profile`, {
        method: "PUT",
        body: JSON.stringify({
          fullName: profile.fullName.trim(),
          council: profile.council,
          councilNumber: profile.councilNumber.trim(),
          councilUf: profile.councilUf,
          specialties: specialties.map((s) => ({
            name: s.name.trim(),
            rqe: s.rqe?.trim() || null,
          })),
        }),
      });
      await refresh();
      setMessage({
        kind: "ok",
        text: "Perfil salvo. Sua identificação será incluída em todos os posts.",
      });
    } catch (err) {
      setMessage({
        kind: "error",
        text:
          err instanceof ApiError && err.status === 400
            ? "Confira os campos: CRM e RQE aceitam só números."
            : "Não foi possível salvar. Tente de novo.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-semibold text-teal">Configuração do espaço</p>
        <h1 className="mt-1 text-[28px] font-bold leading-9 tracking-tight">
          Seu perfil profissional
        </h1>
        <p className="mt-1 text-ink-2">
          Usamos estes dados para incluir sua identificação em cada post, como pede a publicidade
          médica do CFM.
        </p>
      </div>

      <form onSubmit={onSubmit}>
        <Card className="space-y-5 p-6">
          <Field label="Nome completo (como aparece nos posts)">
            <Input
              value={profile.fullName}
              onChange={(e) => update({ fullName: e.target.value })}
              placeholder="Dra. Ana Souza"
              required
              disabled={!canEdit}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field label="Número do CRM" hint="Apenas números">
              <Input
                value={profile.councilNumber}
                onChange={(e) => update({ councilNumber: e.target.value.replace(/\D/g, "") })}
                inputMode="numeric"
                placeholder="123456"
                required
                disabled={!canEdit}
              />
            </Field>
            <Field label="UF">
              <Select
                value={profile.councilUf}
                onChange={(e) => update({ councilUf: e.target.value })}
                disabled={!canEdit}
              >
                {UFS.map((uf) => (
                  <option key={uf}>{uf}</option>
                ))}
              </Select>
            </Field>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold text-ink-2">Especialidades e RQE</legend>
            {profile.specialties.map((specialty, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id yet
              <div key={index} className="grid items-end gap-3 sm:grid-cols-[1fr_140px_40px]">
                <Field label={`Especialidade ${index + 1}`}>
                  <Input
                    value={specialty.name}
                    onChange={(e) => updateSpecialty(index, { name: e.target.value })}
                    placeholder="Endocrinologia e Metabologia"
                    disabled={!canEdit}
                  />
                </Field>
                <Field label="RQE">
                  <Input
                    value={specialty.rqe ?? ""}
                    onChange={(e) =>
                      updateSpecialty(index, { rqe: e.target.value.replace(/\D/g, "") })
                    }
                    inputMode="numeric"
                    placeholder="7890"
                    disabled={!canEdit}
                  />
                </Field>
                {canEdit && profile.specialties.length > 1 && (
                  <Button
                    variant="ghost"
                    className="px-0"
                    aria-label={`Remover especialidade ${index + 1}`}
                    onClick={() =>
                      update({ specialties: profile.specialties.filter((_, i) => i !== index) })
                    }
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                )}
              </div>
            ))}
            {canEdit && profile.specialties.length < 5 && (
              <Button
                variant="ghost"
                className="h-8 px-2 text-teal"
                onClick={() =>
                  update({ specialties: [...profile.specialties, { name: "", rqe: "" }] })
                }
              >
                <Plus aria-hidden className="size-4" />
                Adicionar especialidade
              </Button>
            )}
            {missingRqe && (
              <p className="flex gap-2 rounded-control border border-review-line bg-review-bg p-3 text-sm text-review">
                <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-review-icon" />
                Sem RQE, os posts não podem usar o título de especialista. Se mencionar
                pós-graduação, ela virá acompanhada de “não especialista”.
              </p>
            )}
          </fieldset>

          <div className="rounded-control border border-line bg-canvas p-4">
            <p className="text-xs font-semibold text-ink-2">Prévia da identificação nos posts</p>
            <Mono className="mt-2 block text-sm text-ink">{preview}</Mono>
            <p className="mt-2 flex gap-1.5 text-xs text-ink-2">
              <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />O CFM também pede estes dados
              na bio de cada rede. Confira a sua.
            </p>
          </div>

          {message && (
            <p
              role="status"
              className={`text-sm font-medium ${message.kind === "ok" ? "text-pass" : "text-block"}`}
            >
              {message.text}
            </p>
          )}

          {canEdit ? (
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Salvar perfil"}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-ink-2">
              Somente a proprietária do espaço pode alterar o perfil profissional.
            </p>
          )}
        </Card>
      </form>
    </div>
  );
}
