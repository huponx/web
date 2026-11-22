import { useAuth } from "@huponx/auth-client";
import type { Me } from "@huponx/auth-client";
import { Button, Card, ErrorNotice, Loading, PageTitle } from "@huponx/ui";
import { useCallback, useEffect, useState } from "react";

/** A call through the gateway with the session cookie: the same path every route of the app takes. */
export function Session() {
  const { client } = useAuth();
  const [data, setData] = useState<Me>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(undefined);
    client
      .api<Me>("GET", "/auth/me")
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [client]);

  useEffect(load, [load]);

  return (
    <>
      <PageTitle>Session</PageTitle>
      <Card>
        <ErrorNotice error={error} />
        {loading ? (
          <Loading />
        ) : data ? (
          <dl>
            <dt>Subject</dt>
            <dd className="ui-mono">{data.sub}</dd>
            <dt>Authentication methods</dt>
            <dd>{data.amr.join(", ") || "-"}</dd>
            <dt>Expires</dt>
            <dd>{new Date(data.expires_at).toLocaleString()}</dd>
          </dl>
        ) : null}
        <Button onClick={load}>Refresh</Button>
      </Card>
    </>
  );
}
