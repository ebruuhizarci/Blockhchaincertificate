import { API_BASE } from "./http";

export type DocumentViewAccess = {
  userEmail?: string;
  uploaderName?: string;
  institutionCode?: string;
};

export function getDocumentFileUrl(
  docId: number,
  access?: DocumentViewAccess
): string {
  const params = new URLSearchParams();
  if (access?.userEmail?.trim()) {
    params.set("user_email", access.userEmail.trim());
  }
  if (access?.uploaderName?.trim()) {
    params.set("uploader_name", access.uploaderName.trim());
  }
  if (access?.institutionCode?.trim()) {
    params.set("institution_code", access.institutionCode.trim());
  }
  const q = params.toString();
  return `${API_BASE}/documents/${docId}/file${q ? `?${q}` : ""}`;
}

/** Belgeyi indirir (önizleme yok). */
export async function downloadDocumentFile(
  docId: number,
  filename: string,
  access?: DocumentViewAccess
): Promise<void> {
  const url = getDocumentFileUrl(docId, access);
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(
      "Sunucuya bağlanılamadı. Backend'i başlatın: cd backend → python app.py"
    );
  }

  if (!res.ok) {
    let msg = "Belge indirilemedi";
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength === 0) {
    throw new Error(
      "Dosya arşivde yok. «Arşive ekle» ile aynı PDF'i yükleyin."
    );
  }

  const type = res.headers.get("content-type") || "application/pdf";
  if (type.includes("json")) {
    const j = JSON.parse(new TextDecoder().decode(buf)) as { error?: string };
    throw new Error(j.error ?? "Belge indirilemedi");
  }

  const blob = new Blob([buf], { type });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename || "belge.pdf";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
