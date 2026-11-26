import { useAuth } from "@huponx/auth-client";
import type { Me } from "@huponx/auth-client";
import { Button, Card, CardContent, ErrorAlert, Loading, PageTitle } from "@huponx/ui-kit";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** A call through the gateway with the session cookie: the same path every route of the app takes. */
export function Session() {
  const { t } = useTranslation();
  const { client } = useAuth();
  const [data, setData] = useState<Me>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    // an error from the last try stays until this one ends
    client
      .api<Me>("GET", "/auth/me")
      .then((me) => {
        setError(undefined);
        setData(me);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [client]);

  useEffect(load, [load]);

  return (
    <>
      <PageTitle>{t("session.title")}</PageTitle>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <ErrorAlert error={error} />
          {loading ? (
            <Loading />
          ) : data ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t("session.subject")}</dt>
              <dd className="font-mono">{data.sub}</dd>
              <dt className="text-muted-foreground">{t("session.methods")}</dt>
              <dd>{data.amr.join(", ") || "-"}</dd>
              <dt className="text-muted-foreground">{t("session.expires")}</dt>
              <dd>{new Date(data.expires_at).toLocaleString()}</dd>
            </dl>
          ) : null}
          <div>
            <Button variant="outline" onClick={load}>
              {t("common.refresh")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
