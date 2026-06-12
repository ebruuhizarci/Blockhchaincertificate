import { apiFetch, ApiError, getApiErrorMessage } from "./http";

export type VerifyResponse = {
  exists: boolean;
  filename?: string;
  institution?: string;
  status?: string;
  blockchain_info?: string | null;
  message?: string;
  error?: string;
};

export type UploadResponse = {
  message?: string;
  hash?: string;
  status?: string;
  error?: string;
  file_archived?: boolean;
  doc_id?: number;
};

export type MyDocument = {
  id: number;
  filename: string;
  file_hash: string;
  institution: string;
  status: string;
  blockchain_tx: string | null;
  date: string | null;
  has_file?: boolean;
};

export type MyDocumentsResponse = {
  uploader: string;
  total: number;
  pending_count: number;
  documents: MyDocument[];
  pending: MyDocument[];
  error?: string;
};

export async function fetchMyDocuments(
  uploaderName: string,
  userEmail?: string
): Promise<MyDocumentsResponse> {
  const params = new URLSearchParams();
  if (uploaderName.trim()) {
    params.set("uploader_name", uploaderName.trim());
  }
  if (userEmail?.trim()) {
    params.set("user_email", userEmail.trim());
  }
  const { data, res } = await apiFetch<MyDocumentsResponse>(
    `/documents/mine?${params.toString()}`
  );
  if (!res.ok) {
    throw new Error(data.error ?? "Belgeler alınamadı");
  }
  return data;
}

export async function verifyDocumentOffChain(
  fileHash: string
): Promise<VerifyResponse> {
  const { data, res } = await apiFetch<VerifyResponse>(`/verify/${fileHash}`);
  if (!res.ok && data.error) {
    throw new ApiError(data.error, "HTTP_ERROR");
  }
  return data;
}

export async function uploadDocumentMeta(
  file: File,
  uploaderName: string,
  targetInstitution: string,
  userEmail?: string
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("uploader_name", uploaderName);
  form.append("target_institution", targetInstitution);
  if (userEmail?.trim()) {
    form.append("user_email", userEmail.trim());
  }

  const { data, res } = await apiFetch<UploadResponse>("/upload", {
    method: "POST",
    body: form,
  });

  if (res.status === 409 && data.file_archived) {
    return {
      ...data,
      message: data.message ?? "Dosya arşive eklendi. Artık görüntüleyebilirsiniz.",
    };
  }

  if (!res.ok) {
    throw new Error(data.error ?? data.message ?? "Yükleme başarısız");
  }
  return data;
}

export async function archiveDocumentFile(
  docId: number,
  file: File,
  access: { userEmail?: string; uploaderName?: string; institutionCode?: string }
): Promise<{ message?: string; has_file?: boolean; error?: string }> {
  const form = new FormData();
  form.append("file", file);
  if (access.userEmail?.trim()) form.append("user_email", access.userEmail.trim());
  if (access.uploaderName?.trim()) form.append("uploader_name", access.uploaderName.trim());
  if (access.institutionCode?.trim()) {
    form.append("institution_code", access.institutionCode.trim());
  }

  const { data, res } = await apiFetch<{
    message?: string;
    has_file?: boolean;
    error?: string;
  }>(`/documents/${docId}/archive`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error(data.error ?? "Dosya arşive eklenemedi");
  }
  return data;
}

export type PendingInstitutionDoc = {
  id: number;
  filename: string;
  uploader: string;
  date: string | null;
  file_hash: string;
  has_file?: boolean;
};

export async function fetchPendingInstitutionDocs(
  institutionCode: string
): Promise<PendingInstitutionDoc[]> {
  const code = encodeURIComponent(institutionCode);
  const { data, res } = await apiFetch<PendingInstitutionDoc[] | { error?: string }>(
    `/pending-docs/${code}`
  );
  if (!res.ok) {
    const err = !Array.isArray(data) && data.error ? data.error : "Liste alınamadı";
    throw new Error(err);
  }
  return Array.isArray(data) ? data : [];
}

export type PaymentConfig = {
  amount_try: number;
  currency: string;
  iyzico_configured: boolean;
  relayer_configured: boolean;
  mock_mode: boolean;
};

export type PaymentInitResponse = {
  session_id: string;
  payment_page_url: string;
  amount_try: number;
  mock?: boolean;
  error?: string;
};

export type PaymentSessionStatus = {
  session_id: string;
  status: string;
  doc_id?: number | null;
  blockchain_tx?: string | null;
  file_hash?: string;
  error?: string | null;
  amount_try?: number;
};

export async function fetchPaymentConfig(): Promise<PaymentConfig> {
  const { data, res } = await apiFetch<PaymentConfig & { error?: string }>(
    "/payments/config"
  );
  if (!res.ok) {
    throw new Error("Ödeme ayarları alınamadı");
  }
  return data;
}

export async function initIyzicoPayment(
  file: File,
  uploaderName: string,
  targetInstitution: string,
  userEmail: string
): Promise<PaymentInitResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("uploader_name", uploaderName);
  form.append("target_institution", targetInstitution);
  form.append("user_email", userEmail);

  const { data, res } = await apiFetch<PaymentInitResponse>("/payments/iyzico/init", {
    method: "POST",
    body: form,
  });
  if (!res.ok || data.error) {
    throw new Error(data.error ?? "Ödeme başlatılamadı");
  }
  if (!data.payment_page_url) {
    throw new Error("Ödeme sayfası oluşturulamadı");
  }
  return data;
}

export async function fetchPaymentSession(
  sessionId: string
): Promise<PaymentSessionStatus> {
  const { data, res } = await apiFetch<PaymentSessionStatus & { error?: string }>(
    `/payments/session/${encodeURIComponent(sessionId)}`
  );
  if (!res.ok) {
    throw new Error(data.error ?? "Ödeme durumu alınamadı");
  }
  return data;
}

export async function updateDocumentStatus(
  docId: number,
  status: "approved" | "rejected",
  blockchainTx?: string | null
): Promise<{ message?: string; error?: string }> {
  const { data, res } = await apiFetch<{ message?: string; error?: string }>(
    "/update-status",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: docId,
        status,
        blockchain_tx: blockchainTx ?? null,
      }),
    }
  );
  if (!res.ok) {
    throw new Error(data.error ?? "Durum güncellenemedi");
  }
  return data;
}

export { getApiErrorMessage, ApiError };
