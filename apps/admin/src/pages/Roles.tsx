import { Can } from "@huponx/auth-client";
import { Actions, Badges, Button, Card, DataTable, ErrorNotice, Loading, Modal, Notice, PageTitle, TextAreaField, TextField } from "@huponx/ui";
import { useState } from "react";
import { useIdentity, useAction, useLoad, words } from "../api";
import type { Role } from "../api";

function CreateRole({ onDone }: { onDone: () => void }) {
  const api = useIdentity();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [perms, setPerms] = useState("");
  const a = useAction();

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const r = await a.run(() => api.createRole({ name, description, permissions: words(perms) }), `Role ${name} created.`);
    if (r) {
      setName("");
      setDescription("");
      setPerms("");
      onDone();
    }
  }

  return (
    <Card>
      <h2>New role</h2>
      <form onSubmit={(ev) => void submit(ev)}>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required pattern="[a-z][a-z0-9_-]*" hint="lower case, e.g. support" />
        <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <TextAreaField
          label="Permissions"
          value={perms}
          onChange={(e) => setPerms(e.target.value)}
          hint="Separated by spaces or new lines, e.g. identity:user:read bill:*"
        />
        <Actions>
          <Button type="submit" variant="primary" busy={a.busy}>
            Create role
          </Button>
        </Actions>
      </form>
      <ErrorNotice error={a.error} />
      {a.done ? <Notice>{a.done}</Notice> : null}
    </Card>
  );
}

function EditPermissions({ role, onClose, onDone }: { role: Role; onClose: () => void; onDone: () => void }) {
  const api = useIdentity();
  const [perms, setPerms] = useState(role.permissions.join("\n"));
  const a = useAction();

  async function save() {
    const r = await a.run(() => api.setRolePermissions(role.name, words(perms)));
    if (r) {
      onDone();
      onClose();
    }
  }

  return (
    <Modal title={`Permissions of ${role.name}`} onClose={onClose}>
      <TextAreaField label="Permissions" value={perms} onChange={(e) => setPerms(e.target.value)} rows={8} hint="This replaces the whole list." />
      <ErrorNotice error={a.error} />
      <Actions>
        <Button variant="primary" busy={a.busy} onClick={() => void save()}>
          Save
        </Button>
        <Button onClick={onClose}>Cancel</Button>
      </Actions>
    </Modal>
  );
}

export function Roles() {
  const api = useIdentity();
  const { data, error, loading, reload } = useLoad(() => api.listRoles(), [api]);
  const [editing, setEditing] = useState<Role>();

  return (
    <>
      <PageTitle>Roles</PageTitle>
      <Card>
        <ErrorNotice error={error} />
        {loading ? <Loading /> : null}
        {data ? (
          <DataTable
            rows={data}
            rowKey={(r) => r.name}
            columns={[
              { header: "Role", cell: (r) => <strong>{r.name}</strong> },
              { header: "Description", cell: (r) => r.description },
              { header: "Permissions", cell: (r) => <Badges items={r.permissions} /> },
              {
                header: "",
                cell: (r) => (
                  <Can perm="identity:role:write">
                    <Button onClick={() => setEditing(r)}>Edit permissions</Button>
                  </Can>
                ),
              },
            ]}
          />
        ) : null}
      </Card>
      <Can perm="identity:role:write">
        <CreateRole onDone={reload} />
      </Can>
      {editing ? <EditPermissions role={editing} onClose={() => setEditing(undefined)} onDone={reload} /> : null}
    </>
  );
}
