"use client";

import { useState } from "react";
import clsx from "clsx";
import { Copy, KeyRound, Plus, UserCheck, UserX } from "lucide-react";

import { ConfirmDialog } from "@/app/(admin)/_components/ConfirmDialog";
import { FormField } from "@/app/(admin)/_components/FormField";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { inputStyles } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";
import {
  addTeamMember,
  resetTeamMemberPassword,
  updateTeamMember,
} from "@/lib/api-admin";
import { formatDateTime } from "@/lib/datetime";
import { ROLE_LABELS } from "@/lib/roles";
import type { AssignableRole, TeamMember, TeamMemberWithPassword } from "@/types/admin";

const ASSIGNABLE: ReadonlyArray<{ value: AssignableRole; label: string; hint: string }> = [
  { value: "manager", label: ROLE_LABELS.manager, hint: "Menü, QR, sipariş ve müşteriler" },
  { value: "staff", label: ROLE_LABELS.staff, hint: "Siparişler, mutfak ve ürün durumu" },
  { value: "kitchen", label: ROLE_LABELS.kitchen, hint: "Yalnızca mutfak ekranı" },
];

function roleLabel(role: string): string {
  if (role in ROLE_LABELS) return ROLE_LABELS[role as keyof typeof ROLE_LABELS];
  return role === "agency_admin" ? "Ajans" : role;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

const selectClass = clsx(inputStyles, "h-11 sm:text-sm");

interface TeamClientProps {
  initialMembers: TeamMember[];
  csrfToken: string | null;
  /** The signed-in owner's user id - their own row has no actions. */
  currentUserId: number;
}

export function TeamClient({ initialMembers, csrfToken, currentUserId }: TeamClientProps) {
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("kitchen");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [issued, setIssued] = useState<TeamMemberWithPassword | null>(null);
  const [copied, setCopied] = useState(false);
  const [toggling, setToggling] = useState<TeamMember | null>(null);
  const [resetting, setResetting] = useState<TeamMember | null>(null);

  const replace = (updated: TeamMember) =>
    setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));

  const submitAdd = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAddError(null);
    if (!csrfToken) {
      setAddError("Oturum bilgisi eksik. Sayfayı yenileyin.");
      return;
    }
    if (!email.trim()) {
      setAddError("E-posta zorunludur.");
      return;
    }
    setAdding(true);
    try {
      const result = await addTeamMember(
        { email: email.trim(), full_name: fullName.trim(), role },
        { csrfToken },
      );
      setMembers((prev) => [...prev, result.member]);
      setAddOpen(false);
      setFullName("");
      setEmail("");
      setRole("kitchen");
      setCopied(false);
      setIssued(result);
    } catch (err) {
      setAddError(errorMessage(err, "Üye eklenemedi."));
    } finally {
      setAdding(false);
    }
  };

  const changeRole = async (member: TeamMember, next: AssignableRole) => {
    if (!csrfToken || next === member.role) return;
    setError(null);
    setBusyId(member.id);
    try {
      replace(await updateTeamMember(member.id, { role: next }, { csrfToken }));
    } catch (err) {
      setError(errorMessage(err, "Rol değiştirilemedi."));
    } finally {
      setBusyId(null);
    }
  };

  const confirmToggle = async () => {
    if (!toggling || !csrfToken) return;
    setError(null);
    setBusyId(toggling.id);
    try {
      replace(await updateTeamMember(toggling.id, { is_active: !toggling.is_active }, { csrfToken }));
    } catch (err) {
      setError(errorMessage(err, "Güncellenemedi."));
    } finally {
      setBusyId(null);
      setToggling(null);
    }
  };

  const confirmReset = async () => {
    if (!resetting || !csrfToken) return;
    setError(null);
    setBusyId(resetting.id);
    try {
      const result = await resetTeamMemberPassword(resetting.id, { csrfToken });
      replace(result.member);
      setCopied(false);
      setIssued(result);
    } catch (err) {
      setError(errorMessage(err, "Şifre sıfırlanamadı."));
    } finally {
      setBusyId(null);
      setResetting(null);
    }
  };

  const copyPassword = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.temporary_password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => { setAddError(null); setAddOpen(true); }} leadingIcon={<Plus className="h-4 w-4" aria-hidden />}>
          Üye ekle
        </Button>
      </div>

      {error ? (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm" aria-label="Ekip üyeleri">
        <table className="table-stack w-full table-auto border-collapse text-left">
          <thead className="bg-background">
            <tr className="text-xs uppercase tracking-wider text-muted">
              <th className="px-4 py-2 font-medium">Üye</th>
              <th className="px-4 py-2 font-medium">Rol</th>
              <th className="px-4 py-2 font-medium">Durum</th>
              <th className="px-4 py-2 font-medium">Son giriş</th>
              <th className="px-4 py-2 text-right font-medium">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const isOwnerRow = member.role === "owner" || member.role === "agency_admin";
              const isSelf = member.user_id === currentUserId;
              const locked = isOwnerRow || isSelf;
              return (
                <tr key={member.id} className="border-t border-border text-sm text-text">
                  <td data-span="full" className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium">{member.full_name || member.email}</span>
                      {member.full_name ? <span className="text-xs text-muted">{member.email}</span> : null}
                    </div>
                  </td>
                  <td data-label="Rol" className="px-4 py-3">
                    {locked ? (
                      <Badge tone={isOwnerRow ? "primary" : "neutral"}>{roleLabel(member.role)}</Badge>
                    ) : (
                      <select
                        aria-label={`${member.email} rolü`}
                        className={selectClass}
                        value={member.role}
                        disabled={busyId === member.id || !member.is_active}
                        onChange={(e) => changeRole(member, e.target.value as AssignableRole)}
                      >
                        {ASSIGNABLE.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td data-label="Durum" className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={member.is_active ? "success" : "neutral"}>
                        {member.is_active ? "Aktif" : "Pasif"}
                      </Badge>
                      {member.must_change_password ? <Badge tone="warning">Geçici şifre</Badge> : null}
                    </div>
                  </td>
                  <td data-label="Son giriş" className="px-4 py-3 text-xs text-muted">
                    {member.last_login ? formatDateTime(member.last_login) : "Henüz girmedi"}
                  </td>
                  <td data-label="İşlem" className="px-4 py-3">
                    {locked ? (
                      <span className="block text-right text-xs text-muted">{isSelf ? "Siz" : "Ajans yönetir"}</span>
                    ) : (
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === member.id}
                          onClick={() => setResetting(member)}
                          leadingIcon={<KeyRound className="h-4 w-4" aria-hidden />}
                        >
                          Şifre sıfırla
                        </Button>
                        <Button
                          size="sm"
                          variant={member.is_active ? "danger-soft" : "soft"}
                          disabled={busyId === member.id}
                          onClick={() => setToggling(member)}
                          leadingIcon={member.is_active ? <UserX className="h-4 w-4" aria-hidden /> : <UserCheck className="h-4 w-4" aria-hidden />}
                        >
                          {member.is_active ? "Pasifleştir" : "Etkinleştir"}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Add a member */}
      <Sheet
        open={addOpen}
        onClose={() => { if (!adding) setAddOpen(false); }}
        title="Ekip üyesi ekle"
        footer={
          <div className="flex gap-3">
            <Button variant="outline" size="lg" className="flex-1" disabled={adding} onClick={() => setAddOpen(false)}>
              Vazgeç
            </Button>
            <Button type="submit" form="add-member-form" size="lg" className="flex-1" loading={adding}>
              Üyeyi ekle
            </Button>
          </div>
        }
      >
        <form id="add-member-form" onSubmit={submitAdd} className="flex flex-col gap-4" noValidate>
          {addError ? (
            <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
              {addError}
            </div>
          ) : null}
          <FormField label="Ad soyad" name="full_name" value={fullName} onChange={setFullName} autoComplete="off" />
          <FormField label="E-posta" name="email" type="email" value={email} onChange={setEmail} autoComplete="off" required hint="Giriş için kullanılacak." />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="team-role" className="text-sm font-semibold text-text">Rol</label>
            <select id="team-role" className={selectClass} value={role} onChange={(e) => setRole(e.target.value as AssignableRole)}>
              {ASSIGNABLE.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <p className="text-xs text-muted">{ASSIGNABLE.find((r) => r.value === role)?.hint}</p>
          </div>
          <p className="text-xs leading-relaxed text-muted">
            Üye eklenince sistem geçici bir şifre üretir ve size <strong>bir kez</strong> gösterir. Kişi ilk girişte kendi şifresini belirler.
          </p>
        </form>
      </Sheet>

      {/* The temporary password, shown once */}
      <Sheet
        open={issued !== null}
        onClose={() => setIssued(null)}
        title="Geçici şifre"
        footer={<Button size="lg" fullWidth onClick={() => setIssued(null)}>Tamam, not aldım</Button>}
      >
        {issued ? (
          <div className="flex flex-col gap-4 py-2">
            <p className="text-sm text-muted">
              <strong className="text-text">{issued.member.full_name || issued.member.email}</strong> için giriş bilgileri:
            </p>
            <dl className="rounded-xl bg-surface-low p-4 text-sm ring-1 ring-border">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">E-posta</dt>
              <dd className="mb-3 break-all font-mono text-text">{issued.member.email}</dd>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Geçici şifre</dt>
              <dd className="flex items-center justify-between gap-3">
                <span data-testid="temporary-password" className="font-mono text-xl font-semibold tracking-wider text-text">
                  {issued.temporary_password}
                </span>
                <Button size="sm" variant="outline" onClick={copyPassword} leadingIcon={<Copy className="h-4 w-4" aria-hidden />}>
                  {copied ? "Kopyalandı" : "Kopyala"}
                </Button>
              </dd>
            </dl>
            <p className="rounded-xl bg-warning-soft px-3 py-2 text-xs font-medium leading-relaxed text-warning">
              Bu şifre bir daha gösterilmez. Kişiye güvenli bir yoldan iletin; ilk girişte yeni şifre belirleyecek.
            </p>
          </div>
        ) : null}
      </Sheet>

      <ConfirmDialog
        open={toggling !== null}
        title={toggling?.is_active ? "Üyeyi pasifleştir" : "Üyeyi etkinleştir"}
        description={
          toggling?.is_active
            ? `${toggling.full_name || toggling.email} artık panele giremeyecek ve açık oturumu hemen sona erecek. Kaydı silinmez, istediğinizde yeniden etkinleştirebilirsiniz.`
            : `${toggling?.full_name || toggling?.email} yeniden panele girebilecek.`
        }
        confirmLabel={toggling?.is_active ? "Pasifleştir" : "Etkinleştir"}
        tone={toggling?.is_active ? "danger" : "primary"}
        loading={busyId !== null && toggling !== null && busyId === toggling.id}
        onConfirm={confirmToggle}
        onCancel={() => setToggling(null)}
      />

      <ConfirmDialog
        open={resetting !== null}
        title="Şifreyi sıfırla"
        description={`${resetting?.full_name || resetting?.email} için yeni bir geçici şifre üretilecek. Eski şifre ve açık oturumlar hemen geçersiz olur.`}
        confirmLabel="Sıfırla"
        tone="primary"
        loading={busyId !== null && resetting !== null && busyId === resetting.id}
        onConfirm={confirmReset}
        onCancel={() => setResetting(null)}
      />
    </div>
  );
}
