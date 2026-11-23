import { useAuth } from "@huponx/auth-client";
import { Badge, Button, Card, CardContent, buttonVariants, cn } from "@huponx/ui-kit";
import { Plus, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useIdentity, useLoad } from "../api";
import type { SystemApp } from "../api";
import { ErrorAlert, Loading, PageTitle } from "../components/common";
import { formatDateTime } from "../lib/date";

/** A number with a line of context under it; `to` makes the whole card a link. */
function StatCard({ id, label, value, hint, to }: { id: string; label: string; value: ReactNode; hint?: ReactNode; to?: string }) {
  const body = (
    <CardContent className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-3xl font-semibold tabular-nums" data-testid={`stat-${id}-value`}>
        {value}
      </span>
      {hint ? (
        <span className="text-xs text-muted-foreground" data-testid={`stat-${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </CardContent>
  );
  return (
    <Card data-testid={`stat-${id}`} className={cn(to && "transition-colors hover:bg-muted/50")}>
      {to ? (
        <Link to={to} className="block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  );
}

const num = (v: string | number | undefined) => Number(v ?? 0);

/** The four numbers; a card shows only for a user who may read what it counts, and calls nothing otherwise. */
function Stats() {
  const { t } = useTranslation();
  const api = useIdentity();
  const { can } = useAuth();
  const users = useLoad(() => (can("identity:user:read") ? api.getUserStats() : Promise.resolve(undefined)), [api, can]);
  const roles = useLoad(() => (can("identity:role:read") ? api.countRoles() : Promise.resolve(undefined)), [api, can]);
  const perms = useLoad(() => (can("identity:permission:read") ? api.countPermissions() : Promise.resolve(undefined)), [api, can]);
  const s = users.data;
  const total = num(s?.total);
  const active = num(s?.active);
  const percent = total === 0 ? 0 : Math.round((active / total) * 100);
  return (
    <section aria-label={t("home.stats.users")} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {users.error ? <ErrorAlert error={users.error} /> : null}
      {s ? (
        <>
          <StatCard id="users" label={t("home.stats.users")} value={total} hint={t("home.stats.newThisMonth", { count: num(s.createdThisMonth) })} to="/users" />
          <StatCard id="active" label={t("home.stats.active")} value={active} hint={t("home.stats.activeShare", { percent })} to="/users?status=active" />
        </>
      ) : null}
      {roles.data !== undefined ? (
        <StatCard
          id="roles"
          label={t("home.stats.roles")}
          value={roles.data}
          hint={perms.data !== undefined ? t("home.stats.permissions", { count: perms.data }) : undefined}
          to="/roles"
        />
      ) : null}
      {s ? <StatCard id="pending" label={t("home.stats.pending")} value={num(s.pending)} hint={t("home.stats.pendingHint")} to="/users?status=pending" /> : null}
    </section>
  );
}

const quick = [
  { id: "add-user", to: "/users/new", perm: "identity:user:write", key: "home.quick.addUser" },
  { id: "create-role", to: "/roles/new", perm: "identity:role:write", key: "home.quick.createRole" },
  { id: "add-client", to: "/clients/new", perm: "identity:client:write", key: "home.quick.addClient" },
  { id: "add-exchange", to: "/exchange/new", perm: "identity:exchange:write", key: "home.quick.addExchange" },
] as const;

function QuickActions() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const allowed = quick.filter((q) => can(q.perm));
  if (allowed.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-label={t("home.quick.title")}>
      <h2 className="text-sm font-medium text-muted-foreground">{t("home.quick.title")}</h2>
      <div className="flex flex-wrap gap-2">
        {allowed.map((q) => (
          <Link key={q.id} to={q.to} data-testid={`quick-${q.id}`} className={buttonVariants({ variant: "outline" })}>
            <Plus aria-hidden="true" />
            {t(q.key)}
          </Link>
        ))}
      </div>
    </section>
  );
}

const healthClass: Record<string, string> = {
  Healthy: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  Progressing: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  Degraded: "bg-red-500/15 text-red-700 dark:text-red-400",
};

function HealthBadge({ health }: { health: string }) {
  const { t } = useTranslation();
  const known = ["Healthy", "Progressing", "Degraded", "Suspended", "Missing"].includes(health) ? health : "Unknown";
  return (
    <Badge variant="outline" className={cn("border-transparent font-normal", healthClass[known] ?? "bg-muted text-muted-foreground")} data-testid="health-badge" data-health={known}>
      {t(`home.system.health_.${known}`)}
    </Badge>
  );
}

function SyncBadge({ sync }: { sync: string }) {
  const { t } = useTranslation();
  if (sync === "Synced") return <span>{t("home.system.synced")}</span>;
  if (sync === "OutOfSync") return <span className="text-amber-700 dark:text-amber-400">{t("home.system.outOfSync")}</span>;
  return <span className="text-muted-foreground">{t("home.system.unknown")}</span>;
}

/** The applications ArgoCD runs. Hidden without the permission and when the gateway has no ArgoCD (404). */
function SystemStatus() {
  const { t, i18n } = useTranslation();
  const api = useIdentity();
  const { can } = useAuth();
  const allowed = can("system:status:read");
  const status = useLoad(() => (allowed ? api.systemStatus() : Promise.resolve(undefined)), [api, allowed]);
  if (!allowed) return null;
  if (status.error) {
    // not configured (404): nothing to show; any other failure is said once
    const code = (status.error as { status?: number }).status;
    return code === 404 ? null : <ErrorAlert error={status.error} />;
  }
  if (!status.data) return <Loading />;
  const apps: SystemApp[] = status.data.apps ?? [];
  const healthy = apps.filter((a) => a.health === "Healthy").length;
  return (
    <section className="flex flex-col gap-3" aria-label={t("home.system.title")} data-testid="system-status">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">{t("home.system.title")}</h2>
          <p className="text-sm" data-testid="system-summary">
            {t("home.system.summary", { healthy, total: apps.length })}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={status.reload} aria-label={t("home.system.refresh")}>
          <RefreshCw aria-hidden="true" />
          {t("home.system.refresh")}
        </Button>
      </div>
      {apps.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("home.system.none")}</p>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">{t("home.system.app")}</th>
                  <th className="px-4 py-2 font-medium">{t("home.system.health")}</th>
                  <th className="px-4 py-2 font-medium">{t("home.system.sync")}</th>
                  <th className="px-4 py-2 font-medium">{t("home.system.revision")}</th>
                  <th className="px-4 py-2 font-medium">{t("home.system.syncedAt")}</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((a) => (
                  <tr key={a.name} className="border-t" data-testid="system-app">
                    <td className="px-4 py-2 font-medium">{a.name}</td>
                    <td className="px-4 py-2">
                      <HealthBadge health={a.health} />
                    </td>
                    <td className="px-4 py-2">
                      <SyncBadge sync={a.sync} />
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{a.revision ? a.revision.slice(0, 12) : ""}</td>
                    <td className="px-4 py-2 text-muted-foreground">{a.syncedAt ? formatDateTime(Date.parse(a.syncedAt) / 1000, i18n.resolvedLanguage ?? "en") : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

export function Home() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const name = user?.name || user?.email || "";
  return (
    <>
      <PageTitle description={t("home.subtitle")}>{name ? t("home.hello", { name }) : t("home.title")}</PageTitle>
      <Stats />
      <QuickActions />
      <SystemStatus />
    </>
  );
}
