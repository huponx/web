import { Alert } from "@huponx/ui-kit";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, authApi } from "../api";
import { AuthLayout, ErrorAlert, TextField, Form, SubmitButton, go, useSubmit } from "../components/common";

/** A password somebody else set (the setup Job) must be replaced before the session starts. */
export function LoginPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const c = useSearchParams()[0].get("c") ?? "";
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const s = useSubmit();

  useEffect(() => {
    authApi.checkPasswordChange(c).then(
      () => setReady(true),
      () => navigate("/login", { replace: true }),
    );
  }, [c, navigate]);

  async function submit() {
    try {
      go(await authApi.changePassword(c, password, password2));
    } catch (err) {
      if (err instanceof ApiError && err.code === "challenge_expired") navigate("/login", { replace: true, state: { error: "challenge_expired" } });
      else await s.run(() => Promise.reject(err));
    }
  }

  if (!ready) return null;
  return (
    <AuthLayout title={t("passwordChange.title")}>
      <Alert variant="success">{t("passwordChange.notice")}</Alert>
      <ErrorAlert error={s.error} />
      <Form onSubmit={() => void submit()}>
        <TextField
          label={t("passwordChange.new")}
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={12}
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextField
          label={t("passwordChange.repeat")}
          type="password"
          name="password2"
          autoComplete="new-password"
          minLength={12}
          required
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
        />
        <SubmitButton busy={s.busy}>{t("passwordChange.submit")}</SubmitButton>
      </Form>
    </AuthLayout>
  );
}
