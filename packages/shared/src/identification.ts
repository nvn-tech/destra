/**
 * Mandatory identification on every post (CFM Res. 2.336/2023): name, council
 * registration with state, and RQE for each specialty claimed. Built by code from
 * the professional profile, never written by the AI. The review preview and the
 * published post both use this function.
 */
export interface IdentificationProfile {
  fullName: string;
  council: string;
  councilNumber: string;
  councilUf: string;
  specialties: { name: string; rqe: string | null }[];
}

export function signatureLine(profile: IdentificationProfile): string {
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
