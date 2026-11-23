import { Can, useAuth } from "@huponx/auth-client";
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, useAction, useFlash, useLoad } from "@huponx/ui-kit";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useIdentity, words } from "../api";
import type { ClientType, IdentityClient } from "../api";
import { Actions, DoneAlert, ErrorAlert, Loading, Modal, PageTitle, SelectField, TextAreaField, TextField } from "../components/common";
import { useConfirm } from "../components/ConfirmDialog";
import { GrantCards, PUBLIC_GRANTS, ScopeField } from "../components/ClientAccess";
import { RoleCards } from "../components/RoleCards";

/** The client secret is shown once: the server keeps only a hash. */
function SecretOnce({ clientId, secret, onClose }: { clientId: string; secret: string; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal title={t("clients.secret.title", { id: clientId })} onClose={onClose}>
      <Alert variant="warning">{t("clients.secret.warning")}</Alert>
      <code className="block rounded-md border bg-muted px-3 py-2 font-mono text-sm break-all" data-testid="client-secret">
        {secret}
      </code>
      <Actions>
        <Button variant="outline" onClick={() => void navigator.clipboard?.writeText(secret)}>
          {t("common.copy")}
        </Button>
        <Button onClick={onClose}>{t("clients.secret.saved")}</Button>
      </Actions>
    </Modal>
  );
}

