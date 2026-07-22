import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  fetchPendingInstitutionDocs,
  updateDocumentStatus,
  type PendingInstitutionDoc,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/http";
import { Spinner } from "@/components/ui/Spinner";
import { DocumentDownloadButton } from "@/components/documents/DocumentDownloadButton";

type Props = {
  institutionCode: string;
  institutionName: string;
};

export function PendingApprovalsPanel({
  institutionCode,
  institutionName,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<PendingInstitutionDoc[]>([]);
  const [actingId, setActingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchPendingInstitutionDocs(institutionCode);
      setDocs(list);
    } catch (e) {
      toast.error(getApiErrorMessage(e));
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [institutionCode]);

  useEffect(() => {
    void load();
  }, [load]);

  const onDecision = async (docId: number, status: "approved" | "rejected") => {
    setActingId(docId);
    try {
      await updateDocumentStatus(docId, status);
      toast.success(
        status === "approved"
          ? "Belge onaylandı ve AES/RSA ile şifrelendi"
          : "Belge reddedildi"
      );
      await load();
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    } finally {
      setActingId(null);
    }
  };

  if (loading) {
    return (
      <div className="glass-panel p-10">
        <Spinner label="Onay bekleyen belgeler yükleniyor..." />
      </div>
    );
  }

  return (
    <section className="glass-panel p-8 md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black uppercase tracking-wide text-white">
            Onay bekleyen belgeler
          </h1>
          <p className="mt-1 text-sm italic text-slate-400">{institutionName}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="ether-btn-secondary !py-2"
        >
          Yenile
        </button>
      </div>

      {docs.length === 0 ? (
        <p className="mt-8 text-center text-sm italic text-slate-500">
          Bu kurum için onay bekleyen belge yok.
        </p>
      ) : (
        <ul className="mt-8 space-y-4">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-white">{doc.filename}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    Yükleyen: <strong className="text-slate-200">{doc.uploader}</strong>
                    {doc.academic_year ? ` · ${doc.academic_year}` : ""}
                    {doc.date ? ` · ${doc.date}` : ""}
                  </p>
                </div>
                <span className="rounded-lg border border-amber-500/30 bg-amber-500/20 px-2 py-1 text-[10px] font-black uppercase text-amber-300">
                  Onay bekliyor
                </span>
              </div>
              <p className="mt-2 break-all font-mono text-[11px] text-slate-500">
                {doc.file_hash}
              </p>

              <div
                className={`mt-4 rounded-xl border p-4 ${
                  doc.hashes_equal || doc.registry_match
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-slate-600/50 bg-slate-900/60"
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-300">
                  Hash karşılaştırması
                </p>
                <div className="mt-3 space-y-2 text-xs">
                  <div>
                    <p className="text-slate-400">Öğrenci belgesi hash</p>
                    <p className="break-all font-mono text-slate-200">
                      {doc.student_hash ?? doc.file_hash}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Resmi kayıt defteri hash</p>
                    {doc.registry_hash ? (
                      <p className="break-all font-mono text-slate-200">
                        {doc.registry_hash}
                      </p>
                    ) : (
                      <p className="italic text-slate-500">
                        {doc.academic_year
                          ? `${doc.academic_year} için eşleşen resmi kayıt yok`
                          : "Öğrenci akademik yıl seçmemiş"}
                      </p>
                    )}
                  </div>
                </div>
                {doc.hashes_equal || doc.registry_match ? (
                  <p className="mt-3 rounded-lg bg-emerald-500/20 px-3 py-2 text-sm font-bold text-emerald-200">
                    Hashler aynı — resmi kayıt defteri ile birebir eşleşme
                    {doc.registry_academic_year
                      ? ` (${doc.registry_academic_year})`
                      : doc.registry_filename
                        ? ` (${doc.registry_filename})`
                        : ""}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-amber-200">
                    Hashler farklı veya resmi kayıtta karşılık yok — manuel inceleme gerekir
                  </p>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <DocumentDownloadButton
                  doc={doc}
                  access={{ institutionCode: institutionCode }}
                  onArchived={() => void load()}
                />
                <button
                  type="button"
                  disabled={actingId === doc.id}
                  onClick={() => void onDecision(doc.id, "approved")}
                  className="ether-btn-emerald !py-2"
                >
                  Onayla
                </button>
                <button
                  type="button"
                  disabled={actingId === doc.id}
                  onClick={() => void onDecision(doc.id, "rejected")}
                  className="rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-2 text-[10px] font-black uppercase text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                >
                  Reddet
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
