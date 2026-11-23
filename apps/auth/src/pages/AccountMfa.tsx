import { Alert, Button, buttonVariants } from "@huponx/ui-kit";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { ApiError, authApi } from "../api";
import type { MfaStatus } from "../api";
import { AuthLayout, ErrorAlert, Field, Form, SubmitButton, go, useSubmit } from "../components/common";
import { ErrorPage } from "./ErrorPage";

/** Turn multi-factor authentication on (QR code, confirmation, recovery codes) or see its status and turn it off. */
export function AccountMfa() {
  const { t } = useTranslation();
  const returnTo = useSearchParams()[0].get("return_to") ?? "";
  const [status, setStatus] = useState<MfaStatus>();
  const [missing, setMissing] = useState(false);
  const [codes, setCodes] = useState<{ list: string[]; next: string }>();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const s = useSubmit();

  const load = useCallback(() => {
    authApi.mfaStatus().then(setStatus, (err) => {
      if (err instanceof ApiError && err.status === 401) {
        // no session: sign in, then come back here
        const back = `/account/mfa${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ""}`;
        window.location.assign(`/login?return_to=${encodeURIComponent(back)}`);
      } else setMissing(true);
    });
  }, [returnTo]);
  useEffect(load, [load]);

  async function confirm() {
    const r = await s.run(() => authApi.confirmMfa(code, returnTo));
    if (r) setCodes({ list: r.recoveryCodes, next: r.redirect });
  }

  async function disable() {
    const r = await s.run(() => authApi.disableMfa(password, code));
    if (r !== undefined) {
      setPassword("");
      setCode("");
      setStatus(undefined);
      load();
    }
  }

  // back to where the user came from (a path of this site), the list of applications otherwise
  const backTo = returnTo.startsWith("/") && !returnTo.startsWith("//") && !returnTo.includes("\\") ? returnTo : "/apps";
  const back = (
    <a className={buttonVariants({ variant: "ghost" })} href={backTo} data-testid="mfa-back">
      {t("common.back")}
    </a>
  );

  if (missing) return <ErrorPage code="not_found" />;
  if (codes)
    return (
      <AuthLayout signedIn title={t("account.codesTitle")}>
        <Alert variant="warning">{t("account.codesText")}</Alert>
        <ul className="grid grid-cols-2 gap-2">
          {codes.list.map((c) => (
            <li key={c}>
              <code className="break-all rounded bg-muted px-2 py-1 text-sm">{c}</code>
            </li>
          ))}
        </ul>
        <Button onClick={() => go({ redirect: codes.next })}>{t("common.continue")}</Button>
      </AuthLayout>
    );
  if (!status) return null;

  if (status.enabled)
    return (
      <AuthLayout signedIn title={t("account.title")} description={t("account.on", { count: status.codesLeft ?? 0 })}>
        {status.forced ? (
          <Alert>{t("account.forced")}</Alert>
        ) : (
          <>
            <ErrorAlert message={s.error} />
            <Form onSubmit={() => void disable()}>
              <Field label={t("common.password")} type="password" name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              <Field label={t("account.codeOrRecovery")} name="code" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
              <SubmitButton busy={s.busy} variant="destructive">
                {t("account.turnOff")}
              </SubmitButton>
            </Form>
          </>
        )}
        {back}
      </AuthLayout>
    );

  return (
    <AuthLayout signedIn title={t("account.enrollTitle")} description={t("account.scan")}>
      <img className="mx-auto size-56 rounded bg-white p-2" src={status.qr} alt={t("account.qrAlt")} width={224} height={224} />
      <p className="text-center text-sm text-muted-foreground">
        {t("account.typeKey")} <code className="break-all">{status.secret}</code>
      </p>
      <ErrorAlert message={s.error} />
      <Form onSubmit={() => void confirm()}>
        <Field label={t("account.code")} name="code" inputMode="numeric" autoComplete="one-time-code" required autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
        <SubmitButton busy={s.busy}>{t("account.turnOn")}</SubmitButton>
      </Form>
      {back}
    </AuthLayout>
  );
}
