import { FormEvent, useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { getAcademicYearOptions } from "@/lib/academicYear";
import {
  deleteRegistryDocument,
  fetchRegistryDocuments,
  uploadRegistryDocument,
  type RegistryDocument,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/http";
import { Spinner } from "@/components/ui/Spinner";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

type Props = {
  institutionCode: string;
  institutionName: string;
};

export function InstitutionRegistryPanel({
  institutionCode,
  institutionName,
}: Props) {
  const years = getAcademicYearOptions();
  const [year, setYear] = useState(years[0]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [items, setItems] = useState<RegistryDocument[]>([]);
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchRegistryDocuments(year);
      setItems(list);
    } catch (e) {
      toast.error(getApiErrorMessage(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  const onUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error("PDF dosyası seçin");
      return;
    }
    setUploading(true);
    try {
      await uploadRegistryDocument(file, year);
      toast.success("Resmi belge kayıt defterine eklendi");
      setFile(null);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (item: RegistryDocument) => {
    const ok = await confirm({
      title: "Kayıt defteri kaydını sil",
      message: `${item.filename} kaydı resmi arşivden silinsin mi?`,
      confirmLabel: "Sil",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteRegistryDocument(item.id);
      toast.success("Kayıt silindi");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <section className="glass-panel p-8 md:p-10">
      {ConfirmDialogHost}
      <div>
        <h1 className="text-xl font-black uppercase tracking-wide text-white">
          Resmi Belge Kayıt Defteri
        </h1>
        <p className="mt-1 text-sm italic text-slate-400">
          {institutionName} — akademik yıl bazında hash arşivi. Öğrenci aynı
          belgeyi yüklediğinde hash eşleşirse otomatik onay açılır.
        </p>
      </div>

      <form onSubmit={onUpload} className="mt-6 space-y-3 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4">
        <label className="block text-xs font-bold uppercase text-indigo-200">
          Akademik yıl
        </label>
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="ether-input"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="ether-input file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-500/20 file:px-3 file:py-2 file:text-xs file:font-bold file:text-indigo-200"
        />
        {uploading ? (
          <Spinner label="Kayıt defterine ekleniyor..." />
        ) : (
          <button type="submit" className="ether-btn-primary">
            Resmi Belge Yükle (Hash Kaydet)
          </button>
        )}
      </form>

      {loading ? (
        <div className="mt-8">
          <Spinner label="Kayıt defteri yükleniyor..." />
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{item.filename}</p>
                  <p className="text-sm text-slate-400">{item.academic_year}</p>
                  <p className="mt-2 break-all font-mono text-[11px] text-slate-500">
                    {item.file_hash}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-[10px] font-black uppercase text-red-300"
                  onClick={() => void onDelete(item)}
                >
                  Sil
                </button>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-sm italic text-slate-500">
              {year} için henüz resmi belge kaydı yok.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
