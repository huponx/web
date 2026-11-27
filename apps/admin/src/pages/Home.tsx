import { P, useAuth } from "@huponx/auth-client";
import { Badge, Button, buttonVariants, Card, CardContent, cn, iconTone, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tip, useLoad } from "@huponx/ui-kit";
import { Plus, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useIdentity } from "../api";
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
  const users = useLoad(() => (can(P.identity.userRead) ? api.getUserStats() : Promise.resolve(undefined)), [api, can]);
  const roles = useLoad(() => (can(P.identity.roleRead) ? api.countRoles() : Promise.resolve(undefined)), [api, can]);
  const perms = useLoad(() => (can(P.identity.permissionRead) ? api.countPermissions() : Promise.resolve(undefined)), [api, can]);
  const s = users.data;
  const total = num(s?.total);
  const active = num(s?.active);
  const percent = total === 0 ? 0 : Math.round((active / total) * 100);
  return (
    <section aria-label={t("home.stats.users")} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
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
      {s ? (
        <StatCard
          id="awaiting-approval"
          label={t("home.stats.awaitingApproval")}
          value={num(s.awaitingApproval)}
          hint={t("home.stats.awaitingApprovalHint")}
          to="/users?status=awaiting_approval"
        />
      ) : null}
      {s ? <StatCard id="pending" label={t("home.stats.pending")} value={num(s.pending)} hint={t("home.stats.pendingHint")} to="/users?status=pending" /> : null}
    </section>
  );
}

const quick = [
  { id: "add-user", to: "/users/new", perm: P.identity.userWrite, key: "home.quick.addUser" },
  { id: "create-role", to: "/roles/new", perm: P.identity.roleWrite, key: "home.quick.createRole" },
  { id: "add-client", to: "/clients/new", perm: P.identity.clientWrite, key: "home.quick.addClient" },
  { id: "add-exchange", to: "/exchange/new", perm: P.identity.exchangeWrite, key: "home.quick.addExchange" },
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
            <Plus aria-hidden="true" className={iconTone.add} />
            {t(q.key)}
          </Link>
        ))}
      </div>
    </section>
  );
}

const healthClass: Record<string, string> = {
  Healthy: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  Progressing: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  Degraded: "bg-red-500/15 text-red-700 dark:text-red-400",
  Suspended: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  Missing: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  Unknown: "bg-muted text-muted-foreground",
};

const healthOrder = ["Healthy", "Progressing", "Degraded", "Suspended", "Missing", "Unknown"] as const;

/** An ArgoCD health status as one of the known ones; anything else is Unknown. */
function knownHealth(health: string): (typeof healthOrder)[number] {
  return (healthOrder as readonly string[]).includes(health) ? (health as (typeof healthOrder)[number]) : "Unknown";
}

function HealthBadge({ health }: { health: string }) {
  const { t } = useTranslation();
  const known = knownHealth(health);
  return (
    <Badge variant="outline" className={cn("border-transparent font-normal", healthClass[known])} data-testid="health-badge" data-health={known}>
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
  const allowed = can(P.system.statusRead);
  const status = useLoad(() => (allowed ? api.systemStatus() : Promise.resolve(undefined)), [api, allowed]);
  if (!allowed) return null;
  if (status.error) {
    // not configured (404): nothing to show; any other failure is said once
    const code = (status.error as { status?: number }).status;
    return code === 404 ? null : <ErrorAlert error={status.error} />;
  }
  if (!status.data) return <Loading />;
  const apps: SystemApp[] = status.data.apps ?? [];
  const counts = Object.fromEntries(healthOrder.map((h) => [h, apps.filter((a) => knownHealth(a.health) === h).length]));
  const outOfSync = apps.filter((a) => a.sync === "OutOfSync").length;
  return (
    <section className="flex flex-col gap-3" aria-label={t("home.system.title")} data-testid="system-status">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground" data-testid="system-summary">
          {t("home.system.summary", { count: apps.length })}
        </h2>
        <Button variant="ghost" size="sm" onClick={status.reload} aria-label={t("home.system.refresh")}>
          <RefreshCw aria-hidden="true" className={iconTone.refresh} />
          {t("home.system.refresh")}
        </Button>
      </div>
      {apps.length > 0 && (
        <ul className="flex flex-wrap gap-2" data-testid="health-counts">
          {healthOrder
            .filter((h) => counts[h]! > 0 || h === "Healthy")
            .map((h) => (
              <li key={h}>
                <Badge variant="outline" className={cn("border-transparent font-normal", healthClass[h])} data-testid={`health-count-${h}`} data-count={counts[h]}>
                  <span className="font-semibold">{counts[h]}</span> {t(`home.system.health_.${h}`)}
                </Badge>
              </li>
            ))}
          {outOfSync > 0 && (
            <li>
              <Badge variant="outline" className="border-transparent bg-amber-500/15 font-normal text-amber-700 dark:text-amber-400" data-testid="out-of-sync-count">
                {t("home.system.outOfSyncCount", { count: outOfSync })}
              </Badge>
            </li>
          )}
        </ul>
      )}
      {apps.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("home.system.none")}</p>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("home.system.app")}</TableHead>
                  <TableHead>{t("home.system.health")}</TableHead>
                  <TableHead>{t("home.system.sync")}</TableHead>
                  <TableHead>{t("home.system.revision")}</TableHead>
                  <TableHead>{t("home.system.syncedAt")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apps.map((a) => (
                  <TableRow key={a.name} data-testid="system-app">
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell>
                      <HealthBadge health={a.health} />
                    </TableCell>
                    <TableCell>
                      <SyncBadge sync={a.sync} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <Tip label={a.revision}>
                        <span>{shortRevision(a.revision)}</span>
                      </Tip>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{a.syncedAt ? formatDateTime(Date.parse(a.syncedAt) / 1000, i18n.resolvedLanguage ?? "en") : ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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

/** A git commit is shortened to 7 characters; a chart version or a tag ("v2026.11.2-release-463f6d9") is shown whole. */
function shortRevision(revision?: string): string {
  if (!revision) return "";
  return /^[0-9a-f]{40}$/i.test(revision) ? revision.slice(0, 7) : revision;
}