/** Add (no client) or edit a client; the id and the type are fixed once the client exists. */
function Editor({ client, reload, createdNote }: { client?: IdentityClient; reload: () => void; createdNote?: string }) {
  const { t } = useTranslation();
  const api = useIdentity();
  const navigate = useNavigate();
  const { can } = useAuth();
  const editing = Boolean(client);
  const canWrite = can("identity:client:write");
  const [id, setId] = useState(client?.clientId ?? "");
  const [name, setName] = useState(client?.name ?? "");
  const [type, setType] = useState<ClientType>(client?.type ?? "CLIENT_TYPE_CONFIDENTIAL");
  const [redirects, setRedirects] = useState((client?.redirectUris ?? []).join("\n"));
  const [logouts, setLogouts] = useState((client?.postLogoutRedirectUris ?? []).join("\n"));
  const [backchannel, setBackchannel] = useState(client?.backchannelLogoutUri ?? "");
  const [grants, setGrants] = useState<string[]>(client?.allowedGrants ?? ["authorization_code", "refresh_token"]);
  const [scopes, setScopes] = useState((client?.allowedScopes ?? []).join(" "));
  const [resource, setResource] = useState(client?.resource ?? "");
  const [roles, setRoles] = useState<string[]>(client?.roles ?? []);
  const [secret, setSecret] = useState<{ id: string; value: string }>();
  const a = useAction();

  const fields = () => ({
    name,
    redirect_uris: words(redirects),
    post_logout_redirect_uris: words(logouts),
    backchannel_logout_uri: backchannel.trim(),
    allowed_grants: grants,
    allowed_scopes: words(scopes),
    resource,
    roles,
  });

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (client) {
      const r = await a.run(() => api.updateClient(client.clientId, fields()), t("clients.form.saved"));
      if (r) reload();
      return;
    }
    const r = await a.run(() => api.createClient({ client_id: id, type, ...fields() }));
    if (!r) return;
    if (r.clientSecret) setSecret({ id: r.client.clientId, value: r.clientSecret });
    else navigate(`/clients/${encodeURIComponent(r.client.clientId)}`, { state: { created: r.client.clientId } });
  }

  function secretSaved() {
    const created = secret?.id;
    setSecret(undefined);
    if (created) navigate(`/clients/${encodeURIComponent(created)}`, { state: { created } });
  }

  return (
    <>
      <PageTitle description={editing ? client?.name : t("clients.form.addIntro")}>{editing ? id : t("clients.form.addTitle")}</PageTitle>
      {createdNote ? <DoneAlert>{createdNote}</DoneAlert> : null}
      <form className="flex flex-col gap-6" onSubmit={(ev) => void submit(ev)}>
        <Card>
          <CardHeader>
            <CardTitle>{t("clients.form.details")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label={t("clients.new.id")}
                value={id}
                onChange={(e) => setId(e.target.value)}
                required
                disabled={editing}
                hint={editing ? t("clients.form.idFixed") : undefined}
              />
              <TextField label={t("clients.new.name")} value={name} onChange={(e) => setName(e.target.value)} disabled={!canWrite} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label={t("clients.new.type")}
                value={type}
                onValueChange={(v) => {
                  setType(v as ClientType);
                  if (v === "CLIENT_TYPE_PUBLIC") setGrants((g) => g.filter((x) => PUBLIC_GRANTS.includes(x)));
                }}
                disabled={editing}
                hint={editing ? t("clients.form.typeFixed") : undefined}
                options={[
                  { value: "CLIENT_TYPE_CONFIDENTIAL", label: t("clients.new.typeConfidential") },
                  { value: "CLIENT_TYPE_PUBLIC", label: t("clients.new.typePublic") },
                ]}
              />
              <TextField label={t("clients.new.resource")} value={resource} onChange={(e) => setResource(e.target.value)} required disabled={!canWrite} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("clients.form.uris")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <TextAreaField label={t("clients.new.redirects")} value={redirects} onChange={(e) => setRedirects(e.target.value)} rows={3} disabled={!canWrite} />
              <TextAreaField label={t("clients.new.logouts")} value={logouts} onChange={(e) => setLogouts(e.target.value)} rows={3} disabled={!canWrite} />
            </div>
            <TextField label={t("clients.new.backchannel")} value={backchannel} onChange={(e) => setBackchannel(e.target.value)} disabled={!canWrite} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("clients.form.access")}</CardTitle>
            <CardDescription>{t("clients.form.accessHint")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <GrantCards selected={grants} onChange={setGrants} publicClient={type === "CLIENT_TYPE_PUBLIC"} disabled={!canWrite} />
            <ScopeField value={scopes} onChange={setScopes} disabled={!canWrite} />
          </CardContent>
        </Card>
        <Can perm="identity:role:read">
          <Card>
            <CardHeader>
              <CardTitle>{t("clients.new.roles")}</CardTitle>
              <CardDescription>{t("clients.new.rolesHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <RoleCards selected={roles} onChange={setRoles} disabled={!canWrite || (editing && !can("identity:role:write"))} />
            </CardContent>
          </Card>
        </Can>
        <ErrorAlert error={a.error} />
        {editing ? <DoneAlert watch={a.doneId}>{a.done}</DoneAlert> : null}
        <Actions>
          {canWrite ? (
            <Button type="submit" busy={a.busy}>
              {editing ? t("clients.form.save") : t("clients.new.create")}
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link to="/clients">{t("common.cancel")}</Link>
          </Button>
        </Actions>
      </form>
      {secret ? <SecretOnce clientId={secret.id} secret={secret.value} onClose={secretSaved} /> : null}
    </>
  );
}

function RotateCard({ client }: { client: IdentityClient }) {
  const { t } = useTranslation();
  const api = useIdentity();
  const { confirm, dialog } = useConfirm();
  const a = useAction();
  const [secret, setSecret] = useState<string>();

  async function rotate() {
    if (!(await confirm({ title: t("clients.rotate"), message: t("clients.confirmRotate", { id: client.clientId }), confirmLabel: t("clients.rotate") }))) return;
    const s = await a.run(() => api.rotateSecret(client.clientId));
    if (s) setSecret(s);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("clients.rotate")}</CardTitle>
        <CardDescription>{t("clients.form.rotateHint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ErrorAlert error={a.error} />
        <Actions>
          <Button variant="outline" busy={a.busy} onClick={() => void rotate()}>
            {t("clients.rotate")}
          </Button>
        </Actions>
      </CardContent>
      {dialog}
      {secret ? <SecretOnce clientId={client.clientId} secret={secret} onClose={() => setSecret(undefined)} /> : null}
    </Card>
  );
}

/** Asks for the client id before the client is deleted: roles and exchange policies of the client go with it. */
function DeleteDialog({ client, onClose, onDeleted }: { client: IdentityClient; onClose: () => void; onDeleted: () => void }) {
  const { t } = useTranslation();
  const api = useIdentity();
  const [typed, setTyped] = useState("");
  const a = useAction();

  async function remove(ev: FormEvent) {
    ev.preventDefault();
    const r = await a.run(() => api.deleteClient(client.clientId));
    if (r !== undefined) onDeleted();
  }

  return (
    <Modal title={t("clients.form.deleteTitle")} onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={(ev) => void remove(ev)}>
        <Alert variant="warning">{t("clients.form.deleteWarning", { id: client.clientId })}</Alert>
        <TextField label={t("clients.form.typeToConfirm", { id: client.clientId })} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        <ErrorAlert error={a.error} />
        <Actions>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="destructive" busy={a.busy} disabled={typed !== client.clientId}>
            {t("clients.form.delete")}
          </Button>
        </Actions>
      </form>
    </Modal>
  );
}

/** Disable first, delete second: a disabled client cannot sign in, so a mistake is undone with Enable. */
function DangerCard({ client, reload }: { client: IdentityClient; reload: () => void }) {
  const { t } = useTranslation();
  const api = useIdentity();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const a = useAction();
  const disabled = Boolean(client.disabled);

  async function toggle() {
    const r = await a.run(() => api.setClientDisabled(client.clientId, !disabled));
    if (r) reload();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("clients.form.dangerTitle")}
          {disabled ? <Badge variant="destructive">{t("clients.status.disabled")}</Badge> : null}
        </CardTitle>
        <CardDescription>{disabled ? t("clients.form.disabledHint") : t("clients.form.enabledHint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ErrorAlert error={a.error} />
        <Actions>
          <Button variant="outline" busy={a.busy} onClick={() => void toggle()}>
            {disabled ? t("clients.form.enable") : t("clients.form.disable")}
          </Button>
          <Button variant="destructive" disabled={!disabled} onClick={() => setDeleting(true)}>
            {t("clients.form.delete")}
          </Button>
        </Actions>
      </CardContent>
      {deleting ? (
        <DeleteDialog client={client} onClose={() => setDeleting(false)} onDeleted={() => navigate("/clients", { state: { deleted: client.clientId } })} />
      ) : null}
    </Card>
  );
}

export function ClientForm() {
  const { id } = useParams();
  const { t } = useTranslation();
  const api = useIdentity();
  const state = useFlash<{ created?: string }>();
  const clients = useLoad(() => (id ? api.listClients() : Promise.resolve(undefined)), [api, id]);

  if (!id) return <Editor reload={() => undefined} />;
  if (clients.error) return <ErrorAlert error={clients.error} />;
  if (clients.loading) return <Loading />;
  const client = clients.data?.find((c) => c.clientId === id);
  if (!client) return <p className="py-12 text-center text-muted-foreground">{t("clients.form.notFound", { id })}</p>;

  return (
    <div className="flex flex-col gap-6">
      <Editor
        key={client.clientId}
        client={client}
        reload={clients.reload}
        createdNote={state?.created ? t("clients.form.created", { id: state.created }) : undefined}
      />
      <Can perm="identity:client:write">
        {client.type === "CLIENT_TYPE_CONFIDENTIAL" ? <RotateCard client={client} /> : null}
        <DangerCard client={client} reload={clients.reload} />
      </Can>
    </div>
  );
}
