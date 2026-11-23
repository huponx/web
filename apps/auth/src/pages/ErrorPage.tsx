import { Alert } from "@huponx/ui-kit";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { AuthLayout } from "../components/common";

const KNOWN = ["unknown_client", "bad_redirect", "bad_request", "not_found", "internal"];

/**
 * The page identity sends the browser to when a request cannot be answered with a redirect to the application
 * (/error?e=<code>). The text comes from the code, never from the URL.
 */
export function ErrorPage({ code }: { code?: string }) {
  const { t } = useTranslation();
  const asked = useSearchParams()[0].get("e") ?? "";
  const e = code ?? (KNOWN.includes(asked) ? asked : "internal");
  return (
    <AuthLayout title={t("errors.pageTitle")}>
      <Alert variant="destructive">{t(`errors.page.${e}`)}</Alert>
      <Link className="text-center text-sm text-primary underline-offset-4 hover:underline" to="/login">
        {t("common.backToSignIn")}
      </Link>
    </AuthLayout>
  );
}
