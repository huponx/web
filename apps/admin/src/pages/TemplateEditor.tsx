import { Can } from "@huponx/auth-client";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, TextAreaField, TextField, useAction, useLoad } from "@huponx/ui-kit";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { useConfirm } from "../components/ConfirmDialog";
import { DoneAlert, ErrorAlert, Loading, PageTitle } from "../components/common";
import { ROUTES } from "../authz";
import { useCourier, when } from "../courier";
import type { Content, EventType } from "../courier";

/** Edit one template (a channel of a language): the text, a preview with sample data, the versions, revert. */
export function TemplateEditor() {
  const { t, i18n } = useTranslation();
  const { template = "", locale = "", channel = "" } = useParams();
  const api = useCourier();
  const nav = useNavigate();
  const { confirm, dialog } = useConfirm();
  const doc = useLoad(() => api.getTemplate(template, locale, channel), [api, template, locale, channel]);
  const versions = useLoad(() => api.versions(template, locale, channel), [api, template, locale, channel]);
  const types = useLoad(() => api.eventTypes(), [api]);
  const isDigest = template.endsWith("_digest");
  const type: EventType | undefined = types.data?.eventTypes.find((e) => e.template === template || `${e.template}_digest` === template);

  const [draft, setDraft] = useState<Content>({});
  const [rendered, setRendered] = useState<Content>();
  const save = useAction();
  const preview = useAction();
  const revert = useAction();
  useEffect(() => {
    if (doc.data) {
      setDraft({ subject: doc.data.content?.subject ?? "", text: doc.data.content?.text ?? "", html: doc.data.content?.html ?? "" });
      setRendered(undefined);
    }
  }, [doc.data]);

  const isEmail = channel === "email";
  const isTelegram = channel === "telegram";
  const keys = [...(type?.required ?? []), ...(type?.optional ?? []), "name", ...(isDigest ? ["count", "items"] : [])];

  async function doPreview() {
    const r = await preview.run(() => api.previewTemplate(template, locale, channel, draft));
    if (r) setRendered(r);
  }

  async function doSave() {
    const r = await save.run(() => api.saveTemplate(template, locale, channel, draft), t("templateEditor.saved"));
    if (r) {
      doc.reload();
      versions.reload();
    }
  }

  async function doRevert() {
    if (!(await confirm({ title: t("templateEditor.revert"), message: t("templateEditor.confirmRevert"), confirmLabel: t("templateEditor.revert") }))) return;
    const r = await revert.run(() => api.revertTemplate(template, locale, channel).then(() => true), t("templateEditor.reverted"));
    if (r) {
      doc.reload();
      versions.reload();
    }
  }

  return (
    <>
      {dialog}
      <PageTitle description={isDigest ? t("templateEditor.digestIntro", { window: type?.digestWindow ?? "" }) : t("templateEditor.intro")}>{type?.type ?? template}</PageTitle>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary">{locale}</Badge>
        <Badge variant="secondary">{t(`templates.channel.${channel}`)}</Badge>
        {doc.data?.customized ? <Badge>{t("templateEditor.customized", { version: doc.data.version })}</Badge> : <Badge variant="secondary">{t("templateEditor.builtIn")}</Badge>}
        {doc.data?.customized && doc.data.updatedBy ? (
          <span className="text-muted-foreground">
            {t("templateEditor.updatedBy", { by: doc.data.updatedBy, at: when(doc.data.updatedAt, i18n.language) })}
          </span>
        ) : null}
      </div>

      <ErrorAlert error={doc.error} />
      {doc.loading ? <Loading /> : null}
      {doc.data ? (
        <div className="mt-4 flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("templateEditor.content")}</CardTitle>
              <CardDescription>
                {t("templateEditor.keys")} {keys.map((k) => <code key={k} className="mr-1 rounded bg-muted px-1">{`{{.${k}}}`}</code>)}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {!isTelegram ? (
                <TextField label={channel === "in_app" ? t("templateEditor.title") : t("templateEditor.subject")} value={draft.subject ?? ""} onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))} clearable={false} />
              ) : null}
              <TextAreaField label={channel === "in_app" ? t("templateEditor.body") : t("templateEditor.text")} rows={8} value={draft.text ?? ""} onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} />
              {isEmail ? <TextAreaField label={t("templateEditor.html")} hint={t("templateEditor.htmlHint")} rows={10} value={draft.html ?? ""} onChange={(e) => setDraft((d) => ({ ...d, html: e.target.value }))} /> : null}
              <ErrorAlert error={save.error ?? preview.error ?? revert.error} />
              <DoneAlert watch={save.done ? save.doneId : revert.doneId}>{save.done ?? revert.done}</DoneAlert>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" busy={preview.busy} onClick={() => void doPreview()}>
                  {t("templateEditor.preview")}
                </Button>
                <Can route={ROUTES.putTemplate}>
                  {doc.data.customized ? (
                    <Button variant="outline" busy={revert.busy} onClick={() => void doRevert()}>
                      {t("templateEditor.revert")}
                    </Button>
                  ) : null}
                  <Button busy={save.busy} onClick={() => void doSave()}>
                    {t("common.save")}
                  </Button>
                </Can>
                <Button variant="ghost" onClick={() => nav("/templates")}>
                  {t("common.close")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {rendered ? (
            <Card data-testid="template-preview">
              <CardHeader>
                <CardTitle>{t("templateEditor.previewTitle")}</CardTitle>
                <CardDescription>{t("templateEditor.previewHint")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {rendered.subject ? <strong data-testid="preview-subject">{rendered.subject}</strong> : null}
                {rendered.text ? <pre className="whitespace-pre-wrap rounded bg-muted p-3 text-sm" data-testid="preview-text">{rendered.text}</pre> : null}
                {rendered.html ? <iframe title={t("templateEditor.html")} sandbox="" srcDoc={rendered.html} className="h-96 w-full rounded border bg-white" /> : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t("templateEditor.versions")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {versions.data?.length === 0 ? <p className="text-sm text-muted-foreground">{t("templateEditor.noVersions")}</p> : null}
              {(versions.data ?? []).map((v) => (
                <div key={v.version} className="flex items-center justify-between gap-2 text-sm" data-testid="template-version">
                  <span>
                    <strong>v{v.version}</strong> · {v.updatedBy || "?"} · {when(v.updatedAt, i18n.language)}
                    {v.reverted ? <Badge variant="secondary" className="ml-2">{t("templateEditor.revertedEntry")}</Badge> : null}
                  </span>
                  {!v.reverted && v.content ? (
                    <Button variant="ghost" size="sm" onClick={() => setDraft({ subject: v.content?.subject ?? "", text: v.content?.text ?? "", html: v.content?.html ?? "" })}>
                      {t("templateEditor.useVersion")}
                    </Button>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
