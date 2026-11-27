import { Alert } from "@huponx/ui-kit";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, authApi } from "../api";
import { AuthLayout, ErrorAlert, TextField, Form, SubmitButton, useSubmit } from "../components/common";

const link = "text-center text-sm text-primary underline-offset-4 hover:underline";

/** The page of the link of the reset e-mail; with `first` the one of the welcome e-mail (the first password: same form, other words). */
export function Reset({ first = false }: { first?: boolean }) {
  const { t } = useTranslation();
  const k = first ? "setPassword" : "reset";
  const token = useSearchParams()[0].get("token") ?? "";
  const [state, setState] = useState<"checking" | "valid" | "invalid" | "done">("checking");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const s = useSubmit();

  useEffect(() => {
    authApi.checkReset(token).then(
      () => setState("valid"),
      () => setState("invalid"),
    );
  }, [token]);

  async function submit() {
    // the confirmation is checked here: the server only takes the new password
    const r = await s.run(() => (password === password2 ? authApi.reset(token, password) : Promise.reject(new ApiError(400, "password_mismatch", "password_mismatch"))));
    if (r !== undefined) setState("done");
  }

  if (state === "checking") return null;
  if (state === "invalid")
    return (
      <AuthLayout title={t("reset.invalidTitle")}>
        <Alert variant="destructive">{t("reset.invalid")}</Alert>
        <Link className={link} to="/password/forgot">
          {t("reset.askAgain")}
        </Link>
      </AuthLayout>
    );
  if (state === "done")
    return (
      <AuthLayout title={t(`${k}.doneTitle`)}>
        <Alert variant="success">{t(`${k}.done`)}</Alert>
        <Link className={link} to="/login">
          {t(first ? "setPassword.signIn" : "common.continue")}
        </Link>
      </AuthLayout>
    );
  return (
    <AuthLayout title={t(`${k}.title`)}>
      <ErrorAlert error={s.error} />
      <Form onSubmit={() => void submit()}>
        <TextField
          label={t("reset.new")}
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
          label={t("reset.repeat")}
          type="password"
          name="password2"
          autoComplete="new-password"
          minLength={12}
          required
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
        />
        <SubmitButton busy={s.busy}>{t(`${k}.submit`)}</SubmitButton>
      </Form>
    </AuthLayout>
  );
}
