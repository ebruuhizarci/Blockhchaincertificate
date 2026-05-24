import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { fetchMyDocuments, type MyDocument } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/http";
import { Spinner } from "@/components/ui/Spinner";

import { INSTITUTION_LABELS } from "@/config/institutions";
import { DocumentDownloadButton } from "@/components/documents/DocumentDownloadButton";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
  approved: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
  rejected: "bg-red-500/20 text-red-300 border border-red-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Onay bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
};

type Props = {
  uploaderName: string;
  userEmail?: string;
  refreshKey?: number;
  /** Tam sayfa görünümü (ayrı /belgelerim rotası) */
  fullPage?: boolean;
  onDocumentsChange?: () => void;
};

function DocumentRow({
  doc,
  userEmail,
  uploaderName,
  onArchived,
}: {
  doc: MyDocument;
  userEmail?: string;
  uploaderName: string;
  onArchived?: () => void;
}) {
  const statusClass =
    STATUS_STYLES[doc.status] ?? "bg-slate-100 text-slate-700";

  return (
    <li className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-white">{doc.filename}</p>
          <p className="mt-1 text-xs text-slate-400">
            {INSTITUTION_LABELS[doc.institution] ?? doc.institution}
            {doc.date ? ` · ${doc.date}` : ""}
          </p>
        </div>
        <span className={`rounded-lg px-2 py-1 text-xs font-medium ${statusClass}`}>
          {STATUS_LABELS[doc.status] ?? doc.status}
        </span>
      </div>
      <p className="mt-2 break-all font-mono text-[11px] text-slate-500">
        {doc.file_hash}
      </p>
      {doc.blockchain_tx && (
        <p className="mt-1 break-all font-mono text-[11px] text-indigo-400">
          TX: {doc.blockchain_tx}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <DocumentDownloadButton
          doc={doc}
          access={{ userEmail, uploaderName }}
          onArchived={onArchived}
        />
      </div>
    </li>
  );
}

export function MyDocumentsPanel({
  uploaderName,
  userEmail,
  refreshKey = 0,
  fullPage = false,
  onDocumentsChange,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<MyDocument[]>([]);
  const [pending, setPending] = useState<MyDocument[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMyDocuments(uploaderName, userEmail);
      setDocuments(data.documents);
      setPending(data.pending);
    } catch (e) {
      toast.error(getApiErrorMessage(e));
      setDocuments([]);
      setPending([]);
    } finally {
      setLoading(false);
    }
  }, [uploaderName, userEmail]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const onArchived = () => {
    void load();
    onDocumentsChange?.();
  };

  if (loading) {
    return (
      <div className="glass-panel p-8">
        <Spinner label="Belgeleriniz yükleniyor..." />
      </div>
    );
  }

  return (
    <section className={`glass-panel p-8 ${fullPage ? "" : ""}`}>
      {!fullPage && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide text-white">
              Belgelerim
            </h2>
            <p className="text-sm text-slate-400">
              Toplam {documents.length} belge · {pending.length} onay bekliyor
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="ether-btn-secondary !py-2 !text-[10px]"
          >
            Yenile
          </button>
        </div>
      )}

      {fullPage && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <p className="text-sm text-slate-400">
            Toplam {documents.length} belge · {pending.length} onay bekliyor
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="ether-btn-secondary !py-2 !text-[10px]"
          >
            Yenile
          </button>
        </div>
      )}

      <div className={fullPage ? "" : "mt-6"}>
        <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400">
          Onay bekleyen belgelerim ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500 italic">
            Onay bekleyen belgeniz yok.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {pending.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                userEmail={userEmail}
                uploaderName={uploaderName}
                onArchived={onArchived}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
          Tüm belgelerim ({documents.length})
        </h3>
        {documents.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            Henüz kayıtlı belge yok.{" "}
            <Link to="/uygulama" className="font-bold text-indigo-400 hover:underline">
              Yeni belge mühürleyin
            </Link>
            .
          </p>
        ) : (
          <ul
            className={`mt-3 space-y-3 ${
              fullPage ? "" : "max-h-96 overflow-y-auto"
            }`}
          >
            {documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                userEmail={userEmail}
                uploaderName={uploaderName}
                onArchived={onArchived}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
