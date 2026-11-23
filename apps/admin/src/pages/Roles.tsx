import { Can, useAuth } from "@huponx/auth-client";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger, useAction, useFlash, usePaged } from "@huponx/ui-kit";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useIdentity } from "../api";
import type { Permission, Role } from "../api";
import { ActionLabel, Actions, BadgeList, ROW_ACTION, DataTable, DoneAlert, ErrorAlert, LoadMore, Loading, Modal, PageTitle, TextField } from "../components/common";
import { useConfirm } from "../components/ConfirmDialog";
import { SearchBar } from "../components/SearchBar";

function EditDescription({ permission, onClose, onDone }: { permission: Permission; onClose: () => void; onDone: (name: string) => void }) {
  const { t } = useTranslation();
  const api = useIdentity();
  const [description, setDescription] = useState(permission.description ?? "");
  const a = useAction();

  async function save(ev: FormEvent) {
    ev.preventDefault();
    const r = await a.run(() => api.updatePermission(permission.name, description));
    if (r) {
      onDone(permission.name);
      onClose();
    }
  }

  return (
    <Modal title={t("roles.perm.editTitle", { name: permission.name })} onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={(ev) => void save(ev)}>
        <TextField label={t("roles.perm.description")} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        <ErrorAlert error={a.error} />
        <Actions>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" busy={a.busy}>
            {t("common.save")}
          </Button>
        </Actions>
      </form>
    </Modal>
  );
}

/** The catalog: what roles can be given. Anybody who can read it sees it; writers add, describe and delete. */
function PermissionCatalog() {
  const { t } = useTranslation();
  const api = useIdentity();
  const [query, setQuery] = useState("");
  const paged = usePaged((token) => api.listPermissionsPage(query, token), [api, query]);
  const { items: catalog, loading, error, reload } = paged;
  const { confirm, dialog } = useConfirm();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<Permission>();
  const [updated, setUpdated] = useState<string>();
  const add = useAction();
  const del = useAction();

  async function create(ev: FormEvent) {
    ev.preventDefault();
    const r = await add.run(() => api.createPermission({ name: name.trim(), description: description.trim() }), t("roles.perm.created", { name: name.trim() }));
    if (r) {
      setName("");
      setDescription("");
      reload();
    }
  }

  async function remove(p: Permission) {
    if (!(await confirm({ title: t("common.delete"), message: t("roles.perm.confirmDelete", { name: p.name }), confirmLabel: t("common.delete") }))) return;
    setUpdated(undefined);
    const r = await del.run(() => api.deletePermission(p.name), t("roles.perm.deleted", { name: p.name }));
    if (r !== undefined) reload();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("roles.perm.title")}</CardTitle>
        <CardDescription>{t("roles.perm.intro")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Can perm="identity:permission:write">
          <form className="flex flex-col gap-4 border-b pb-4" onSubmit={(ev) => void create(ev)}>
            <h3 className="font-medium">{t("roles.perm.new")}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label={t("roles.perm.name")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                pattern="[a-z0-9_.*\-]+(:[a-z0-9_.*\-]+)*"
                hint={t("roles.perm.nameHint")}
              />
              <TextField label={t("roles.perm.description")} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
            </div>
            <Actions>
              <Button type="submit" busy={add.busy}>
                {t("roles.perm.add")}
              </Button>
            </Actions>
            <ErrorAlert error={add.error} />
            <DoneAlert watch={add.doneId}>{add.done}</DoneAlert>
          </form>
        </Can>
        <SearchBar label={t("roles.perm.search")} hint={t("roles.perm.searchHint")} onSearch={setQuery} />
        <ErrorAlert error={error} />
        {loading ? <Loading /> : null}
        {catalog ? (
          <DataTable
            rows={catalog}
            rowKey={(p) => p.name}
            columns={[
              { header: t("roles.perm.name"), cell: (p) => <code className="break-all text-xs">{p.name}</code> },
              { header: t("roles.perm.description"), cell: (p) => p.description || "-" },
              { header: t("roles.perm.roles"), cell: (p) => Number(p.roleCount ?? 0) },
              {
                header: <span className="sr-only">{t("roles.perm.actions")}</span>,
                className: "text-right",
                cell: (p) => (
                  <Can perm="identity:permission:write">
                    <Actions>
                      <Button variant="outline" size="sm" className={ROW_ACTION} onClick={() => setEditing(p)} aria-label={t("roles.perm.editAria", { name: p.name })}>
                        <ActionLabel icon={Pencil}>{t("roles.perm.edit")}</ActionLabel>
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className={ROW_ACTION}
                        disabled={Number(p.roleCount ?? 0) > 0}
                        title={Number(p.roleCount ?? 0) > 0 ? t("roles.perm.inUse") : undefined}
                        onClick={() => void remove(p)}
                        aria-label={t("roles.perm.deleteAria", { name: p.name })}
                      >
                        <ActionLabel icon={Trash2}>{t("common.delete")}</ActionLabel>
                      </Button>
                    </Actions>
                  </Can>
                ),
              },
            ]}
          />
        ) : null}
        <LoadMore paged={paged} />
        <ErrorAlert error={del.error} />
        <DoneAlert watch={updated ?? del.doneId}>{updated ?? del.done}</DoneAlert>
      </CardContent>
      {editing ? <EditDescription permission={editing} onClose={() => setEditing(undefined)} onDone={(n) => (del.clear(), setUpdated(t("roles.perm.updated", { name: n })), reload())} /> : null}
      {dialog}
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
  const canCatalog = can("identity:permission:read");
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
          <Can perm="identity:role:write">
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
                    { header: t("roles.col.permissions"), cell: (r) => <BadgeList items={r.permissions} /> },
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
                                <ActionLabel icon={Pencil}>{t("roles.manage")}</ActionLabel>
                              </Link>
                            </Button>
                            <Can perm="identity:role:write">
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
