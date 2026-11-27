import { Alert } from "@huponx/ui-kit";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { authApi } from "../api";
import { AuthLayout, ErrorAlert, TextField, Form, SubmitButton, useSubmit } from "../components/common";

const back = "text-center text-sm text-primary underline-offset-4 hover:underline";

export function Register() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [sent, setSent] = useState(false);
  // a new account waits for an administrator: the confirmation says so instead of promising a link
  const [approval, setApproval] = useState(true);
  useEffect(() => {
    let live = true;
    authApi.registrationOpen().then(
      (r) => live && setApproval(r.approval),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  const s = useSubmit();

  async function submit() {
    const r = await s.run(() => authApi.register(email, name.trim(), i18n.resolvedLanguage ?? "en"));
    if (r !== undefined) setSent(true);
  }

  return (
    <AuthLayout title={sent ? t("register.sentTitle") : t("register.title")}>
      {sent ? (
        <Alert variant="success">{t(approval ? "register.sentPending" : "register.sent")}</Alert>
      ) : (
        <>
          <ErrorAlert error={s.error} />
          <Form onSubmit={() => void submit()}>
            <TextField label={t("register.name")} name="name" autoComplete="name" maxLength={200} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label={t("common.email")} type="email" name="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <SubmitButton busy={s.busy}>{t("register.submit")}</SubmitButton>
          </Form>
        </>
      )}
      <Link className={back} to="/login">
        {t("common.backToSignIn")}
      </Link>
    </AuthLayout>
  );
}
