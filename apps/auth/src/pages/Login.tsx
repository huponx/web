import { useTheme } from "@huponx/ui-kit";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { authApi } from "../api";
import { AuthLayout, ErrorAlert, Field, Form, SubmitButton, go, isTheme, useSubmit } from "../components/common";

export function Login() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  // a step that sent the user back here (an expired challenge) says why
  const reason = (useLocation().state as { error?: string } | null)?.error;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const s = useSubmit();
  const { setTheme } = useTheme();

  async function submit() {
    const r = await s.run(() => authApi.login(email, password, params.get("return_to") ?? ""));
    if (r) {
      if (isTheme(r.theme)) setTheme(r.theme); // the theme of the account, kept for the next visit of these pages
      go(r);
    }
  }

  return (
    <AuthLayout title={t("login.title")}>
      <ErrorAlert message={s.error ?? (reason ? t(`errors.${reason}`) : undefined)} />
      <Form onSubmit={() => void submit()}>
        <Field label={t("common.email")} type="email" name="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label={t("common.password")} type="password" name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <SubmitButton busy={s.busy}>{t("login.submit")}</SubmitButton>
      </Form>
      <Link className="text-center text-sm text-primary underline-offset-4 hover:underline" to="/password/forgot">
        {t("login.forgot")}
      </Link>
    </AuthLayout>
  );
}
