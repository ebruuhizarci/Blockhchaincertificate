import { useRef, useState, useEffect } from "react";
import toast from "react-hot-toast";
import { archiveDocumentFile } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/http";
import {
  downloadDocumentFile,
  type DocumentViewAccess,
} from "@/lib/documents";

type DocLike = {
  id: number;
  filename: string;
  has_file?: boolean;
};

type Props = {
  doc: DocLike;
  access: DocumentViewAccess;
  onArchived?: () => void;
  className?: string;
};

export function DocumentDownloadButton({
  doc,
  access,
  onArchived,
  className = "",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [hasFile, setHasFile] = useState(doc.has_file === true);

  useEffect(() => {
    setHasFile(doc.has_file === true);
  }, [doc.has_file]);

  const onPickArchive = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    try {
      const result = await archiveDocumentFile(doc.id, file, access);
      if (result.has_file) {
        setHasFile(true);
        toast.success("Dosya arşive eklendi");
        onArchived?.();
      } else {
        toast.error("Dosya kaydedilemedi.");
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onDownload = async () => {
    setBusy(true);
    try {
      await downloadDocumentFile(doc.id, doc.filename, access);
      toast.success("İndirme başladı");
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!hasFile) {
    return (
      <div className={`flex flex-wrap items-center gap-2 ${className}`}>
        <span className="text-[10px] italic text-slate-500">
          Dosya arşivde yok
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="ether-btn-secondary !py-2 !text-[10px]"
        >
          {busy ? "Ekleniyor..." : "Arşive ekle"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => void onPickArchive(e)}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void onDownload()}
      className={`ether-btn-secondary !py-2 !text-[10px] ${className}`}
    >
      {busy ? "İndiriliyor..." : "Belgeyi indir"}
    </button>
  );
}
