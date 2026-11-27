import { Button, passkeysSupported, rememberPasskey } from "@huponx/ui-kit";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, authApi } from "../api";
import type { MfaMethods } from "../api";
import { askPasskey } from "../components/passkey";
import { AuthLayout, ErrorAlert, TextField, Form, SubmitButton, go, useSubmit } from "../components/common";

/** The second factor of a sign in (the challenge `c` was created by the password step): a code, a passkey, or either. */
export function LoginMfa() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const c = useSearchParams()[0].get("c") ?? "";
  const [methods, setMethods] = useState<MfaMethods>();
  const [code, setCode] = useState("");
  const s = useSubmit();

  useEffect(() => {
    authApi.checkMfa(c).then(
      setMethods,
      () => navigate("/login", { replace: true }),
    );
  }, [c, navigate]);

  /** Runs a step; too many wrong tries or an expired challenge leave nothing to try here. */
  async function step(fn: () => Promise<{ redirect?: string } | undefined>) {
    try {
      const r = await fn();
      if (r) go(r, true);
    } catch (err) {
      if (err instanceof ApiError && err.code === "challenge_expired") navigate("/login", { replace: true, state: { error: "challenge_expired" } });
      else await s.run(() => Promise.reject(err));
    }
  }

  const submit = () => step(() => authApi.verifyMfa(c, code));

  const passkey = () =>
    step(async () => {
      const begin = await authApi.mfaPasskeyBegin(c);
      const credential = await askPasskey(begin.options);
      if (!credential) return undefined;
      const r = await authApi.mfaPasskeyFinish(c, credential);
      rememberPasskey();
      return r;
    });

  if (!methods) return null;
  const canPasskey = methods.passkey && passkeysSupported();
  return (
    <AuthLayout title={t("mfa.title")} description={methods.passkey && !methods.totp ? t("mfa.passkeyOnly") : undefined}>
      <ErrorAlert error={s.error} />
      {canPasskey && (
        <Button type="button" busy={s.busy} autoFocus={!methods.totp} data-testid="mfa-passkey" onClick={() => void passkey()}>
          {t("mfa.passkey")}
        </Button>
      )}
      {methods.passkey && !methods.totp && !canPasskey && <ErrorAlert error={t("passkeys.unsupported")} />}
      {canPasskey && methods.totp && <p className="text-center text-sm text-muted-foreground">{t("mfa.orPasskey")}</p>}
      {methods.totp && (
        <Form onSubmit={() => void submit()}>
          <TextField label={t("mfa.code")} name="code" inputMode="text" autoComplete="one-time-code" required autoFocus={!canPasskey} value={code} onChange={(e) => setCode(e.target.value)} />
          <SubmitButton busy={s.busy}>{t("mfa.submit")}</SubmitButton>
        </Form>
      )}
    </AuthLayout>
  );
}
