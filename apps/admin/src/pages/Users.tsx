import { Can } from "@huponx/auth-client";
import { Actions, Badges, Button, Card, DataTable, ErrorNotice, Loading, Modal, Notice, PageTitle, TextField } from "@huponx/ui";
import { useEffect, useState } from "react";
import { useIdentity, useAction, useLoad, words } from "../api";
import type { User } from "../api";

function Mfa({ user, onChanged }: { user: User; onChanged: () => void }) {
  const api = useIdentity();
  const { data, error, loading, reload } = useLoad(() => api.getMfa(user.id), [api, user.id, user.mfaEnabled, user.mfaEnforced]);
  const a = useAction();

  async function act(fn: () => Promise<unknown>, message: string) {
    const r = await a.run(async () => (await fn(), true), message);
    if (r) {
      reload();
      onChanged();
    }
  }

  return (
    <section aria-label="Multi-factor authentication">
      <h3>Multi-factor authentication</h3>
      <ErrorNotice error={error} />
      {loading ? <Loading /> : null}
      {data ? (
        <p data-testid="mfa-state">
          Server mode: <strong>{data.mode}</strong>. This user: {data.enabled ? "authenticator enrolled" : "not enrolled"},{" "}
          {data.enforced ? "required" : "not required"}, recovery codes left: {data.recoveryCodesLeft}.
        </p>
      ) : null}
      <Can perm="identity:mfa:write">
        <Actions>
          <Button busy={a.busy} onClick={() => void act(() => api.enforceMfa(user.id, !data?.enforced), data?.enforced ? "MFA no longer required." : "MFA is required for this user.")}>
            {data?.enforced ? "Stop requiring MFA" : "Require MFA"}
          </Button>
          {data?.enabled ? (
            <Button busy={a.busy} onClick={() => void act(() => api.setMfa(user.id, false), "MFA turned off.")}>
              Turn off
            </Button>
          ) : null}
          <Button
            variant="danger"
            busy={a.busy}
            onClick={() => window.confirm("Reset MFA? The authenticator and the recovery codes are deleted.") && void act(() => api.resetMfa(user.id), "MFA reset.")}
          >
            Reset
          </Button>
        </Actions>
        <p className="ui-field-hint">An admin cannot enroll an authenticator for a user: the user does it on their own device.</p>
      </Can>
      <ErrorNotice error={a.error} />
      {a.done ? <Notice>{a.done}</Notice> : null}
    </section>
  );
}

function RoleAssign({ user, onChanged }: { user: User; onChanged: () => void }) {
  const api = useIdentity();
  const known = useLoad(() => api.listRoles().catch(() => []), [api]);
  const [role, setRole] = useState("");
  const a = useAction();

  async function act(fn: () => Promise<unknown>) {
    const r = await a.run(async () => (await fn(), true));
    if (r) {
      setRole("");
      onChanged();
    }
  }

  return (
    <section aria-label="Roles">
      <h3>Roles</h3>
      <p>
        {user.roles.length === 0 ? <Badges items={[]} /> : null}
        {user.roles.map((r) => (
          <span key={r} className="ui-badge ui-mono">
            {r}
            <Can perm="identity:role:write">
              {" "}
              <button className="ui-btn ui-btn-link" aria-label={`Revoke ${r}`} disabled={a.busy} onClick={() => void act(() => api.revokeRole(r, { user_id: user.id }))}>
                x
              </button>
            </Can>
          </span>
        ))}
      </p>
      <Can perm="identity:role:write">
        <datalist id="known-roles">{known.data?.map((r) => <option key={r.name} value={r.name} />)}</datalist>
        <TextField label="Assign role" list="known-roles" value={role} onChange={(e) => setRole(e.target.value)} />
        <Actions>
          <Button variant="primary" busy={a.busy} disabled={!role} onClick={() => void act(() => api.assignRole(role, { user_id: user.id }))}>
            Assign
          </Button>
        </Actions>
      </Can>
      <ErrorNotice error={a.error} />
    </section>
  );
}

function Account({ user, onChanged }: { user: User; onChanged: () => void }) {
  const api = useIdentity();
  const [pw, setPw] = useState("");
  const a = useAction();

  async function act(fn: () => Promise<unknown>, message: string, changed = false) {
    const r = await a.run(async () => (await fn(), true), message);
    if (r && changed) onChanged();
    if (r) setPw("");
  }

  return (
    <Can perm="identity:user:write">
      <section aria-label="Account">
        <h3>Account</h3>
        <Actions>
          <Button busy={a.busy} onClick={() => void act(() => api.setDisabled(user.id, !user.disabled), user.disabled ? "Account enabled." : "Account disabled.", true)}>
            {user.disabled ? "Enable account" : "Disable account"}
          </Button>
          <Button busy={a.busy} onClick={() => void act(() => api.sendReset(user.id), "Password reset email sent.")}>
            Send password reset
          </Button>
        </Actions>
        <TextField label="Set a password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} hint="Checked against the password policy of identity." />
        <Actions>
          <Button busy={a.busy} disabled={!pw} onClick={() => void act(() => api.setPassword(user.id, pw), "Password changed.")}>
            Set password
          </Button>
        </Actions>
        <ErrorNotice error={a.error} />
        {a.done ? <Notice>{a.done}</Notice> : null}
      </section>
    </Can>
  );
}

