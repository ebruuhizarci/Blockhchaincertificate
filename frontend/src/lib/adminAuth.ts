import { apiFetch, getApiErrorMessage } from "./http";

const ADMIN_TOKEN_KEY = "etherdocs_admin_token";

type AdminLoginResponse = {
  token?: string;
  error?: string;
};

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string | null): void {
  if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
  else localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export async function adminLogin(email: string, password: string): Promise<void> {
  try {
    const { data, res } = await apiFetch<AdminLoginResponse>("/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok || !data.token) {
      throw new Error(data.error ?? "Admin girişi başarısız.");
    }
    setAdminToken(data.token);
  } catch (e) {
    throw new Error(getApiErrorMessage(e));
  }
}

export function adminLogout(): void {
  setAdminToken(null);
}
