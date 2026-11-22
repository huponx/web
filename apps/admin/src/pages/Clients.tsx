import { Can } from "@huponx/auth-client";
import { Actions, Badges, Button, Card, DataTable, ErrorNotice, Loading, Modal, Notice, PageTitle, SelectField, TextAreaField, TextField } from "@huponx/ui";
import { useState } from "react";
import { useIdentity, useAction, useLoad, words } from "../api";
import type { ClientType, IdentityClient } from "../api";

/** The client secret is shown once: the server keeps only a hash. */
function SecretOnce({ clientId, secret, onClose }: { clientId: string; secret: string; onClose: () => void }) {
  return (
    <Modal title={`Secret of ${clientId}`} onClose={onClose}>
      <Notice kind="warn">Copy it now. It is shown once and cannot be read again; rotate the secret to get a new one.</Notice>
      <p>
        <code className="ui-mono" data-testid="client-secret">
          {secret}
        </code>
      </p>
      <Actions>
        <Button onClick={() => void navigator.clipboard?.writeText(secret)}>Copy</Button>
        <Button variant="primary" onClick={onClose}>
          I saved it
        </Button>
      </Actions>
    </Modal>
  );
}

function CreateClient({ onCreated }: { onCreated: (id: string, secret: string) => void }) {
  const api = useIdentity();
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<ClientType>("CLIENT_TYPE_CONFIDENTIAL");
  const [redirects, setRedirects] = useState("");
  const [logouts, setLogouts] = useState("");
  const [grants, setGrants] = useState("client_credentials");
  const [scopes, setScopes] = useState("");
  const [resource, setResource] = useState("");
  const [roles, setRoles] = useState("");
  const a = useAction();

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const r = await a.run(() =>
      api.createClient({
        client_id: id,
        name,
        type,
        redirect_uris: words(redirects),
        post_logout_redirect_uris: words(logouts),
        allowed_grants: words(grants),
        allowed_scopes: words(scopes),
        resource,
        roles: words(roles),
      }),
    );
    if (r) onCreated(r.client.clientId, r.clientSecret);
  }

  return (
    <Card>
      <h2>New client</h2>
      <form onSubmit={(ev) => void submit(ev)}>
        <TextField label="Client id" value={id} onChange={(e) => setId(e.target.value)} required />
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <SelectField label="Type" value={type} onChange={(e) => setType(e.target.value as ClientType)}>
          <option value="CLIENT_TYPE_CONFIDENTIAL">confidential (has a secret)</option>
          <option value="CLIENT_TYPE_PUBLIC">public (PKCE, no secret)</option>
        </SelectField>
        <TextAreaField label="Redirect URIs" value={redirects} onChange={(e) => setRedirects(e.target.value)} rows={2} />
        <TextAreaField label="Post logout redirect URIs" value={logouts} onChange={(e) => setLogouts(e.target.value)} rows={2} />
        <TextField label="Allowed grants" value={grants} onChange={(e) => setGrants(e.target.value)} hint="authorization_code refresh_token client_credentials ..." />
        <TextField label="Allowed scopes" value={scopes} onChange={(e) => setScopes(e.target.value)} hint="openid profile email ..." />
        <TextField label="Resource (default audience)" value={resource} onChange={(e) => setResource(e.target.value)} />
        <TextField label="Roles" value={roles} onChange={(e) => setRoles(e.target.value)} hint="Roles of a machine client (client_credentials)" />
        <Actions>
          <Button type="submit" variant="primary" busy={a.busy}>
            Create client
          </Button>
        </Actions>
      </form>
      <ErrorNotice error={a.error} />
    </Card>
  );
}

export function Clients() {
  const api = useIdentity();
  const { data, error, loading, reload } = useLoad(() => api.listClients(), [api]);
  const [secret, setSecret] = useState<{ id: string; value: string }>();
  const rotate = useAction();

  async function doRotate(c: IdentityClient) {
    if (!window.confirm(`Rotate the secret of ${c.clientId}? The current secret stops working.`)) return;
    const s = await rotate.run(() => api.rotateSecret(c.clientId));
    if (s) setSecret({ id: c.clientId, value: s });
  }

  return (
    <>
      <PageTitle>Clients</PageTitle>
      <Card>
        <ErrorNotice error={error} />
        <ErrorNotice error={rotate.error} />
        {loading ? <Loading /> : null}
        {data ? (
          <DataTable
            rows={data}
            rowKey={(c) => c.clientId}
            columns={[
              { header: "Client", cell: (c) => <strong>{c.clientId}</strong> },
              { header: "Name", cell: (c) => c.name },
              { header: "Type", cell: (c) => (c.type === "CLIENT_TYPE_PUBLIC" ? "public" : "confidential") },
              { header: "Grants", cell: (c) => <Badges items={c.allowedGrants} /> },
              { header: "Roles", cell: (c) => <Badges items={c.roles} /> },
              {
                header: "",
                cell: (c) =>
                  c.type === "CLIENT_TYPE_CONFIDENTIAL" ? (
                    <Can perm="identity:client:write">
                      <Button busy={rotate.busy} onClick={() => void doRotate(c)}>
                        Rotate secret
                      </Button>
                    </Can>
                  ) : null,
              },
            ]}
          />
        ) : null}
        <p className="ui-field-hint">Existing clients cannot be edited here (identity has no update call); add URIs through the identity setup Job (post_logout_uris / redirect_uris in SETUP_CONFIG).</p>
      </Card>
      <Can perm="identity:client:write">
        <CreateClient
          onCreated={(id, value) => {
            reload();
            if (value) setSecret({ id, value });
          }}
        />
      </Can>
      {secret ? <SecretOnce clientId={secret.id} secret={secret.value} onClose={() => setSecret(undefined)} /> : null}
    </>
  );
}
