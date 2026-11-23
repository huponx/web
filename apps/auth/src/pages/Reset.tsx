import { Alert } from "@huponx/ui-kit";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { authApi } from "../api";
import { AuthLayout, ErrorAlert, Field, Form, SubmitButton, useSubmit } from "../components/common";

const link = "text-center text-sm text-primary underline-offset-4 hover:underline";

/** The page of the link of the reset e-mail. */
export function Reset() {
  const { t } = useTranslation();
  const token = useSearchParams()[0].get("token") ?? "";
  const [state, setState] = useState<"checking" | "valid" | "invalid" | "done">("checking");
  const [password, setPassword] = useState("");
  const s = useSubmit();

  useEffect(() => {
    authApi.checkReset(token).then(
      () => setState("valid"),
      () => setState("invalid"),
    );
  }, [token]);

  async function submit() {
    const r = await s.run(() => authApi.reset(token, password));
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
      <AuthLayout title={t("reset.doneTitle")}>
        <Alert variant="success">{t("reset.done")}</Alert>
        <Link className={link} to="/login">
          {t("common.continue")}
        </Link>
      </AuthLayout>
    );
  return (
    <AuthLayout title={t("reset.title")}>
      <ErrorAlert message={s.error} />
      <Form onSubmit={() => void submit()}>
        <Field
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
        <SubmitButton busy={s.busy}>{t("reset.submit")}</SubmitButton>
      </Form>
    </AuthLayout>
  );
}
