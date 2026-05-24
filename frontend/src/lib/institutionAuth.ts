import { apiFetch, getApiErrorMessage } from "./http";

const STORAGE_KEY = "etherdocs_institution";

export type Institution = {
  id: number;
  code: string;
  name: string;
};

type InstitutionAuthResponse = {
  message?: string;
  institution: Institution;
  error?: string;
};

export function getStoredInstitution(): Institution | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Institution) : null;
  } catch {
    return null;
  }
}

export function setStoredInstitution(inst: Institution | null): void {
  if (inst) localStorage.setItem(STORAGE_KEY, JSON.stringify(inst));
  else localStorage.removeItem(STORAGE_KEY);
}

export async function loginInstitution(
  code: string,
  password: string
): Promise<Institution> {
  try {
    const { data, res } = await apiFetch<InstitutionAuthResponse>(
      "/auth/institution/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, password }),
      }
    );

    if (!res.ok) {
      throw new Error(data.error ?? "Kurum girişi başarısız.");
    }

    setStoredInstitution(data.institution);
    return data.institution;
  } catch (e) {
    throw new Error(getApiErrorMessage(e));
  }
}

export function logoutInstitution(): void {
  setStoredInstitution(null);
}
