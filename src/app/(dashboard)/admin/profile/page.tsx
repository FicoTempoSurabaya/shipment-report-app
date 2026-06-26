"use client";

import {
  Eye,
  EyeOff,
  Loader2,
  Save,
  Search,
  Sheet,
  ShieldCheck,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { toast, Toaster } from "sonner";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { USER_JABATAN, type UserJabatan } from "@/types/user";

type AdminProfile = {
  user_id: string;
  nik_kerja: string;
  area_id: string | null;
  area_code: string | null;
  nama_area: string | null;
  nama_lengkap: string;
  username: string;
  password: string;
};

type AdminRegularUser = {
  user_id: string;
  nik_kerja: string;
  area_id: string;
  area_code: string | null;
  nama_lengkap: string;
  jabatan: UserJabatan;
  username: string;
  password: string;
  is_active: boolean;
};

type SpreadsheetData = {
  area_id: string;
  area_code: string;
  nama_area: string;
  spreadsheet_id: string | null;
  spreadsheet_url: string | null;
  is_connected: boolean;
  button_label: string;
};

type ApiResponse<T> = {
  ok: boolean;
  message?: string;
  data?: T;
  errors?: Record<string, string[] | undefined>;
};

type UserFormState = {
  nik_kerja: string;
  nama_lengkap: string;
  jabatan: UserJabatan;
  username: string;
  password: string;
  is_active: boolean;
};

const emptyUserForm: UserFormState = {
  nik_kerja: "",
  nama_lengkap: "",
  jabatan: "Driver",
  username: "",
  password: "",
  is_active: true,
};

export default function AdminProfilePage() {
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [spreadsheet, setSpreadsheet] = useState<SpreadsheetData | null>(null);
  const [users, setUsers] = useState<AdminRegularUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const [profileUsername, setProfileUsername] = useState("");
  const [profilePassword, setProfilePassword] = useState("");
  const [showProfilePassword, setShowProfilePassword] = useState(false);

  const [search, setSearch] = useState("");
  const [userForm, setUserForm] = useState<UserFormState>(emptyUserForm);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSpreadsheetActionLoading, setIsSpreadsheetActionLoading] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);

  const isEditingUser = Boolean(selectedUserId);

  const isProfileSubmitDisabled = useMemo(() => {
    return (
      isSavingProfile ||
      !profile ||
      profileUsername.trim().length < 3 ||
      profilePassword.length === 0
    );
  }, [isSavingProfile, profile, profilePassword, profileUsername]);

  const isUserSubmitDisabled = useMemo(() => {
    return (
      isSavingUser ||
      userForm.nik_kerja.trim().length === 0 ||
      userForm.nama_lengkap.trim().length === 0 ||
      userForm.username.trim().length < 3 ||
      userForm.password.length === 0
    );
  }, [isSavingUser, userForm]);

  const loadProfile = useCallback(async () => {
    const response = await fetch("/api/admin/profile", {
      method: "GET",
      credentials: "include",
    });

    const result = (await response.json()) as ApiResponse<AdminProfile>;

    if (!response.ok || !result.ok || !result.data) {
      throw new Error(result.message || "Gagal mengambil profile admin");
    }

    setProfile(result.data);
    setProfileUsername(result.data.username);
    setProfilePassword(result.data.password);
  }, []);

  const loadSpreadsheet = useCallback(async () => {
    const response = await fetch("/api/admin/spreadsheet", {
      method: "GET",
      credentials: "include",
    });

    const result = (await response.json()) as ApiResponse<SpreadsheetData>;

    if (!response.ok || !result.ok || !result.data) {
      throw new Error(result.message || "Gagal mengambil spreadsheet area");
    }

    setSpreadsheet(result.data);
  }, []);

  const loadUsers = useCallback(async (keyword = "") => {
    setIsLoadingUsers(true);

    try {
      const params = new URLSearchParams();

      if (keyword.trim()) {
        params.set("search", keyword.trim());
      }

      const response = await fetch(`/api/admin/users?${params.toString()}`, {
        method: "GET",
        credentials: "include",
      });

      const result = (await response.json()) as ApiResponse<AdminRegularUser[]>;

      if (!response.ok || !result.ok || !result.data) {
        toast.error(result.message || "Gagal mengambil user regular");
        return;
      }

      setUsers(result.data);
    } catch {
      toast.error("Tidak bisa terhubung ke server");
    } finally {
      setIsLoadingUsers(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setIsLoading(true);

    try {
      await Promise.all([loadProfile(), loadSpreadsheet(), loadUsers("")]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Gagal memuat profile admin";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [loadProfile, loadSpreadsheet, loadUsers]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadAll();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadAll]);

  function openNewUserModal() {
    setSelectedUserId(null);
    setUserForm(emptyUserForm);
    setIsUserModalOpen(true);
  }

  function openEditUserModal(user: AdminRegularUser) {
    setSelectedUserId(user.user_id);
    setUserForm({
      nik_kerja: user.nik_kerja,
      nama_lengkap: user.nama_lengkap,
      jabatan: user.jabatan,
      username: user.username,
      password: user.password,
      is_active: user.is_active,
    });
    setIsUserModalOpen(true);
  }

  function closeUserModal() {
    setIsUserModalOpen(false);
    setSelectedUserId(null);
    setUserForm(emptyUserForm);
  }

  async function handleSaveProfile(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isProfileSubmitDisabled) {
      toast.error("Username dan password admin wajib diisi");
      return;
    }

    setIsSavingProfile(true);

    try {
      const response = await fetch("/api/admin/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          username: profileUsername.trim(),
          password: profilePassword,
        }),
      });

      const result = (await response.json()) as ApiResponse<AdminProfile>;

      if (!response.ok || !result.ok || !result.data) {
        toast.error(result.message || "Gagal memperbarui profile admin");
        return;
      }

      setProfile(result.data);
      setProfileUsername(result.data.username);
      setProfilePassword(result.data.password);
      toast.success(result.message || "Profile admin berhasil diperbarui");
    } catch {
      toast.error("Tidak bisa terhubung ke server");
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleSpreadsheetAction() {
    if (spreadsheet?.is_connected && spreadsheet.spreadsheet_url) {
      window.open(spreadsheet.spreadsheet_url, "_blank", "noopener,noreferrer");
      return;
    }

    setIsSpreadsheetActionLoading(true);

    try {
      const response = await fetch("/api/admin/spreadsheet/connect", {
        method: "POST",
        credentials: "include",
      });

      const result = (await response.json()) as ApiResponse<SpreadsheetData>;

      if (!response.ok || !result.ok || !result.data) {
        toast.error(result.message || "Gagal menghubungkan spreadsheet area");
        return;
      }

      setSpreadsheet(result.data);
      toast.success(result.message || "Spreadsheet area berhasil dihubungkan");

      if (result.data.spreadsheet_url) {
        window.open(result.data.spreadsheet_url, "_blank", "noopener,noreferrer");
      }
    } catch {
      toast.error("Tidak bisa terhubung ke server");
    } finally {
      setIsSpreadsheetActionLoading(false);
    }
  }

  async function handleSaveUser(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isUserSubmitDisabled) {
      toast.error("Lengkapi data user regular");
      return;
    }

    setIsSavingUser(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: isEditingUser ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          ...(isEditingUser && selectedUserId ? { user_id: selectedUserId } : {}),
          nik_kerja: userForm.nik_kerja.trim(),
          nama_lengkap: userForm.nama_lengkap.trim(),
          jabatan: userForm.jabatan,
          username: userForm.username.trim(),
          password: userForm.password,
          is_active: userForm.is_active,
        }),
      });

      const result = (await response.json()) as ApiResponse<AdminRegularUser>;

      if (!response.ok || !result.ok || !result.data) {
        toast.error(result.message || "Gagal menyimpan user regular");
        return;
      }

      toast.success(result.message || "User regular berhasil disimpan");
      closeUserModal();
      await loadUsers(search);
    } catch {
      toast.error("Tidak bisa terhubung ke server");
    } finally {
      setIsSavingUser(false);
    }
  }

  return (
    <DashboardShell
      description="Kelola profile admin dan anggota regular di area admin."
      hideIntroPanel
      profilePath="/admin/profile"
      roleLabel="Admin Profile"
      title="Profile Admin"
      userName={profile?.nama_lengkap}
    >
      <Toaster richColors position="top-center" />

      {isLoading ? (
        <div className="ind-card-flat flex min-h-72 items-center justify-center">
          <div className="flex items-center gap-3 text-sm font-bold text-[var(--muted)]">
            <Loader2 className="h-5 w-5 animate-spin" />
            Memuat profile admin...
          </div>
        </div>
      ) : null}

      {!isLoading && profile ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="space-y-6">
            <div className="ind-card p-5 sm:p-6">
              <div className="mb-6 flex items-start gap-4">
                <div className="ind-icon-box">
                  <ShieldCheck className="h-5 w-5" />
                </div>

                <div>
                  <p className="ind-label">Data User</p>
                  <h2 className="ind-heading mt-2 text-2xl">Profile Admin</h2>
                </div>
              </div>

              <form className="space-y-5" onSubmit={handleSaveProfile}>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="ind-stat-box p-4">
                    <p className="ind-label">NIK Kerja</p>
                    <p className="mt-2 break-words font-mono text-sm font-black text-[var(--steel)]">
                      {profile.nik_kerja}
                    </p>
                  </div>

                  <div className="ind-stat-box p-4">
                    <p className="ind-label">Area</p>
                    <p className="mt-2 break-words text-sm font-black text-[var(--steel)]">
                      {profile.nama_area ?? spreadsheet?.nama_area ?? "-"}
                    </p>
                  </div>
                </div>

                <button
                  className={
                    spreadsheet?.is_connected
                      ? "ind-btn-secondary w-full"
                      : "ind-btn-danger w-full"
                  }
                  disabled={isSpreadsheetActionLoading}
                  type="button"
                  onClick={() => void handleSpreadsheetAction()}
                >
                  {isSpreadsheetActionLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Memproses
                    </>
                  ) : (
                    <>
                      <Sheet className="h-5 w-5" />
                      {spreadsheet?.is_connected ? "Buka" : "Hubungkan"}
                    </>
                  )}
                </button>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
                    Nama Lengkap
                  </span>
                  <input
                    className="ind-input cursor-not-allowed text-[var(--muted)]"
                    readOnly
                    value={profile.nama_lengkap}
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
                    Username
                  </span>
                  <input
                    className="ind-input"
                    autoComplete="username"
                    value={profileUsername}
                    onChange={(event) => setProfileUsername(event.target.value)}
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
                    Password
                  </span>
                  <div className="flex items-center gap-3 border-2 border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-3 transition focus-within:border-[var(--primary)]">
                    <input
                      className="w-full bg-transparent text-sm font-semibold text-[var(--steel)] outline-none"
                      autoComplete="current-password"
                      type={showProfilePassword ? "text" : "password"}
                      value={profilePassword}
                      onChange={(event) =>
                        setProfilePassword(event.target.value)
                      }
                    />

                    <button
                      aria-label={
                        showProfilePassword
                          ? "Sembunyikan password"
                          : "Tampilkan password"
                      }
                      className="p-1 text-[var(--muted)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--steel)]"
                      type="button"
                      onClick={() => setShowProfilePassword((value) => !value)}
                    >
                      {showProfilePassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </label>

                <button
                  className="ind-btn-primary w-full"
                  disabled={isProfileSubmitDisabled}
                  type="submit"
                >
                  {isSavingProfile ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Menyimpan
                    </>
                  ) : (
                    <>
                      <Save className="h-5 w-5" />
                      Simpan Profile
                    </>
                  )}
                </button>
              </form>
            </div>
          </section>

          <section className="ind-card p-6">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="ind-label-accent">Kelola Anggota</p>
                <h2 className="ind-heading mt-3 text-2xl">User Regular</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Daftar regular di area {spreadsheet?.nama_area ?? profile.nama_area ?? "admin"}.
                </p>
              </div>

              <button
                className="ind-btn-primary"
                type="button"
                onClick={openNewUserModal}
              >
                <UserPlus className="h-5 w-5" />
                User Baru
              </button>
            </div>

            <div className="mb-5 flex items-stretch gap-2">
              <input
                className="ind-input min-w-0 flex-1"
                placeholder="Cari nama, NIK, username..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void loadUsers(search);
                  }
                }}
              />

              <button
                className="flex h-12 w-12 shrink-0 items-center justify-center border-2 border-[var(--border)] bg-[var(--surface)] text-[var(--steel)] transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary-dark)] disabled:cursor-not-allowed disabled:border-[var(--border-soft)] disabled:bg-[var(--surface-soft)] disabled:text-[var(--muted)]"
                type="button"
                aria-label="Cari user regular"
                disabled={isLoadingUsers}
                onClick={() => void loadUsers(search)}
              >
                {isLoadingUsers ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </button>
            </div>
            
            <div className="space-y-3">
              {users.map((user) => (
                <button
                  key={user.user_id}
                  className={[
                    "flex w-full items-center justify-between gap-4 border-2 p-4 text-left transition",
                    selectedUserId === user.user_id
                      ? "border-[var(--primary-dark)] bg-[var(--primary-soft)]"
                      : "border-[var(--border-soft)] bg-[var(--surface-soft)] hover:border-[var(--primary)]",
                  ].join(" ")}
                  type="button"
                  onClick={() => openEditUserModal(user)}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="ind-icon-box p-2">
                      <UsersRound className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-[var(--steel)]">
                        {user.nama_lengkap}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {user.nik_kerja} · {user.jabatan} · {user.username}
                      </p>
                    </div>
                  </div>

                  <span
                    className={[
                      "shrink-0 border-2 px-3 py-1 text-xs font-black",
                      user.is_active ? "ind-badge-green" : "ind-badge-red",
                    ].join(" ")}
                  >
                    {user.is_active ? "Aktif" : "Nonaktif"}
                  </span>
                </button>
              ))}

              {users.length === 0 ? (
                <div className="ind-stat-box p-6 text-center">
                  <p className="text-sm font-bold text-[var(--steel)]">
                    User regular tidak ditemukan.
                  </p>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {isUserModalOpen ? (
        <div
          className="ind-modal-overlay z-[100]"
          role="presentation"
          onMouseDown={closeUserModal}
        >
          <div
            className="ind-modal max-w-2xl p-5"
            role="dialog"
            aria-modal="true"
            aria-label={isEditingUser ? "Edit user regular" : "Input user baru"}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-3 border-b-2 border-[var(--border)] pb-4">
              <div>
                <p className="ind-label-accent">
                  {isEditingUser ? "Edit Anggota" : "User Baru"}
                </p>
                <h3 className="ind-heading mt-2 text-xl">
                  {isEditingUser
                    ? "Update User Regular"
                    : "Input User Regular Baru"}
                </h3>
                <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
                  User regular akan terhubung ke area admin aktif.
                </p>
              </div>

              <button
                className="flex min-h-10 items-center justify-center border-2 border-[var(--border-soft)] bg-[var(--surface)] p-2 text-[var(--steel)] transition hover:border-[var(--danger)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                type="button"
                aria-label="Tutup modal user"
                onClick={closeUserModal}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form className="space-y-5" onSubmit={handleSaveUser}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
                    NIK Kerja
                  </span>
                  <input
                    className="ind-input disabled:cursor-not-allowed disabled:text-[var(--muted)]"
                    disabled={isEditingUser}
                    value={userForm.nik_kerja}
                    onChange={(event) =>
                      setUserForm((current) => ({
                        ...current,
                        nik_kerja: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
                    Nama Lengkap
                  </span>
                  <input
                    className="ind-input"
                    value={userForm.nama_lengkap}
                    onChange={(event) =>
                      setUserForm((current) => ({
                        ...current,
                        nama_lengkap: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
                    Jabatan
                  </span>
                  <select
                    className="ind-input"
                    value={userForm.jabatan}
                    onChange={(event) =>
                      setUserForm((current) => ({
                        ...current,
                        jabatan: event.target.value as UserJabatan,
                      }))
                    }
                  >
                    {USER_JABATAN.map((jabatan) => (
                      <option key={jabatan} value={jabatan}>
                        {jabatan}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
                    Username
                  </span>
                  <input
                    className="ind-input"
                    value={userForm.username}
                    onChange={(event) =>
                      setUserForm((current) => ({
                        ...current,
                        username: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
                    Password
                  </span>
                  <input
                    className="ind-input"
                    value={userForm.password}
                    onChange={(event) =>
                      setUserForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="flex items-center gap-3 self-end border-2 border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-3 text-sm font-bold text-[var(--steel)]">
                  <input
                    checked={userForm.is_active}
                    className="h-4 w-4 accent-[var(--primary-dark)]"
                    type="checkbox"
                    onChange={(event) =>
                      setUserForm((current) => ({
                        ...current,
                        is_active: event.target.checked,
                      }))
                    }
                  />
                  User Aktif
                </label>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t-2 border-[var(--border-soft)] pt-4 sm:flex-row sm:justify-end">
                <button
                  className="ind-btn-danger font-black uppercase tracking-[0.12em]"
                  type="button"
                  onClick={closeUserModal}
                >
                  Batal
                </button>

                <button
                  className="ind-btn-primary"
                  disabled={isUserSubmitDisabled}
                  type="submit"
                >
                  {isSavingUser ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Menyimpan
                    </>
                  ) : (
                    <>
                      <Save className="h-5 w-5" />
                      {isEditingUser ? "Update User" : "Tambah User"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}
