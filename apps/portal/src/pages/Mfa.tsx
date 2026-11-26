import { ApiError } from "@huponx/auth-client";
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ErrorAlert, TextField, useAction } from "@huponx/ui-kit";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useIdentity } from "../api";
import type { MyMfa } from "../api";

/**
 * Multi-factor authentication of the user, on the portal: turn it on (QR code, first code, recovery codes) or see its
 * status and turn it off. The steps and the limits are the ones of the sign in pages; identity does the work.
 */
export function Mfa() {
  const { t } = useTranslation();
  const api = useIdentity();
  const a = useAction();
  const [status, setStatus] = useState<MyMfa>();
  const [loadError, setLoadError] = useState<unknown>();
  // the QR code and the key, once the user asked to set MFA up
  const [setup, setSetup] = useState<{ qr?: string; secret?: string }>();
  const [off, setOff] = useState(false);
  const [codes, setCodes] = useState<string[]>();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");

  const load = useCallback(() => {
    api.getMyMfa().then(
      (s) => {
        setLoadError(undefined);
        setStatus(s);
      },
      (err: unknown) => {
        // MFA turned off on the server: there is nothing to manage, so the card is not shown
        if (err instanceof ApiError && err.reason === "mfa_disabled_on_server") setOff(true);
        else setLoadError(err);
      },
    );
  }, [api]);
  useEffect(load, [load]);

  async function begin() {
    const r = await a.run(() => api.beginMyMfa());
    if (r) setSetup(r);
  }

  async function confirm(ev: FormEvent) {
    ev.preventDefault();
    const r = await a.run(() => api.confirmMyMfa(code.trim()));
    if (r) {
      setCodes(r.recoveryCodes ?? []);
      setSetup(undefined);
      setCode("");
    }
  }

  /** Gives up the pending setup: back to "Set up" (a new try starts a new enrollment). */
  function cancel() {
    setSetup(undefined);
    setCode("");
    a.clear();
  }

  async function disable(ev: FormEvent) {
    ev.preventDefault();
    const ok = await a.run(() => api.disableMyMfa(password, code.trim()).then(() => true));
    if (ok) {
      setPassword("");
      setCode("");
      setStatus(undefined);
      load();
    }
  }

  function done() {
    setCodes(undefined);
    setStatus(undefined);
    load();
  }

  if (off) return null;

  let body;
  if (codes) {
    body = (
      <div className="flex flex-col gap-4">
        <Alert variant="warning">{t("security.mfa.codesText")}</Alert>
        <ul className="grid max-w-md grid-cols-2 gap-2">
          {codes.map((c) => (
            <li key={c}>
              <code className="break-all rounded bg-muted px-2 py-1 text-sm">{c}</code>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button onClick={done}>{t("security.mfa.codesDone")}</Button>
        </div>
      </div>
    );
  } else if (loadError) {
    body = <ErrorAlert error={loadError} />;
  } else if (status?.enabled) {
    body = status.forced ? (
      <Alert>{t("security.mfa.forced")}</Alert>
    ) : (
      <form className="flex max-w-md flex-col gap-4" onSubmit={(ev) => void disable(ev)}>
        <TextField label={t("security.mfa.password")} type="password" name="mfa-password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <TextField label={t("security.mfa.codeOrRecovery")} name="mfa-code" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
        <ErrorAlert error={a.error} />
        <div className="flex justify-end">
          <Button type="submit" variant="destructive" busy={a.busy}>
            {t("security.mfa.turnOff")}
          </Button>
        </div>
      </form>
    );
  } else if (status && !setup) {
    body = (
      <div className="flex flex-col gap-4">
        <ErrorAlert error={a.error} />
        <div className="flex justify-end">
          <Button onClick={() => void begin()} busy={a.busy}>
            {t("security.mfa.setUp")}
          </Button>
        </div>
      </div>
    );
  } else if (status && setup) {
    body = (
      <form className="flex max-w-md flex-col gap-4" onSubmit={(ev) => void confirm(ev)}>
        <p className="text-sm text-muted-foreground">{t("security.mfa.scan")}</p>
        <img className="mx-auto size-56 rounded bg-white p-2" src={setup.qr} alt={t("security.mfa.qrAlt")} width={224} height={224} />
        <p className="text-center text-sm text-muted-foreground">
          {t("security.mfa.typeKey")} <code className="break-all">{setup.secret}</code>
        </p>
        <TextField label={t("security.mfa.code")} name="mfa-code" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
        <ErrorAlert error={a.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={cancel} disabled={a.busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" busy={a.busy}>
            {t("security.mfa.turnOn")}
          </Button>
        </div>
      </form>
    );
  } else {
    body = null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("security.mfa.title")}</CardTitle>
        <CardDescription>{status?.enabled ? t("security.mfa.on", { count: status.recoveryCodesLeft ?? 0 }) : t("security.mfa.description")}</CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
