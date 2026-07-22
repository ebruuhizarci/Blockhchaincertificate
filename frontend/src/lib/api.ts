import { apiFetch, ApiError, getApiErrorMessage } from "./http";
import { institutionAuthHeaders } from "./institutionAuth";

export type VerifyResponse = {
  exists: boolean;
  doc_id?: number;
  filename?: string;
  institution?: string;
  status?: string;
  blockchain_info?: string | null;
  has_file?: boolean;
  can_view?: boolean;
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
  academic_year?: string | null;
  registry_match?: boolean;
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
  academic_year?: string | null;
  registry_match?: boolean;
};

export type RegistryDocument = {
  id: number;
  academic_year: string;
  filename: string;
  file_hash: string;
  created_at: string | null;
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
  userEmail?: string,
  academicYear?: string
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("uploader_name", uploaderName);
  form.append("target_institution", targetInstitution);
  if (userEmail?.trim()) {
    form.append("user_email", userEmail.trim());
  }
  if (academicYear?.trim()) {
    form.append("academic_year", academicYear.trim());
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
    headers: access.institutionCode ? institutionAuthHeaders() : undefined,
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
  academic_year?: string | null;
  registry_match?: boolean;
  hashes_equal?: boolean;
  student_hash?: string;
  registry_hash?: string;
  registry_filename?: string;
  registry_academic_year?: string;
};

export async function fetchPendingInstitutionDocs(
  institutionCode: string
): Promise<PendingInstitutionDoc[]> {
  const code = encodeURIComponent(institutionCode);
  const { data, res } = await apiFetch<PendingInstitutionDoc[] | { error?: string }>(
    `/pending-docs/${code}`,
    { headers: institutionAuthHeaders() }
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
  userEmail: string,
  academicYear?: string
): Promise<PaymentInitResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("uploader_name", uploaderName);
  form.append("target_institution", targetInstitution);
  form.append("user_email", userEmail);
  if (academicYear?.trim()) {
    form.append("academic_year", academicYear.trim());
  }

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
      headers: {
        "Content-Type": "application/json",
        ...institutionAuthHeaders(),
      },
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

export async function autoApproveFromRegistry(
  docId: number,
  userEmail?: string,
  uploaderName?: string
): Promise<{ message?: string; error?: string }> {
  const { data, res } = await apiFetch<{ message?: string; error?: string }>(
    `/documents/${docId}/auto-approve-registry`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_email: userEmail,
        uploader_name: uploaderName,
      }),
    }
  );
  if (!res.ok) {
    throw new Error(data.error ?? "Otomatik onay başarısız");
  }
  return data;
}

export async function fetchRegistryDocuments(
  academicYear?: string
): Promise<RegistryDocument[]> {
  const params = academicYear ? `?academic_year=${encodeURIComponent(academicYear)}` : "";
  const { data, res } = await apiFetch<{ items?: RegistryDocument[]; error?: string }>(
    `/institution/registry${params}`,
    { headers: institutionAuthHeaders() }
  );
  if (!res.ok) throw new Error(data.error ?? "Kayıt defteri alınamadı");
  return data.items ?? [];
}

export async function uploadRegistryDocument(
  file: File,
  academicYear: string
): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  form.append("academic_year", academicYear);
  const { data, res } = await apiFetch<{ error?: string }>("/institution/registry", {
    method: "POST",
    headers: institutionAuthHeaders(),
    body: form,
  });
  if (!res.ok) throw new Error(data.error ?? "Kayıt defterine eklenemedi");
}

export async function deleteRegistryDocument(entryId: number): Promise<void> {
  const { data, res } = await apiFetch<{ error?: string }>(
    `/institution/registry/${entryId}`,
    { method: "DELETE", headers: institutionAuthHeaders() }
  );
  if (!res.ok) throw new Error(data.error ?? "Kayıt silinemedi");
}

export { getApiErrorMessage, ApiError };
