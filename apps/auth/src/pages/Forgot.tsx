import { Alert } from "@huponx/ui-kit";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { authApi } from "../api";
import { AuthLayout, ErrorAlert, TextField, Form, SubmitButton, useSubmit } from "../components/common";

const back = "text-center text-sm text-primary underline-offset-4 hover:underline";

export function Forgot() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const s = useSubmit();

  async function submit() {
    const r = await s.run(() => authApi.forgot(email));
    if (r !== undefined) setSent(true);
  }

  return (
    <AuthLayout title={sent ? t("forgot.sentTitle") : t("forgot.title")}>
      {sent ? (
        <Alert variant="success">{t("forgot.sent")}</Alert>
      ) : (
        <>
          <ErrorAlert error={s.error} />
          <Form onSubmit={() => void submit()}>
            <TextField label={t("common.email")} type="email" name="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            <SubmitButton busy={s.busy}>{t("forgot.send")}</SubmitButton>
          </Form>
        </>
      )}
      <Link className={back} to="/login">
        {t("common.backToSignIn")}
      </Link>
    </AuthLayout>
  );
}
