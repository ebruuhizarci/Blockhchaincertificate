import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { PageShell } from "@/components/layout/PageShell";
import { Spinner } from "@/components/ui/Spinner";
import { adminLogout, getAdminToken } from "@/lib/adminAuth";
import { apiFetch } from "@/lib/http";

type AdminUser = {
  id: number;
  email: string;
  full_name: string;
  is_banned: boolean;
  created_at: string | null;
};

export function AdminPanelPage() {
  const token = getAdminToken();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [actingId, setActingId] = useState<number | null>(null);

  const authHeaders = {
    Authorization: `Bearer ${token ?? ""}`,
    "Content-Type": "application/json",
  };

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, res } = await apiFetch<{ users?: AdminUser[]; error?: string }>(
        "/admin/users",
        { headers: authHeaders }
      );
      if (!res.ok) throw new Error(data.error ?? "Kullanıcılar alınamadı.");
      setUsers(data.users ?? []);
    } catch (e) {
      adminLogout();
      toast.error((e as Error).message);
      navigate("/admin/giris");
    } finally {
      setLoading(false);
    }
  }, [navigate, token]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

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
    if (!window.confirm(`${user.email} hesabı silinsin mi?`)) return;
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

  return (
    <PageShell>
      <div className="mx-auto max-w-4xl px-6 py-10">
        <section className="glass-panel p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black uppercase text-white">Admin Panel</h1>
              <p className="text-sm italic text-slate-400">
                Kullanıcıları banlayabilir veya silebilirsiniz.
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

          {loading ? (
            <div className="mt-8">
              <Spinner label="Kullanıcılar yükleniyor..." />
            </div>
          ) : (
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
          )}
        </section>
      </div>
    </PageShell>
  );
}
