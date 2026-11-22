import { useAuth } from "@huponx/auth-client";
import { Card, ErrorNotice, Loading, Notice, PageTitle } from "@huponx/ui";
import { useEffect, useState } from "react";

interface Entry {
  id: string;
  term: string;
}

/**
 * Placeholder for the business pages: a permission gated page that reads a route of the gateway.
 * The route `GET /api/dict/entries` belongs to a service that does not exist yet, so until it is
 * added to routes.yaml the gateway answers 404 and this page shows that answer.
 */
export function Entries() {
  const { client } = useAuth();
  const [entries, setEntries] = useState<Entry[]>();
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    client
      .api<{ entries: Entry[] }>("GET", "/api/dict/entries")
      .then((r) => setEntries(r.entries))
      .catch(setError);
  }, [client]);

  return (
    <>
      <PageTitle>Entries</PageTitle>
      <Card>
        <Notice kind="warn">Sample page: connect it to the dict service by adding its routes to the gateway.</Notice>
        <ErrorNotice error={error} />
        {!entries && !error ? <Loading /> : null}
        {entries ? (
          <ul>
            {entries.map((e) => (
              <li key={e.id}>{e.term}</li>
            ))}
          </ul>
        ) : null}
      </Card>
    </>
  );
}
