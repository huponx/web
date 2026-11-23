import { Can, useAuth } from "@huponx/auth-client";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, useAction, useFlash, useLoad } from "@huponx/ui-kit";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useIdentity } from "../api";
import type { ExchangePolicy } from "../api";
import { ScopeField } from "../components/ClientAccess";
import { Actions, DoneAlert, ErrorAlert, Loading, PageTitle, TextField } from "../components/common";
import { useConfirm } from "../components/ConfirmDialog";
import { policyPath } from "./Exchange";

/** Add (no policy) or edit one: the client and the audience are the key, so they are fixed once the policy exists. */
function Editor({ policy, reload, createdNote }: { policy?: ExchangePolicy; reload: () => void; createdNote?: string }) {
  const { t } = useTranslation();
  const api = useIdentity();
  const navigate = useNavigate();
  const { can } = useAuth();
  const editing = Boolean(policy);
  const canWrite = can("identity:exchange:write");
  const [clientId, setClientId] = useState(policy?.clientId ?? "");
  const [audience, setAudience] = useState(policy?.audience ?? "");
  const [maxScope, setMaxScope] = useState(policy?.maxScope ?? "");
  const [depth, setDepth] = useState(String(policy?.maxChainDepth ?? 1));
  const a = useAction();
  // the clients are offered as suggestions to whoever may read them; anything else can still be typed
  const clients = useLoad(() => (!editing && can("identity:client:read") ? api.listClients() : Promise.resolve(undefined)), [api, editing, can]);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const p: ExchangePolicy = { clientId: clientId.trim(), audience: audience.trim(), maxScope: maxScope.trim().split(/\s+/).filter(Boolean).join(" "), maxChainDepth: Number(depth) };
    const r = await a.run(() => api.setPolicy(p), editing ? t("exchange.form.saved") : undefined);
    if (r === undefined) return;
    if (editing) reload();
    else navigate(policyPath(p), { state: { created: true } });
  }

  return (
    <>
      <PageTitle description={editing ? policy?.audience : t("exchange.form.addIntro")}>{editing ? policy?.clientId : t("exchange.form.addTitle")}</PageTitle>
      {createdNote ? <DoneAlert>{createdNote}</DoneAlert> : null}
      <form className="flex flex-col gap-6" onSubmit={(ev) => void submit(ev)}>
        <Card>
          <CardHeader>
            <CardTitle>{t("exchange.form.details")}</CardTitle>
            <CardDescription>{t("exchange.intro")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <TextField
                  label={t("exchange.set.client")}
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required
                  disabled={editing}
                  list={editing ? undefined : "exchange-clients"}
                  hint={editing ? t("exchange.form.keyFixed") : undefined}
                />
                {clients.data ? (
                  <datalist id="exchange-clients">
                    {clients.data.map((c) => (
                      <option key={c.clientId} value={c.clientId}>
                        {c.name}
                      </option>
                    ))}
                  </datalist>
                ) : null}
              </div>
              <TextField
                label={t("exchange.set.audience")}
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                required
                disabled={editing}
                hint={editing ? t("exchange.form.keyFixed") : t("exchange.form.audienceHint")}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("exchange.form.limits")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <ScopeField value={maxScope} onChange={setMaxScope} disabled={!canWrite} label={t("exchange.set.maxScope")} hint={t("exchange.set.maxScopeHint")} />
            <div className="max-w-xs">
              <TextField
                label={t("exchange.set.depth")}
                type="number"
                min={1}
                max={5}
                value={depth}
                onChange={(e) => setDepth(e.target.value)}
                required
                disabled={!canWrite}
                hint={t("exchange.form.depthHint")}
              />
            </div>
          </CardContent>
        </Card>
        <ErrorAlert error={a.error} />
        {editing ? <DoneAlert watch={a.doneId}>{a.done}</DoneAlert> : null}
        <Actions>
          {canWrite ? (
            <Button type="submit" busy={a.busy}>
              {editing ? t("exchange.form.save") : t("exchange.set.save")}
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link to="/exchange">{t("common.cancel")}</Link>
          </Button>
        </Actions>
      </form>
    </>
  );
}

function DeleteCard({ policy }: { policy: ExchangePolicy }) {
  const { t } = useTranslation();
  const api = useIdentity();
  const navigate = useNavigate();
  const { confirm, dialog } = useConfirm();
  const a = useAction();

  async function remove() {
    if (!(await confirm({ title: t("exchange.form.deleteTitle"), message: t("exchange.confirmDelete", { client: policy.clientId, audience: policy.audience }), confirmLabel: t("common.delete") }))) return;
    const r = await a.run(() => api.setPolicy(policy, true));
    if (r !== undefined) navigate("/exchange", { state: { deleted: true } });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("exchange.form.deleteTitle")}</CardTitle>
        <CardDescription>{t("exchange.form.deleteHint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ErrorAlert error={a.error} />
        <Actions>
          <Button variant="destructive" busy={a.busy} onClick={() => void remove()}>
            {t("exchange.form.delete")}
          </Button>
        </Actions>
      </CardContent>
      {dialog}
    </Card>
  );
}

export function ExchangeForm() {
  const { t } = useTranslation();
  const api = useIdentity();
  const [params] = useSearchParams();
  const client = params.get("client") ?? "";
  const audience = params.get("audience") ?? "";
  const editing = Boolean(client || audience);
  const state = useFlash<{ created?: boolean }>();
  const policies = useLoad(() => (editing ? api.listPolicies({ clientId: client }) : Promise.resolve(undefined)), [api, editing, client]);

  if (!editing) return <Editor reload={() => undefined} />;
  if (policies.error) return <ErrorAlert error={policies.error} />;
  if (policies.loading) return <Loading />;
  const policy = policies.data?.find((p) => p.audience === audience);
  if (!policy) return <p className="py-12 text-center text-muted-foreground">{t("exchange.form.notFound", { client, audience })}</p>;

  return (
    <div className="flex flex-col gap-6">
      <Editor key={`${policy.clientId}/${policy.audience}`} policy={policy} reload={policies.reload} createdNote={state?.created ? t("exchange.form.created") : undefined} />
      <Can perm="identity:exchange:write">
        <DeleteCard policy={policy} />
      </Can>
    </div>
  );
}
