import { Can } from "@huponx/auth-client";
import { Actions, Button, Card, DataTable, ErrorNotice, Loading, Notice, PageTitle, TextField } from "@huponx/ui";
import { useState } from "react";
import { useIdentity, useAction, useLoad } from "../api";
import type { ExchangePolicy } from "../api";

export function Exchange() {
  const api = useIdentity();
  const { data, error, loading, reload } = useLoad(() => api.listPolicies(), [api]);
  const [clientId, setClientId] = useState("");
  const [audience, setAudience] = useState("");
  const [maxScope, setMaxScope] = useState("");
  const [depth, setDepth] = useState("1");
  const a = useAction();

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    const p: ExchangePolicy = { clientId, audience, maxScope, maxChainDepth: Number(depth) };
    const r = await a.run(() => api.setPolicy(p), "Policy saved.");
    if (r !== undefined) reload();
  }

  async function remove(p: ExchangePolicy) {
    if (!window.confirm(`Delete the policy of ${p.clientId} for ${p.audience}? Exchanges stop working (deny by default).`)) return;
    const r = await a.run(() => api.setPolicy(p, true), "Policy deleted.");
    if (r !== undefined) reload();
  }

  return (
    <>
      <PageTitle>Exchange policies</PageTitle>
      <Card>
        <p className="ui-field-hint">Token exchange is denied unless a policy allows the calling client to obtain a token for the audience.</p>
        <ErrorNotice error={error} />
        {loading ? <Loading /> : null}
        {data ? (
          <DataTable
            rows={data}
            rowKey={(p) => `${p.clientId}/${p.audience}`}
            columns={[
              { header: "Client", cell: (p) => <strong>{p.clientId}</strong> },
              { header: "Audience", cell: (p) => p.audience },
              { header: "Max scope", cell: (p) => p.maxScope || "(none)" },
              { header: "Chain depth", cell: (p) => p.maxChainDepth },
              {
                header: "",
                cell: (p) => (
                  <Can perm="identity:exchange:write">
                    <Button variant="danger" onClick={() => void remove(p)}>
                      Delete
                    </Button>
                  </Can>
                ),
              },
            ]}
          />
        ) : null}
      </Card>
      <Can perm="identity:exchange:write">
        <Card>
          <h2>Set a policy</h2>
          <form onSubmit={(ev) => void save(ev)}>
            <TextField label="Client id" value={clientId} onChange={(e) => setClientId(e.target.value)} required />
            <TextField label="Audience" value={audience} onChange={(e) => setAudience(e.target.value)} required />
            <TextField label="Max scope" value={maxScope} onChange={(e) => setMaxScope(e.target.value)} hint="Space separated" />
            <TextField label="Max chain depth" type="number" min={1} max={5} value={depth} onChange={(e) => setDepth(e.target.value)} />
            <Actions>
              <Button type="submit" variant="primary" busy={a.busy}>
                Save policy
              </Button>
            </Actions>
          </form>
          <ErrorNotice error={a.error} />
          {a.done ? <Notice>{a.done}</Notice> : null}
        </Card>
      </Can>
    </>
  );
}
