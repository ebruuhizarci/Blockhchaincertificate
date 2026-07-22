import { apiFetch, getApiErrorMessage } from "./http";

const STORAGE_KEY = "etherdocs_institution";
const TOKEN_KEY = "etherdocs_institution_token";

export type Institution = {
  id: number;
  code: string;
  name: string;
};

type InstitutionAuthResponse = {
  message?: string;
  token?: string;
  institution: Institution;
  error?: string;
};

export function getStoredInstitution(): Institution | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const inst = raw ? (JSON.parse(raw) as Institution) : null;
    if (inst && !getInstitutionToken()) {
      setStoredInstitution(null);
      return null;
    }
    return inst;
  } catch {
    return null;
  }
}

export function getInstitutionToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredInstitution(inst: Institution | null): void {
  if (inst) localStorage.setItem(STORAGE_KEY, JSON.stringify(inst));
  else localStorage.removeItem(STORAGE_KEY);
}

export function setInstitutionToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function institutionAuthHeaders(): Record<string, string> {
  const token = getInstitutionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
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

    if (!data.token) {
      throw new Error("Kurum oturum jetonu alınamadı.");
    }

    setStoredInstitution(data.institution);
    setInstitutionToken(data.token);
    return data.institution;
  } catch (e) {
    throw new Error(getApiErrorMessage(e));
  }
}

export async function logoutInstitutionApi(): Promise<void> {
  const token = getInstitutionToken();
  if (token) {
    try {
      await apiFetch("/auth/institution/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      /* offline logout */
    }
  }
  setStoredInstitution(null);
  setInstitutionToken(null);
}

export function logoutInstitution(): void {
  void logoutInstitutionApi();
}
