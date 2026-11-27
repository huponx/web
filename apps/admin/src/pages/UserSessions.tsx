import { Can, P } from "@huponx/auth-client";
import { Button, SessionsPanel, useAction, useLoad } from "@huponx/ui-kit";
import { useTranslation } from "react-i18next";
import { useIdentity } from "../api";
import type { User } from "../api";
import { useConfirm } from "../components/ConfirmDialog";
import { Actions, DoneAlert, ErrorAlert, Loading } from "../components/common";
import { sessionsLabels } from "../lib/sessionsLabels";

/**
 * The sessions of a user, read-only (an administrator ends all of them, never one): the list needs
 * `identity:user:read` (the page's own permission), the button `identity:user:write`.
 */
export function UserSessions({ user }: { user: User }) {
  const { t, i18n } = useTranslation();
  const api = useIdentity();
  const { data, error, reload } = useLoad(() => api.listUserSessions(user.id).then((r) => r.sessions ?? []), [api, user.id]);
  const a = useAction();
  const { confirm, dialog } = useConfirm();

  async function revokeAll() {
    if (!(await confirm({ title: t("users.sessions.revokeAll"), message: t("users.sessions.confirmRevokeAll", { email: user.email }), confirmLabel: t("users.sessions.revokeAll") }))) return;
    if (await a.run(() => api.revokeUserSessions(user.id).then(() => true), t("users.sessions.revokedAll"))) reload();
  }

  return (
    <section aria-label={t("users.sessions.title")} className="flex flex-col gap-3" data-testid="user-sessions">
      <h3 className="font-medium">{t("users.sessions.title")}</h3>
      <p className="text-sm text-muted-foreground">{t("users.sessions.description")}</p>
      <ErrorAlert error={error} />
      {data ? <SessionsPanel sessions={data} language={i18n.resolvedLanguage ?? "en"} labels={sessionsLabels(t)} /> : error ? null : <Loading />}
      <Can perm={P.identity.userWrite}>
        <Actions className="justify-start">
          <Button variant="destructive" busy={a.busy} disabled={!data?.length} onClick={() => void revokeAll()}>
            {t("users.sessions.revokeAll")}
          </Button>
        </Actions>
      </Can>
      <ErrorAlert error={a.error} />
      <DoneAlert watch={a.doneId}>{a.done}</DoneAlert>
      {dialog}
    </section>
  );
}
