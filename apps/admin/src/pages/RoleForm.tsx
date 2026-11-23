import { Can, useAuth } from "@huponx/auth-client";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, useAction, useFlash, useLoad } from "@huponx/ui-kit";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useIdentity } from "../api";
import type { Permission, Role } from "../api";
import { Actions, DoneAlert, ErrorAlert, Loading, PageTitle, TextField } from "../components/common";
import { useConfirm } from "../components/ConfirmDialog";
import { PermissionPicker, usePermissionCatalog } from "../components/PermissionPicker";

/** Add (no role) or edit a role: description and permissions; the name is fixed once the role exists. */
function Editor({ role, catalog, reload, createdNote }: { role?: Role; catalog?: Permission[]; reload: () => void; createdNote?: string }) {
  const { t } = useTranslation();
  const api = useIdentity();
  const navigate = useNavigate();
  const { can } = useAuth();
  const editing = Boolean(role);
  const canWrite = can("identity:role:write");
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [perms, setPerms] = useState<string[]>(role?.permissions ?? []);
  const a = useAction();

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (editing) {
      const r = await a.run(() => api.updateRole(name, { description, permissions: perms }), t("roles.form.saved"));
      if (r) reload();
      return;
    }
    const r = await a.run(() => api.createRole({ name, description, permissions: perms }));
    if (r) navigate(`/roles/${encodeURIComponent(r.name)}`, { state: { created: r.name } });
  }

  return (
    <>
      <PageTitle description={editing ? role?.description || undefined : t("roles.form.addIntro")}>{editing ? name : t("roles.form.addTitle")}</PageTitle>
      {createdNote ? <DoneAlert>{createdNote}</DoneAlert> : null}
      <form className="flex flex-col gap-6" onSubmit={(ev) => void submit(ev)}>
        <Card>
          <CardHeader>
            <CardTitle>{t("roles.form.details")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <TextField
              label={t("roles.new.name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              pattern="[a-z][a-z0-9_.\-]*"
              hint={editing ? t("roles.form.nameFixed") : t("roles.new.nameHint")}
              disabled={editing}
            />
            <TextField label={t("roles.new.description")} value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canWrite} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("roles.col.permissions")}</CardTitle>
            <CardDescription>{catalog ? t("roles.new.pickHint") : t("roles.new.permissionsHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <PermissionPicker catalog={catalog} value={perms} onChange={setPerms} label={t("roles.col.permissions")} hideLabel disabled={!canWrite} />
          </CardContent>
        </Card>
        <ErrorAlert error={a.error} />
        {editing ? <DoneAlert watch={a.doneId}>{a.done}</DoneAlert> : null}
        <Actions>
          {canWrite ? (
            <Button type="submit" busy={a.busy}>
              {editing ? t("roles.form.save") : t("roles.new.create")}
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link to="/roles">{t("common.cancel")}</Link>
          </Button>
        </Actions>
      </form>
    </>
  );
}

/** Deleting is refused while a user or a client holds the role (identity checks it again). */
function DeleteCard({ role }: { role: Role }) {
  const { t } = useTranslation();
  const api = useIdentity();
  const navigate = useNavigate();
  const { confirm, dialog } = useConfirm();
  const a = useAction();
  const held = Number(role.assignedCount ?? 0);

  async function remove() {
    if (!(await confirm({ title: t("roles.form.deleteTitle"), message: t("roles.form.confirmDelete", { name: role.name }), confirmLabel: t("common.delete") }))) return;
    const r = await a.run(() => api.deleteRole(role.name));
    if (r !== undefined) navigate("/roles", { state: { deleted: role.name } });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("roles.form.deleteTitle")}</CardTitle>
        <CardDescription>{held > 0 ? t("roles.form.heldBy", { count: held }) : t("roles.form.deleteHint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ErrorAlert error={a.error} />
        <Actions>
          <Button variant="destructive" disabled={held > 0} busy={a.busy} onClick={() => void remove()}>
            {t("roles.form.delete")}
          </Button>
        </Actions>
      </CardContent>
      {dialog}
    </Card>
  );
}

export function RoleForm() {
  const { name } = useParams();
  const { t } = useTranslation();
  const api = useIdentity();
  const state = useFlash<{ created?: string }>();
  const catalog = usePermissionCatalog();
  const roles = useLoad(() => (name ? api.listRoles() : Promise.resolve(undefined)), [api, name]);

  if (!name) return <Editor catalog={catalog.data} reload={() => undefined} />;
  if (roles.error) return <ErrorAlert error={roles.error} />;
  if (roles.loading || (catalog.allowed && catalog.loading)) return <Loading />;
  const role = roles.data?.find((r) => r.name === name);
  if (!role) return <p className="py-12 text-center text-muted-foreground">{t("roles.form.notFound", { name })}</p>;

  return (
    <div className="flex flex-col gap-6">
      <Editor
        key={role.name}
        role={role}
        catalog={catalog.data}
        reload={roles.reload}
        createdNote={state?.created ? t("roles.new.created", { name: state.created }) : undefined}
      />
      <Can perm="identity:role:write">
        <DeleteCard role={role} />
      </Can>
    </div>
  );
}
