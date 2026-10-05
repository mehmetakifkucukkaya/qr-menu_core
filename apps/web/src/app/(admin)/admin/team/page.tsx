import { cookies } from "next/headers";
import { UserCog } from "lucide-react";

import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";
import { AdminApiError, fetchCurrentUser, fetchTeam } from "@/lib/api-admin";
import { TeamClient } from "./TeamClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function readCookieHeader(): string {
  return cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

/**
 * /admin/team - who has access to this business (owner only).
 *
 * The owner adds floor staff and kitchen tablets, changes roles, deactivates
 * people who left and issues a new temporary password. Everything here is
 * enforced by the server too (apps/accounts/team.py); the temporary password
 * is shown once, right after it is issued, and never stored.
 */
export default async function TeamPage() {
  const cookieHeader = readCookieHeader();
  const csrfToken = cookies().get("qr_csrftoken")?.value ?? null;

  let error: string | null = null;
  let members: Awaited<ReturnType<typeof fetchTeam>> = [];
  let currentUserId = 0;
  try {
    const [user, team] = await Promise.all([
      fetchCurrentUser({ internal: true, cookieHeader }),
      fetchTeam({ internal: true, cookieHeader }),
    ]);
    currentUserId = user.id;
    members = team;
  } catch (err) {
    if (err instanceof AdminApiError) {
      error = err.message;
    } else {
      throw err;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UserCog className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Hesap</p>
          <h1 className="font-heading text-2xl font-bold text-text">Ekip</h1>
          <p className="mt-1 text-sm text-muted">
            İşletmenizin paneline kimlerin, hangi yetkiyle girebildiğini buradan yönetirsiniz.
          </p>
        </div>
      </header>

      {error ? (
        <AdminErrorState title="Ekip listesi alınamadı" message={error} code="team.fetch_failed" />
      ) : (
        <TeamClient initialMembers={members} csrfToken={csrfToken} currentUserId={currentUserId} />
      )}
    </div>
  );
}
