import { apiFetch, API_BASE, getApiErrorMessage } from "./http";

const STORAGE_KEY = "etherdocs_user";

export type User = {
  id: number;
  email: string;
  full_name: string;
};

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: User | null): void {
  if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  else localStorage.removeItem(STORAGE_KEY);
}

type AuthResponse = {
  message?: string;
  user: User;
  error?: string;
};

export async function registerUser(
  email: string,
  password: string,
  fullName: string
): Promise<User> {
  try {
    const { data, res } = await apiFetch<AuthResponse>("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        full_name: fullName,
      }),
    });

    if (!res.ok) {
      throw new Error(data.error ?? "Kayıt işlemi başarısız oldu.");
    }

    setStoredUser(data.user);
    return data.user;
  } catch (e) {
    throw new Error(getApiErrorMessage(e));
  }
}

export async function loginUser(
  email: string,
  password: string
): Promise<User> {
  try {
    const { data, res } = await apiFetch<AuthResponse>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      throw new Error(data.error ?? "E-posta veya şifre hatalı.");
    }

    setStoredUser(data.user);
    return data.user;
  } catch (e) {
    throw new Error(getApiErrorMessage(e));
  }
}

export function logoutUser(): void {
  setStoredUser(null);
}

export { API_BASE };
