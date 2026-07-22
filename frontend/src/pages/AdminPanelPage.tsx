import { FormEvent, useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { PageShell } from "@/components/layout/PageShell";
import { Spinner } from "@/components/ui/Spinner";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { adminLogout, getAdminToken } from "@/lib/adminAuth";
import { apiFetch } from "@/lib/http";

type AdminUser = {
  id: number;
  email: string;
  full_name: string;
  is_banned: boolean;
  created_at: string | null;
};

type AdminInstitution = {
  id: number;
  code: string;
  name: string;
  created_at: string | null;
  is_suspended: boolean;
};

type Tab = "users" | "institutions";

export function AdminPanelPage() {
  const token = getAdminToken();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("users");
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [institutions, setInstitutions] = useState<AdminInstitution[]>([]);
  const [actingId, setActingId] = useState<number | null>(null);
  const [instCode, setInstCode] = useState("");
  const [instName, setInstName] = useState("");
  const [creatingInst, setCreatingInst] = useState(false);
  const [lastInstPassword, setLastInstPassword] = useState<string | null>(null);
  const { confirm, ConfirmDialogHost } = useConfirmDialog();

  const authHeaders = {
    Authorization: `Bearer ${token ?? ""}`,
    "Content-Type": "application/json",
  };

  const loadUsers = useCallback(async () => {
    const { data, res } = await apiFetch<{ users?: AdminUser[]; error?: string }>(
      "/admin/users",
      { headers: authHeaders }
    );
    if (!res.ok) throw new Error(data.error ?? "Kullanıcılar alınamadı.");
    setUsers(data.users ?? []);
  }, [token]);

  const loadInstitutions = useCallback(async () => {
    const { data, res } = await apiFetch<{
      institutions?: AdminInstitution[];
      error?: string;
    }>("/admin/institutions", { headers: authHeaders });
    if (!res.ok) throw new Error(data.error ?? "Kurumlar alınamadı.");
    setInstitutions(data.institutions ?? []);
  }, [token]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadUsers(), loadInstitutions()]);
    } catch (e) {
      adminLogout();
      toast.error((e as Error).message);
      navigate("/admin/giris");
    } finally {
      setLoading(false);
    }
  }, [loadInstitutions, loadUsers, navigate]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  if (!token) {
    return <Navigate to="/admin/giris" replace />;
  }

  const setBan = async (user: AdminUser, banned: boolean) => {
    setActingId(user.id);
    try {
      const { data, res } = await apiFetch<{ error?: string }>(
        `/admin/users/${user.id}/ban`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ banned }),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Kullanıcı güncellenemedi.");
      toast.success(
        banned ? "Kullanıcı banlandı" : "Kullanıcı banı kaldırıldı"
      );
      await loadUsers();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActingId(null);
    }
  };

  const deleteUser = async (user: AdminUser) => {
    const ok = await confirm({
      title: "Kullanıcıyı sil",
      message: `${user.email} hesabı kalıcı olarak silinsin mi?`,
      confirmLabel: "Sil",
      tone: "danger",
    });
    if (!ok) return;
    setActingId(user.id);
    try {
      const { data, res } = await apiFetch<{ error?: string }>(`/admin/users/${user.id}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!res.ok) throw new Error(data.error ?? "Kullanıcı silinemedi.");
      toast.success("Kullanıcı silindi");
      await loadUsers();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActingId(null);
    }
  };

  const createInstitution = async (e: FormEvent) => {
    e.preventDefault();
    setCreatingInst(true);
    setLastInstPassword(null);
    try {
      const { data, res } = await apiFetch<{
        error?: string;
        generated_password?: string;
        institution?: AdminInstitution;
      }>("/admin/institutions", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          code: instCode.trim() || undefined,
          name: instName.trim(),
        }),
      });
      if (!res.ok) throw new Error(data.error ?? "Kurum oluşturulamadı.");
      setLastInstPassword(data.generated_password ?? null);
      setInstCode("");
      setInstName("");
      toast.success("Kurum oluşturuldu — şifreyi kuruma iletin.");
      await loadInstitutions();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreatingInst(false);
    }
  };

  const resetInstitutionPassword = async (inst: AdminInstitution) => {
    const ok = await confirm({
      title: "Kurum şifresini sıfırla",
      message: `${inst.name} için yeni şifre üretilsin mi?\n\nEski şifre ve tüm kurum oturumları kapanır.`,
      confirmLabel: "Şifre üret",
      tone: "warning",
    });
    if (!ok) return;
    setActingId(inst.id);
    setLastInstPassword(null);
    try {
      const { data, res } = await apiFetch<{
        error?: string;
        generated_password?: string;
      }>(`/admin/institutions/${inst.id}/reset-password`, {
        method: "POST",
        headers: authHeaders,
      });
      if (!res.ok) throw new Error(data.error ?? "Şifre sıfırlanamadı.");
      setLastInstPassword(data.generated_password ?? null);
      toast.success("Kurum şifresi sıfırlandı");
      await loadInstitutions();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setActingId(null);
    }
  };

  const toggleInstitutionSuspend = async (inst: AdminInstitution, suspended: boolean) => {
    setActingId(inst.id);
    try {
      const { data, res } = await apiFetch<{ error?: string }>(
        `/admin/institutions/${inst.id}/suspend`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ suspended }),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Kurum durumu güncellenemedi.");
      toast.success(suspended ? "Kurum askıya alındı" : "Kurum tekrar aktif");
      await loadInstitutions();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setActingId(null);
    }
  };

  const deleteInstitution = async (inst: AdminInstitution) => {
    const ok = await confirm({
      title: "Kurumu sil",
      message: `${inst.name} (${inst.code}) kurumu silinsin mi?\n\nMevcut belgeler silinmez; kurum girişi kapanır.`,
      confirmLabel: "Kurumu sil",
      tone: "danger",
    });
    if (!ok) return;
    setActingId(inst.id);
    try {
      const { data, res } = await apiFetch<{ error?: string }>(
        `/admin/institutions/${inst.id}`,
        { method: "DELETE", headers: authHeaders }
      );
      if (!res.ok) throw new Error(data.error ?? "Kurum silinemedi.");
      toast.success("Kurum silindi");
      await loadInstitutions();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setActingId(null);
    }
  };

  return (
    <PageShell>
      {ConfirmDialogHost}
      <div className="mx-auto max-w-4xl px-6 py-10">
        <section className="glass-panel p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black uppercase text-white">Admin Panel</h1>
              <p className="text-sm italic text-slate-400">
                Kullanıcı ve kurum yönetimi
              </p>
            </div>
            <button
              type="button"
              className="ether-btn-secondary"
              onClick={() => {
                adminLogout();
                navigate("/admin/giris");
              }}
            >
              Çıkış
            </button>
          </div>

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              className={
                tab === "users"
                  ? "ether-btn-primary !py-2 !px-4"
                  : "ether-btn-secondary !py-2 !px-4"
              }
              onClick={() => setTab("users")}
            >
              Kullanıcılar
            </button>
            <button
              type="button"
              className={
                tab === "institutions"
                  ? "ether-btn-primary !py-2 !px-4"
                  : "ether-btn-secondary !py-2 !px-4"
              }
              onClick={() => setTab("institutions")}
            >
              Kurumlar
            </button>
          </div>

          {loading ? (
            <div className="mt-8">
              <Spinner label="Yükleniyor..." />
            </div>
          ) : tab === "users" ? (
            <div className="mt-8 space-y-3">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{u.full_name}</p>
                      <p className="text-sm text-slate-400">{u.email}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Durum: {u.is_banned ? "Banlı" : "Aktif"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {u.is_banned ? (
                        <button
                          type="button"
                          className="ether-btn-secondary !py-2"
                          disabled={actingId === u.id}
                          onClick={() => void setBan(u, false)}
                        >
                          Ban Kaldır
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-2 text-[10px] font-black uppercase text-amber-300 hover:bg-amber-500/20"
                          disabled={actingId === u.id}
                          onClick={() => void setBan(u, true)}
                        >
                          Banla
                        </button>
                      )}
                      <button
                        type="button"
                        className="rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-2 text-[10px] font-black uppercase text-red-300 hover:bg-red-500/20"
                        disabled={actingId === u.id}
                        onClick={() => void deleteUser(u)}
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {users.length === 0 && (
                <p className="text-sm italic text-slate-500">Kayıtlı kullanıcı yok.</p>
              )}
            </div>
          ) : (
            <div className="mt-8 space-y-6">
              <form
                onSubmit={createInstitution}
                className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-3"
              >
                <p className="text-sm font-bold text-indigo-200">Yeni kurum ekle</p>
                <input
                  type="text"
                  required
                  placeholder="Kurum adı (örn. İstanbul Üniversitesi)"
                  value={instName}
                  onChange={(e) => setInstName(e.target.value)}
                  className="ether-input"
                />
                <input
                  type="text"
                  placeholder="Kurum kodu (boş bırakılırsa adından üretilir, örn. BEUN)"
                  value={instCode}
                  onChange={(e) => setInstCode(e.target.value.toUpperCase())}
                  className="ether-input"
                />
                {creatingInst ? (
                  <Spinner label="Kurum oluşturuluyor..." />
                ) : (
                  <button type="submit" className="ether-btn-primary">
                    Kurum Ekle ve Şifre Üret
                  </button>
                )}
                {lastInstPassword && (
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                    <p className="font-bold">Otomatik kurum şifresi (bir kez gösterilir):</p>
                    <p className="mt-2 font-mono text-lg tracking-widest">{lastInstPassword}</p>
                    <p className="mt-2 text-xs text-emerald-200/80">
                      Kurum girişinde boşluksuz da yazılabilir. Bu şifreyi kuruma iletin.
                    </p>
                  </div>
                )}
              </form>

              <div className="space-y-3">
                {institutions.map((inst) => (
                  <div
                    key={inst.id}
                    className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{inst.name}</p>
                        <p className="text-sm text-slate-400">Kod: {inst.code}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Durum: {inst.is_suspended ? "Askıda" : "Aktif"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="ether-btn-secondary !py-2 !text-[10px]"
                          disabled={actingId === inst.id}
                          onClick={() => void resetInstitutionPassword(inst)}
                        >
                          Şifre Sıfırla
                        </button>
                        {inst.is_suspended ? (
                          <button
                            type="button"
                            className="ether-btn-secondary !py-2 !text-[10px]"
                            disabled={actingId === inst.id}
                            onClick={() => void toggleInstitutionSuspend(inst, false)}
                          >
                            Aktifleştir
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-2 text-[10px] font-black uppercase text-amber-300 hover:bg-amber-500/20"
                            disabled={actingId === inst.id}
                            onClick={() => void toggleInstitutionSuspend(inst, true)}
                          >
                            Askıya Al
                          </button>
                        )}
                        <button
                          type="button"
                          className="rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-2 text-[10px] font-black uppercase text-red-300 hover:bg-red-500/20"
                          disabled={actingId === inst.id}
                          onClick={() => void deleteInstitution(inst)}
                        >
                          Sil
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {institutions.length === 0 && (
                  <p className="text-sm italic text-slate-500">Kayıtlı kurum yok.</p>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
