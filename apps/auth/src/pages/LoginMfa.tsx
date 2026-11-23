import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, authApi } from "../api";
import { AuthLayout, ErrorAlert, Field, Form, SubmitButton, go, useSubmit } from "../components/common";

/** The second factor of a sign in (the challenge `c` was created by the password step). */
export function LoginMfa() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const c = useSearchParams()[0].get("c") ?? "";
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState("");
  const s = useSubmit();

  useEffect(() => {
    authApi.checkMfa(c).then(
      () => setReady(true),
      () => navigate("/login", { replace: true }),
    );
  }, [c, navigate]);

  async function submit() {
    try {
      const r = await authApi.verifyMfa(c, code);
      go(r);
    } catch (err) {
      // too many wrong codes or an expired challenge: nothing left to try here
      if (err instanceof ApiError && err.code === "challenge_expired") navigate("/login", { replace: true, state: { error: "challenge_expired" } });
      else await s.run(() => Promise.reject(err));
    }
  }

  if (!ready) return null;
  return (
    <AuthLayout title={t("mfa.title")}>
      <ErrorAlert message={s.error} />
      <Form onSubmit={() => void submit()}>
        <Field label={t("mfa.code")} name="code" inputMode="text" autoComplete="one-time-code" required autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
        <SubmitButton busy={s.busy}>{t("mfa.submit")}</SubmitButton>
      </Form>
    </AuthLayout>
  );
}
