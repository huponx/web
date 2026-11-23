import { buttonVariants } from "@huponx/ui-kit";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, authApi } from "../api";
import type { AppsInfo } from "../api";
import { AuthLayout } from "../components/common";
import { ErrorPage } from "./ErrorPage";

/** Where a user lands after signing in at identity itself (no application sent them): the applications to go to. */
export function Apps() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<AppsInfo>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    authApi.apps().then((i) => {
      setInfo(i);
    }, (err) => {
      // no session: sign in, then come back here
      if (err instanceof ApiError && err.status === 401) window.location.assign(`/login?return_to=${encodeURIComponent("/apps")}`);
      else setFailed(true);
    });
  }, []);

  if (failed) return <ErrorPage code="internal" />;
  if (!info) return null;
  return (
    <AuthLayout signedIn title={t("apps.title")} description={t("apps.signedInAs", { who: info.name || info.email })}>
      {info.apps.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">{t("apps.none")}</p>
      ) : (
        <ul className="grid gap-2" aria-label={t("apps.title")}>
          {info.apps.map((a) => (
            <li key={a.url}>
              <a className={buttonVariants({ variant: "outline", className: "w-full justify-start gap-3" })} href={a.url}>
                {a.icon ? <img src={a.icon} alt="" width={24} height={24} className="size-6 rounded object-contain" /> : null}
                {a.name}
              </a>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-1 text-center text-sm">
        {info.mfa && (
          <a className="text-primary underline-offset-4 hover:underline" href="/account/mfa?return_to=%2Fapps">
            {t("apps.security")}
          </a>
        )}
        <a className="text-primary underline-offset-4 hover:underline" href="/logout">
          {t("apps.signOut")}
        </a>
      </div>
    </AuthLayout>
  );
}
