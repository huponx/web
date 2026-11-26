import { useAuth } from "@huponx/auth-client";
import { Alert, Card, CardContent, ErrorAlert, Loading, PageTitle } from "@huponx/ui-kit";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
      <PageTitle>{t("invoices.title")}</PageTitle>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <Alert variant="warning">{t("invoices.sample")}</Alert>
          <ErrorAlert error={error} />
          {!invoices && !error ? <Loading /> : null}
          {invoices ? (
            <ul className="list-disc pl-5 text-sm">
              {invoices.map((e) => (
                <li key={e.id}>{e.number}</li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
