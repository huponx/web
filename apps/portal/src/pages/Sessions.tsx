import { useAuth } from "@huponx/auth-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, DoneAlert, ErrorAlert, SessionsPanel, useAction } from "@huponx/ui-kit";
import type { SessionItem, SessionsPanelLabels } from "@huponx/ui-kit";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIdentity } from "../api";

/**
 * The sessions of the user, on the Security page: one per sign in on a browser or device, with "this device" marked.
 * Another session can be signed out, or all the others; ending the current one signs the user out, so the page reloads
 * to the sign in.
 */
export function Sessions() {
  const { t, i18n } = useTranslation();
  const api = useIdentity();
  const { reload } = useAuth();
  const a = useAction();
  const [list, setList] = useState<SessionItem[]>();
  const [notice, setNotice] = useState<{ text: string; n: number }>();
  const say = (text: string) => setNotice((p) => ({ text, n: (p?.n ?? 0) + 1 }));

  const load = useCallback(() => {
    api.listMySessions().then(
      (r) => setList(r.sessions ?? []),
      () => setList((l) => l ?? []),
    );
  }, [api]);
  useEffect(load, [load]);

  if (!list) return null;
  const s = (k: string, o: Record<string, string> = {}) => t(`security.sessions.${k}`, o);
  const labels: SessionsPanelLabels = {
    none: s("none"),
    thisDevice: s("thisDevice"),
    unknownDevice: s("unknownDevice"),
    browserOnOs: (browser, os) => s("browserOnOs", { browser, os }),
    lastActive: (when) => s("lastActive", { when }),
    signedIn: (date) => s("signedIn", { date }),
    password: s("password"),
    otp: s("otp"),
    passkey: s("passkey"),
    actions: (name) => s("actions", { name }),
    revoke: s("revoke"),
    revokeOthers: s("revokeOthers"),
    confirmRevoke: (name) => s("confirmRevoke", { name }),
    confirmRevokeCurrent: (name) => s("confirmRevokeCurrent", { name }),
    confirmRevokeOthers: s("confirmRevokeOthers"),
    confirm: { title: t("security.sessions.title"), confirm: s("revoke"), cancel: t("common.cancel"), close: t("common.close") },
  };

  async function revoke(item: SessionItem) {
    if (!(await a.run(() => api.revokeMySession(item.id).then(() => true)))) return;
    if (item.current) return reload(); // signed out: back to the sign in
    say(s("revoked"));
    load();
  }

  async function revokeOthers() {
    if (await a.run(() => api.revokeMyOtherSessions().then(() => true))) {
      say(s("revokedOthers"));
      load();
    }
  }

  return (
    <Card data-testid="sessions-card">
      <CardHeader>
        <CardTitle>{s("title")}</CardTitle>
        <CardDescription>{s("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ErrorAlert error={a.error} />
        <DoneAlert watch={notice?.n}>{notice?.text}</DoneAlert>
        <SessionsPanel sessions={list} language={i18n.resolvedLanguage ?? "en"} labels={labels} onRevoke={revoke} onRevokeOthers={revokeOthers} />
      </CardContent>
    </Card>
  );
}
