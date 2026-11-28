import { Can, useAuth } from "@huponx/auth-client";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, iconTone, Tabs, TabsContent, TabsList, TabsTrigger, useAction, useFlash, usePaged } from "@huponx/ui-kit";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useIdentity } from "../api";
import type { Role } from "../api";
import { ActionLabel, Actions, BadgeList, ROW_ACTION, DataTable, DoneAlert, ErrorAlert, LoadMore, Loading, PageTitle } from "../components/common";
import { useConfirm } from "../components/ConfirmDialog";
import { SearchBar } from "../components/SearchBar";
import { ROUTES } from "../authz";

/** The catalog: what roles can be given. Read only, the services declare it; the wildcards are generated. */
function PermissionCatalog() {
  const { t } = useTranslation();
  const api = useIdentity();
  const [query, setQuery] = useState("");
  const paged = usePaged((token) => api.listPermissionsPage(query, token), [api, query]);
  const { items: catalog, loading, error } = paged;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("roles.perm.title")}</CardTitle>
        <CardDescription>{t("roles.perm.intro")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SearchBar label={t("roles.perm.search")} hint={t("roles.perm.searchHint")} onSearch={setQuery} />
        <ErrorAlert error={error} />
        {loading ? <Loading /> : null}
        {catalog ? (
          <DataTable
            rows={catalog}
            rowKey={(p) => p.name}
            columns={[
              {
                header: t("roles.perm.name"),
                cell: (p) => (
                  <>
                    <code className="break-all text-xs">{p.name}</code>
                    {p.retired ? <Badge variant="outline" className="ml-2">{t("roles.perm.retiredBadge")}</Badge> : null}
                  </>
                ),
              },
              { header: t("roles.perm.service"), cell: (p) => (p.wildcard ? t("roles.perm.wildcardBadge") : p.service || "-") },
              { header: t("roles.perm.description"), cell: (p) => p.description || "-" },
              { header: t("roles.perm.roles"), cell: (p) => Number(p.roleCount ?? 0) },
            ]}
          />
        ) : null}
        <LoadMore paged={paged} />
      </CardContent>
    </Card>
  );
}

export function Roles() {
  const { t } = useTranslation();
  const api = useIdentity();
  const { can } = useAuth();
  const [query, setQuery] = useState("");
  const paged = usePaged((token) => api.listRolesPage(query, token), [api, query]);
  const { items: data, error, loading, reload } = paged;
  const canCatalog = can(ROUTES.listPermissions);
  const { confirm, dialog } = useConfirm();
  const del = useAction();
  // set by the edit page after it deleted the role
  const gone = useFlash<{ deleted?: string }>()?.deleted;

  async function remove(r: Role) {
    if (!(await confirm({ title: t("roles.form.deleteTitle"), message: t("roles.form.confirmDelete", { name: r.name }), confirmLabel: t("common.delete") }))) return;
    const done = await del.run(() => api.deleteRole(r.name), t("roles.form.deleted", { name: r.name }));
    if (done !== undefined) reload();
  }

  return (
    <>
      <PageTitle>{t("roles.title")}</PageTitle>
      <Tabs defaultValue="roles">
        <TabsList>
          <TabsTrigger value="roles">{t("roles.tab.roles")}</TabsTrigger>
          {canCatalog ? <TabsTrigger value="permissions">{t("roles.tab.permissions")}</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="roles">
          <Can route={ROUTES.putRole}>
            <Actions>
              <Button asChild>
                <Link to="/roles/new">
                  <Plus aria-hidden="true" />
                  {t("roles.add")}
                </Link>
              </Button>
            </Actions>
          </Can>
          <Card>
            <CardContent className="flex flex-col gap-4">
              <SearchBar label={t("roles.search")} hint={t("roles.searchHint")} onSearch={setQuery} />
              <ErrorAlert error={error} />
              <ErrorAlert error={del.error} />
              <DoneAlert watch={del.doneId}>{del.done ?? (gone ? t("roles.form.deleted", { name: gone }) : undefined)}</DoneAlert>
              {loading ? <Loading /> : null}
              {data ? (
                <DataTable
                  rows={data}
                  rowKey={(r) => r.name}
                  columns={[
                    { header: t("roles.col.role"), cell: (r) => <strong>{r.name}</strong> },
                    { header: t("roles.col.description"), cell: (r) => r.description },
                    {
                      header: t("roles.col.permissions"),
                      cell: (r) => <BadgeList items={r.permissions.map((p) => ((r.retiredPermissions ?? []).includes(p) ? `${p} (${t("roles.perm.retiredBadge")})` : p))} />,
                    },
                    { header: t("roles.col.assigned"), cell: (r) => Number(r.assignedCount ?? 0) },
                    {
                      header: <span className="sr-only">{t("roles.col.actions")}</span>,
                      className: "text-right",
                      cell: (r) => {
                        const held = Number(r.assignedCount ?? 0) > 0;
                        return (
                          <Actions>
                            <Button asChild variant="outline" size="sm" className={ROW_ACTION}>
                              <Link to={`/roles/${encodeURIComponent(r.name)}`} aria-label={t("roles.editAria", { name: r.name })}>
                                <ActionLabel icon={Pencil} iconClassName={iconTone.edit}>{t("roles.manage")}</ActionLabel>
                              </Link>
                            </Button>
                            <Can route={ROUTES.createRole}>
                              <Button
                                variant="destructive"
                                size="sm"
                                className={ROW_ACTION}
                                disabled={held}
                                title={held ? t("roles.form.heldBy", { count: Number(r.assignedCount) }) : undefined}
                                onClick={() => void remove(r)}
                                aria-label={t("roles.deleteAria", { name: r.name })}
                              >
                                <ActionLabel icon={Trash2}>{t("common.delete")}</ActionLabel>
                              </Button>
                            </Can>
                          </Actions>
                        );
                      },
                    },
                  ]}
                />
              ) : null}
              <LoadMore paged={paged} />
            </CardContent>
          </Card>
        </TabsContent>
        {canCatalog ? (
          <TabsContent value="permissions">
            <PermissionCatalog />
          </TabsContent>
        ) : null}
      </Tabs>
      {dialog}
    </>
  );
}
