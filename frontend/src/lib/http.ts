/** Backend — geliştirmede Vite proxy (/api) kullanın; CORS ve PDF önizleme sorunlarını önler */
export const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (import.meta.env.DEV ? "/api" : "http://127.0.0.1:5000");

export class ApiError extends Error {
  constructor(
    message: string,
    public code: "BACKEND_OFFLINE" | "HTTP_ERROR" | "PARSE_ERROR"
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();

  if (trimmed.startsWith("<!") || trimmed.startsWith("<html")) {
    throw new ApiError(
      "Sunucu yanıt vermiyor. Backend'i başlatın: backend klasöründe python app.py",
      "BACKEND_OFFLINE"
    );
  }

  let data: T;
  try {
    data = trimmed ? (JSON.parse(trimmed) as T) : ({} as T);
  } catch {
    throw new ApiError(
      "Sunucudan geçersiz yanıt alındı. Backend çalışıyor mu kontrol edin.",
      "PARSE_ERROR"
    );
  }

  return data;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<{ data: T; res: Response }> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(
      "Sunucuya bağlanılamadı. Backend'i başlatın: cd backend → python app.py",
      "BACKEND_OFFLINE"
    );
  }

  const data = await parseJsonResponse<T>(res);
  return { data, res };
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { method: "GET" });
    if (!res.ok) return false;
    const data = await parseJsonResponse<{ ok?: boolean }>(res);
    return !!data.ok;
  } catch {
    return false;
  }
}

/** Ham SQL/teknik metinleri kullanıcıya göstermeden sadeleştirir */
export function sanitizeUserMessage(message: string): string {
  const m = message.trim();
  const lower = m.toLowerCase();
  if (
    lower.includes("violates not-null") ||
    lower.includes("student_id") ||
    lower.includes("relation ") ||
    lower.includes("line 1:") ||
    lower.includes("veritabanı hatası:") ||
    lower.includes("syntax error") ||
    lower.includes("psycopg2")
  ) {
    if (lower.includes("unique") || lower.includes("duplicate")) {
      return "Bu belge zaten kayıtlı.";
    }
    if (lower.includes("student_id")) {
      return "Belge kaydı tamamlanamadı. Ad soyadınızı kontrol edip tekrar deneyin.";
    }
    return "İşlem tamamlanamadı. Lütfen biraz sonra tekrar deneyin.";
  }
  return m;
}

export function getApiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return sanitizeUserMessage(error.message);
  return "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.";
}
