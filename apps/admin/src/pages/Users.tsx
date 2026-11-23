import { Can, useAuth } from "@huponx/auth-client";
import { Badge, Button, Card, CardContent } from "@huponx/ui-kit";
import { ChevronDown, ChevronUp, KeyRound, Plus, ShieldCheck, UserCheck, UserMinus, UserX, Users as UsersIcon, Clock, LogIn, Pencil } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { statusOf, useIdentity, useLoad, usePaged } from "../api";
import type { UserFilter, UserStats } from "../api";
import { formatDate, formatDateTime } from "../lib/date";

import { ActionLabel, Actions, BadgeList, DataTable, ErrorAlert, LoadMore, Loading, PageTitle, ROW_ACTION, SelectField, TextField } from "../components/common";

const ALL = "all"; // Radix Select has no empty value
const n = (v: string | undefined) => Number(v ?? 0);

/** Counts of all users: by status, MFA and activity. */
function Stats() {
  const { t } = useTranslation();
  const api = useIdentity();
  const stats = useLoad(() => api.getUserStats(), [api]);
  const [expanded, setExpanded] = useState(false);
  if (stats.error) return <ErrorAlert error={stats.error} />;
  const s: UserStats | undefined = stats.data;
  if (!s) return <Loading />;
  const items = [
    { key: "total", icon: UsersIcon, value: n(s.total) },
    { key: "active", icon: UserCheck, value: n(s.active) },
    { key: "pending", icon: Clock, value: n(s.pending) },
    { key: "disabled", icon: UserX, value: n(s.disabled) },
    { key: "mfaEnabled", icon: ShieldCheck, value: n(s.mfaEnabled) },
    { key: "mfaEnforced", icon: KeyRound, value: n(s.mfaEnforced) },
    { key: "signedIn30d", icon: LogIn, value: n(s.signedIn30d) },
    { key: "neverSignedIn", icon: UserMinus, value: n(s.neverSignedIn) },
  ];
  // one line: the first four (the first two on a narrow screen); the icon at the right shows all of them
  const shown = expanded ? items : items.slice(0, 4);
  const Toggle = expanded ? ChevronUp : ChevronDown;
  return (
    <section aria-label={t("users.stats.title")} className="flex flex-col gap-1 pt-3" data-testid="user-stats">
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4">
        {shown.map(({ key, icon: Icon, value }, i) => (
          <div key={key} className={`relative ${!expanded && i >= 2 ? "hidden md:block" : ""}`}>
            {/* the round badge sits on the top left corner of the card */}
            <span className="absolute -left-2 -top-3 z-10 flex size-10 items-center justify-center rounded-full border bg-card shadow-md">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <Card className="shadow-md">
              <CardContent className="flex flex-col items-center gap-1 py-5 text-center">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t(`users.stats.${key}`)}</span>
                <span className="text-3xl font-semibold" data-testid={`stat-${key}`}>
                  {value}
                </span>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="self-center"
        data-testid="stats-toggle"
        aria-expanded={expanded}
        aria-label={expanded ? t("users.stats.collapse") : t("users.stats.expand")}
        onClick={() => setExpanded((v) => !v)}
      >
        <Toggle aria-hidden="true" />
      </Button>
    </section>
  );
}

export function Users() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const api = useIdentity();
  const { can } = useAuth();
  // the fields of the form, and the filter applied by Search
  // a link from the home page can open the list narrowed to a status (?status=pending)
  const urlStatus = useSearchParams()[0].get("status");
  const initial: UserFilter = urlStatus === "pending" || urlStatus === "active" || urlStatus === "disabled" ? { status: urlStatus } : {};
  const [draft, setDraft] = useState<UserFilter>(initial);
  const [search, setSearch] = useState<UserFilter>(initial);
  const searchKey = JSON.stringify(search);
  const roles = useLoad(() => (can("identity:role:read") ? api.listRoles() : Promise.resolve(undefined)), [api, can]);
  const set = (patch: UserFilter) => setDraft((d) => ({ ...d, ...patch }));
  const paged = usePaged(
    (token) => api.listUsers(search, token).then((r) => ({ items: r.users ?? [], next: r.nextPageToken ?? "" })),
    [api, searchKey],
  );
  const first = { loading: paged.loading, error: paged.error, data: paged.items };
  const users = paged.items ?? [];

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle>{t("users.title")}</PageTitle>
        <Can perm="identity:user:write">
          <Button asChild>
            <Link to="/users/new">
              <Plus aria-hidden="true" />
              {t("users.add")}
            </Link>
          </Button>
        </Can>
      </div>
      <Stats />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <form
            className="flex flex-col gap-3"
            onSubmit={(ev) => {
              ev.preventDefault();
              setSearch({ email: draft.email?.trim(), name: draft.name?.trim(), status: draft.status, role: draft.role });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <TextField label={t("users.search.label")} value={draft.email ?? ""} onChange={(e) => set({ email: e.target.value })} onClear={() => set({ email: "" })} hint={t("users.search.hint")} />
              <TextField label={t("users.search.name")} value={draft.name ?? ""} onChange={(e) => set({ name: e.target.value })} onClear={() => set({ name: "" })} hint={t("users.search.nameHint")} />
              <SelectField
                label={t("users.search.status")}
                value={draft.status || ALL}
                onValueChange={(v) => set({ status: v === ALL ? "" : (v as UserFilter["status"]) })}
                options={[
                  { value: ALL, label: t("users.search.any") },
                  ...(["pending", "active", "disabled"] as const).map((x) => ({ value: x, label: t(`users.status.${x}`) })),
                ]}
              />
              {roles.data ? (
                <SelectField
                  label={t("users.search.role")}
                  value={draft.role || ALL}
                  onValueChange={(v) => set({ role: v === ALL ? "" : v })}
                  options={[{ value: ALL, label: t("users.search.any") }, ...roles.data.map((r) => ({ value: r.name, label: r.name }))]}
                />
              ) : (
                <TextField label={t("users.search.role")} value={draft.role ?? ""} onChange={(e) => set({ role: e.target.value.trim() })} onClear={() => set({ role: "" })} />
              )}
            </div>
            <Actions>
              <Button type="submit" variant="outline">
                {t("users.search.button")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDraft({});
                  setSearch({});
                }}
              >
                {t("users.search.clear")}
              </Button>
            </Actions>
          </form>
          <ErrorAlert error={first.error} />
          {first.loading ? <Loading /> : null}
          {first.data ? (
            <DataTable
              rows={users}
              rowKey={(u) => u.id}
              columns={[
                {
                  header: t("users.col.user"),
                  cell: (u) => (
                    <div className="flex items-center gap-3">
                      <div className="flex min-w-0 flex-col">
                        <strong className="truncate">{u.email}</strong>
                        {u.name ? <span className="truncate text-xs text-muted-foreground">{u.name}</span> : null}
                      </div>
                    </div>
                  ),
                },
                { header: t("users.col.roles"), cell: (u) => <BadgeList items={u.roles} /> },
                {
                  header: t("users.col.status"),
                  cell: (u) => {
                    const s = statusOf(u);
                    return <Badge variant={s === "active" ? "success" : s === "disabled" ? "destructive" : "warning"}>{t(`users.status.${s}`)}</Badge>;
                  },
                },
                {
                  header: t("users.col.mfa"),
                  cell: (u) => (u.mfaEnforced ? t("users.mfaState.required") : u.mfaEnabled ? t("users.mfaState.enrolled") : "-"),
                },
                {
                  header: t("users.col.lastLogin"),
                  cell: (u) => formatDateTime(u.lastLoginAt, lang) ?? <span className="text-muted-foreground">{t("users.never")}</span>,
                },
                { header: t("users.col.added"), cell: (u) => formatDate(u.createdAt, lang) ?? "-" },
                {
                  header: <span className="sr-only">{t("users.manage")}</span>,
                  className: "text-right",
                  cell: (u) => (
                    <Button asChild variant="outline" size="sm" className={ROW_ACTION}>
                      <Link to={`/users/${encodeURIComponent(u.id)}`} aria-label={t("users.manageAria", { email: u.email })}>
                        <ActionLabel icon={Pencil}>{t("users.manage")}</ActionLabel>
                      </Link>
                    </Button>
                  ),
                },
              ]}
            />
          ) : null}
          <LoadMore paged={paged} />
        </CardContent>
      </Card>
    </>
  );
}