function UserPanel({ user, onClose, onChanged }: { user: User; onClose: () => void; onChanged: () => void }) {
  return (
    <Modal title={user.email} onClose={onClose}>
      <p className="ui-field-hint">
        {user.name || "(no name)"} - id <span className="ui-mono">{user.id}</span> {user.disabled ? "- DISABLED" : ""}
      </p>
      <Can perm="identity:role:read">
        <RoleAssign user={user} onChanged={onChanged} />
      </Can>
      <Account user={user} onChanged={onChanged} />
      <Can perm="identity:mfa:read">
        <Mfa user={user} onChanged={onChanged} />
      </Can>
      <Actions>
        <Button onClick={onClose}>Close</Button>
      </Actions>
    </Modal>
  );
}

function CreateUser({ onDone }: { onDone: () => void }) {
  const api = useIdentity();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [roles, setRoles] = useState("");
  const a = useAction();

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const r = await a.run(() => api.createUser({ email, name, password, roles: words(roles) }), `User ${email} created.`);
    if (r) {
      setEmail("");
      setName("");
      setPassword("");
      setRoles("");
      onDone();
    }
  }

  return (
    <Card>
      <h2>New user</h2>
      <form onSubmit={(ev) => void submit(ev)}>
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="Password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} hint="Leave empty: the user sets it through a password reset." />
        <TextField label="Roles" value={roles} onChange={(e) => setRoles(e.target.value)} hint="Separated by spaces" />
        <Actions>
          <Button type="submit" variant="primary" busy={a.busy}>
            Create user
          </Button>
        </Actions>
      </form>
      <ErrorNotice error={a.error} />
      {a.done ? <Notice>{a.done}</Notice> : null}
    </Card>
  );
}

export function Users() {
  const api = useIdentity();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  // pages already loaded after the first one; the first page reloads with the search
  const [more, setMore] = useState<User[]>([]);
  const [token, setToken] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const first = useLoad(() => api.listUsers(search), [api, search]);
  const more_ = useAction();

  useEffect(() => {
    setMore([]);
    setToken("");
  }, [search, first.data]);

  const nextToken = token || first.data?.nextPageToken || "";
  const users = [...(first.data?.users ?? []), ...more];
  const selected = users.find((u) => u.id === selectedId);

  async function loadMore() {
    const r = await more_.run(() => api.listUsers(search, nextToken));
    if (r) {
      setMore((m) => [...m, ...r.users]);
      setToken(r.nextPageToken || "");
    }
  }

  return (
    <>
      <PageTitle>Users</PageTitle>
      <Card>
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            setSearch(query.trim());
          }}
        >
          <TextField label="Search by email" value={query} onChange={(e) => setQuery(e.target.value)} hint="Emails that start with this text" />
          <Actions>
            <Button type="submit">Search</Button>
          </Actions>
        </form>
        <ErrorNotice error={first.error} />
        {first.loading ? <Loading /> : null}
        {first.data ? (
          <DataTable
            rows={users}
            rowKey={(u) => u.id}
            columns={[
              { header: "Email", cell: (u) => <strong>{u.email}</strong> },
              { header: "Name", cell: (u) => u.name },
              { header: "Roles", cell: (u) => <Badges items={u.roles} /> },
              { header: "Status", cell: (u) => (u.disabled ? "disabled" : "active") },
              { header: "MFA", cell: (u) => (u.mfaEnforced ? "required" : u.mfaEnabled ? "enrolled" : "-") },
              {
                header: "",
                cell: (u) => (
                  <Button onClick={() => setSelectedId(u.id)} aria-label={`Manage ${u.email}`}>
                    Manage
                  </Button>
                ),
              },
            ]}
          />
        ) : null}
        <ErrorNotice error={more_.error} />
        {nextToken ? (
          <Actions>
            <Button busy={more_.busy} onClick={() => void loadMore()}>
              Load more
            </Button>
          </Actions>
        ) : null}
      </Card>
      <Can perm="identity:user:write">
        <CreateUser onDone={first.reload} />
      </Can>
      {selected ? <UserPanel user={selected} onClose={() => setSelectedId(undefined)} onChanged={first.reload} /> : null}
    </>
  );
}
