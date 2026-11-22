import { useAuth } from "@huponx/auth-client";
import { Card, ErrorNotice, Loading, Notice, PageTitle } from "@huponx/ui";
import { useEffect, useState } from "react";

interface Invoice {
  id: string;
  number: string;
}

/**
 * Placeholder for the business pages: a permission gated page that reads a route of the gateway.
 * The route `GET /api/bill/invoices` belongs to a service that does not exist yet, so until it is
 * added to routes.yaml the gateway answers 404 and this page shows that answer.
 */
export function Invoices() {
  const { client } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>();
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    client
      .api<{ invoices: Invoice[] }>("GET", "/api/bill/invoices")
      .then((r) => setInvoices(r.invoices))
      .catch(setError);
  }, [client]);

  return (
    <>
      <PageTitle>Invoices</PageTitle>
      <Card>
        <Notice kind="warn">Sample page: connect it to the bill service by adding its routes to the gateway.</Notice>
        <ErrorNotice error={error} />
        {!invoices && !error ? <Loading /> : null}
        {invoices ? (
          <ul>
            {invoices.map((e) => (
              <li key={e.id}>{e.number}</li>
            ))}
          </ul>
        ) : null}
      </Card>
    </>
  );
}
