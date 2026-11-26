import { Alert } from "@huponx/ui-kit";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { authApi } from "../api";
import { AuthLayout, ErrorAlert, Form, SubmitButton, go, useSubmit } from "../components/common";

/**
 * The confirmation of a sign out that an application asked for without proof (no id_token_hint). The parameters
 * come from the query; identity checks the redirect against the registered addresses of the client again.
 */
export function Logout() {
  const { t } = useTranslation();
  const p = useSearchParams()[0];
  const [done, setDone] = useState(false);
  const s = useSubmit();

  async function submit() {
    const r = await s.run(() =>
      authApi.logout({ postLogoutRedirectUri: p.get("post_logout_redirect_uri") ?? "", state: p.get("state") ?? "", clientId: p.get("client_id") ?? "" }),
    );
    if (!r) return;
    if (r.redirect) go(r, true);
    else setDone(true);
  }

  // `done`: identity signed the user out already (a logout with a valid id_token_hint and no address to go back to)
  if (done || p.get("done") === "1")
    return (
      <AuthLayout title={t("logout.doneTitle")}>
        <Alert variant="success">{t("logout.done")}</Alert>
        <Link className="text-center text-sm text-primary underline-offset-4 hover:underline" to="/login">
          {t("common.backToSignIn")}
        </Link>
      </AuthLayout>
    );
  return (
    <AuthLayout title={t("logout.title")}>
      <ErrorAlert error={s.error} />
      <Form onSubmit={() => void submit()}>
        <SubmitButton busy={s.busy}>{t("logout.submit")}</SubmitButton>
      </Form>
    </AuthLayout>
  );
}
