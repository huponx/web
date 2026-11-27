import { Can, P } from "@huponx/auth-client";
import { Button, Card, CardContent, useAction, useFlash, usePaged } from "@huponx/ui-kit";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useIdentity } from "../api";
import type { ExchangePolicy } from "../api";
import { useConfirm } from "../components/ConfirmDialog";
import { ActionLabel, Actions, DataTable, DoneAlert, ErrorAlert, LoadMore, Loading, PageTitle, ROW_ACTION, TextField } from "../components/common";

/** The page of a policy: the key is (client, audience), and an audience can hold `/` or `:`, so it goes in the query. */
export function policyPath(p: Pick<ExchangePolicy, "clientId" | "audience">): string {
  return `/exchange/edit?${new URLSearchParams({ client: p.clientId, audience: p.audience })}`;
}

interface Filter {
  query: string;
  audience: string;
}

export function Exchange() {
  const { t } = useTranslation();
  const api = useIdentity();
  // the fields of the form, and the filter applied by Search
  const [draft, setDraft] = useState<Filter>({ query: "", audience: "" });
  const [filter, setFilter] = useState<Filter>({ query: "", audience: "" });
  const paged = usePaged((token) => api.listPoliciesPage(filter, token), [api, filter.query, filter.audience]);
  const { items: data, error, loading, reload } = paged;
  const notice = useFlash<{ deleted?: boolean }>()?.deleted ? t("exchange.deleted") : undefined;
  const del = useAction();
  const { confirm, dialog } = useConfirm();

  async function remove(p: ExchangePolicy) {
    if (!(await confirm({ title: t("common.delete"), message: t("exchange.confirmDelete", { client: p.clientId, audience: p.audience }), confirmLabel: t("common.delete") }))) return;
    const r = await del.run(() => api.setPolicy(p, true), t("exchange.deleted"));
    if (r !== undefined) reload();
  }

  return (
    <>
      {dialog}
      <PageTitle description={t("exchange.intro")}>{t("exchange.title")}</PageTitle>
      <Can perm={P.identity.exchangeWrite}>
        <Actions>
          <Button asChild>
            <Link to="/exchange/new">
              <Plus aria-hidden="true" />
              {t("exchange.add")}
            </Link>
          </Button>
        </Actions>
      </Can>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <form
            role="search"
            className="flex flex-col gap-4"
            onSubmit={(ev) => {
              ev.preventDefault();
              setFilter({ query: draft.query.trim(), audience: draft.audience.trim() });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label={t("exchange.search")}
                value={draft.query}
                onChange={(e) => setDraft((d) => ({ ...d, query: e.target.value }))}
                onClear={() => setDraft((d) => ({ ...d, query: "" }))}
                hint={t("exchange.searchHint")}
              />
              <TextField
                label={t("exchange.filter.audience")}
                value={draft.audience}
                onChange={(e) => setDraft((d) => ({ ...d, audience: e.target.value }))}
                onClear={() => setDraft((d) => ({ ...d, audience: "" }))}
                hint={t("exchange.filter.audienceHint")}
              />
            </div>
            <Actions>
              <Button type="submit" variant="outline">
                {t("common.search")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDraft({ query: "", audience: "" });
                  setFilter({ query: "", audience: "" });
                }}
              >
                {t("common.clearSearch")}
              </Button>
            </Actions>
          </form>
          <ErrorAlert error={error} />
          <ErrorAlert error={del.error} />
          <DoneAlert watch={del.done ? del.doneId : notice}>{del.done ?? notice}</DoneAlert>
          {loading ? <Loading /> : null}
          {data ? (
            <DataTable
              rows={data}
              rowKey={(p) => `${p.clientId}/${p.audience}`}
              columns={[
                { header: t("exchange.col.client"), cell: (p) => <strong>{p.clientId}</strong> },
                { header: t("exchange.col.audience"), cell: (p) => p.audience },
                { header: t("exchange.col.maxScope"), cell: (p) => p.maxScope || t("common.noneParen") },
                { header: t("exchange.col.depth"), cell: (p) => p.maxChainDepth },
                {
                  header: <span className="sr-only">{t("exchange.col.actions")}</span>,
                  className: "text-right",
                  cell: (p) => (
                    <Actions>
                      <Button asChild variant="outline" size="sm" className={ROW_ACTION}>
                        <Link to={policyPath(p)} aria-label={t("exchange.manageAria", { client: p.clientId, audience: p.audience })}>
                          <ActionLabel icon={Pencil}>{t("exchange.manage")}</ActionLabel>
                        </Link>
                      </Button>
                      <Can perm={P.identity.exchangeWrite}>
                        <Button
                          variant="destructive"
                          size="sm"
                          className={ROW_ACTION}
                          onClick={() => void remove(p)}
                          aria-label={t("exchange.deleteAria", { client: p.clientId, audience: p.audience })}
                        >
                          <ActionLabel icon={Trash2}>{t("common.delete")}</ActionLabel>
                        </Button>
                      </Can>
                    </Actions>
                  ),
                },
              ]}
            />
          ) : null}
          <LoadMore paged={paged} />
        </CardContent>
      </Card>
    </>
  );
}
