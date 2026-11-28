import { Can } from "@huponx/auth-client";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, SelectField, SwitchRow, TextAreaField, TextField, useAction, useLoad } from "@huponx/ui-kit";
import { Pencil, Plus, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { words } from "../api";
import { useConfirm } from "../components/ConfirmDialog";
import { ActionLabel, Actions, DataTable, DoneAlert, ErrorAlert, Loading, PageTitle, ROW_ACTION } from "../components/common";
import { ROUTES } from "../authz";
import { useCourier } from "../courier";
import type { Webhook } from "../courier";

const EMPTY: Omit<Webhook, "id"> = { name: "", url: "", kind: "slack", events: [], enabled: true };

/** The webhooks that receive events: a Slack channel, or any service that takes a signed JSON POST. */
export function Webhooks() {
  const { t } = useTranslation();
  const api = useCourier();
  const { confirm, dialog } = useConfirm();
  const list = useLoad(() => api.webhooks(), [api]);
  const save = useAction();
  const del = useAction();
  const test = useAction();
  // the form: undefined closed, an id or "" (new) open
  const [editing, setEditing] = useState<string>();
  const [draft, setDraft] = useState<Omit<Webhook, "id">>(EMPTY);
  const [eventsText, setEventsText] = useState("");
  const [secret, setSecret] = useState("");
  const [tested, setTested] = useState<{ ok: boolean; text: string }>();

  function open(w?: Webhook) {
    setEditing(w?.id ?? "");
    setDraft(w ? { name: w.name, url: w.url, kind: w.kind, events: w.events, enabled: w.enabled !== false } : EMPTY);
    setEventsText((w?.events ?? []).join("\n"));
    setSecret("");
  }

  async function submit(rotate = false) {
    const r = await save.run(() => api.saveWebhook({ ...draft, id: editing || undefined, events: words(eventsText) }, rotate), t("webhooks.saved"));
    if (!r) return;
    setSecret(r.secret);
    if (!r.secret) setEditing(undefined);
    else setEditing(r.webhook?.id);
    list.reload();
  }

  async function remove(w: Webhook) {
    if (!(await confirm({ title: t("common.delete"), message: t("webhooks.confirmDelete", { name: w.name }), confirmLabel: t("common.delete") }))) return;
    if ((await del.run(() => api.deleteWebhook(w.id).then(() => true), t("webhooks.deleted"))) !== undefined) list.reload();
  }

  async function runTest(w: Webhook) {
    setTested(undefined);
    const r = await test.run(() => api.testWebhook(w.id));
    if (r) setTested({ ok: r.ok === true, text: `${w.name}: ${r.result ?? ""}` });
  }

  return (
    <>
      {dialog}
      <PageTitle description={t("webhooks.intro")}>{t("webhooks.title")}</PageTitle>
      <Can route={ROUTES.putWebhook}>
        <Actions>
          <Button onClick={() => open()}>
            <Plus aria-hidden="true" />
            {t("webhooks.add")}
          </Button>
        </Actions>
      </Can>

      {editing !== undefined ? (
        <Card className="mt-4" data-testid="webhook-form">
          <CardHeader>
            <CardTitle>{editing ? t("webhooks.edit") : t("webhooks.new")}</CardTitle>
            <CardDescription>{t("webhooks.eventsHint")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <TextField label={t("webhooks.name")} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} maxLength={100} clearable={false} />
            <SelectField
              label={t("webhooks.kind")}
              value={draft.kind}
              onValueChange={(v) => setDraft((d) => ({ ...d, kind: v as Webhook["kind"] }))}
              options={[
                { value: "slack", label: t("webhooks.kinds.slack") },
                { value: "generic", label: t("webhooks.kinds.generic") },
              ]}
            />
            <TextField label={t("webhooks.url")} hint={t("webhooks.urlHint")} value={draft.url} onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))} clearable={false} />
            <TextAreaField label={t("webhooks.events")} hint={t("webhooks.eventsExamples")} rows={3} value={eventsText} onChange={(e) => setEventsText(e.target.value)} />
            <SwitchRow label={t("webhooks.enabled")} checked={draft.enabled !== false} onChange={(v) => setDraft((d) => ({ ...d, enabled: v }))} />
            {secret ? (
              <div className="rounded border p-3 text-sm" data-testid="webhook-secret">
                <p className="font-medium">{t("webhooks.secretTitle")}</p>
                <p className="text-muted-foreground">{t("webhooks.secretHint")}</p>
                <code className="mt-2 block break-all rounded bg-muted p-2">{secret}</code>
              </div>
            ) : null}
            <ErrorAlert error={save.error} />
            <DoneAlert watch={save.doneId}>{save.done}</DoneAlert>
            <div className="flex flex-wrap justify-end gap-2">
              {editing && draft.kind === "generic" ? (
                <Button variant="outline" busy={save.busy} onClick={() => void submit(true)}>
                  {t("webhooks.rotate")}
                </Button>
              ) : null}
              <Button variant="ghost" onClick={() => setEditing(undefined)}>
                {t("common.close")}
              </Button>
              <Button busy={save.busy} onClick={() => void submit(false)}>
                {t("common.save")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardContent className="flex flex-col gap-4">
          <ErrorAlert error={list.error ?? del.error ?? test.error} />
          <DoneAlert watch={del.doneId}>{del.done}</DoneAlert>
          {tested ? (
            <p role="status" className={tested.ok ? "text-sm text-emerald-700 dark:text-emerald-400" : "text-sm text-destructive"} data-testid="webhook-test-result">
              {tested.ok ? t("webhooks.testOk") : t("webhooks.testFailed")} {tested.text}
            </p>
          ) : null}
          {list.loading ? <Loading /> : null}
          {list.data ? (
            <DataTable<Webhook>
              rows={list.data}
              rowKey={(w) => w.id}
              columns={[
                {
                  header: t("webhooks.name"),
                  cell: (w) => (
                    <div className="flex flex-col">
                      <strong>{w.name}</strong>
                      <span className="max-w-xs truncate text-xs text-muted-foreground" title={w.url}>{w.url}</span>
                    </div>
                  ),
                },
                { header: t("webhooks.kind"), cell: (w) => t(`webhooks.kinds.${w.kind}`) },
                { header: t("webhooks.events"), cell: (w) => <span className="flex flex-wrap gap-1">{w.events.map((e) => <Badge key={e} variant="secondary">{e}</Badge>)}</span> },
                { header: t("webhooks.status"), cell: (w) => <Badge variant={w.enabled ? "default" : "secondary"}>{w.enabled ? t("webhooks.on") : t("webhooks.off")}</Badge> },
                {
                  header: <span className="sr-only">{t("webhooks.actions")}</span>,
                  className: "text-right",
                  cell: (w) => (
                    <Can route={ROUTES.putWebhook}>
                      <Actions>
                        <Button variant="outline" size="sm" className={ROW_ACTION} onClick={() => void runTest(w)} aria-label={t("webhooks.testAria", { name: w.name })}>
                          <ActionLabel icon={Zap}>{t("webhooks.test")}</ActionLabel>
                        </Button>
                        <Button variant="outline" size="sm" className={ROW_ACTION} onClick={() => open(w)} aria-label={t("webhooks.editAria", { name: w.name })}>
                          <ActionLabel icon={Pencil}>{t("webhooks.edit")}</ActionLabel>
                        </Button>
                        <Button variant="destructive" size="sm" className={ROW_ACTION} onClick={() => void remove(w)} aria-label={t("webhooks.deleteAria", { name: w.name })}>
                          <ActionLabel icon={Trash2}>{t("common.delete")}</ActionLabel>
                        </Button>
                      </Actions>
                    </Can>
                  ),
                },
              ]}
            />
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
