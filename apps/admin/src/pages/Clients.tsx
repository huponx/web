import { Can, P } from "@huponx/auth-client";
import { Badge, Button, Card, CardContent, iconTone, useFlash, usePaged } from "@huponx/ui-kit";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useIdentity } from "../api";
import type { ClientType } from "../api";
import { ActionLabel, Actions, BadgeList, DataTable, DoneAlert, ErrorAlert, LoadMore, Loading, PageTitle, ROW_ACTION, SelectField, TextField } from "../components/common";

const ALL = "all";

interface Filter {
  query: string;
  type: ClientType | typeof ALL;
}

export function Clients() {
  const { t } = useTranslation();
  const api = useIdentity();
  // the fields of the form, and the filter applied by Search
  const [draft, setDraft] = useState<Filter>({ query: "", type: ALL });
  const [filter, setFilter] = useState<Filter>({ query: "", type: ALL });
  const paged = usePaged(
    (token) => api.listClientsPage({ query: filter.query, type: filter.type === ALL ? undefined : filter.type }, token),
    [api, filter.query, filter.type],
  );
  const { items: data, error, loading } = paged;
  const deleted = useFlash<{ deleted?: string }>()?.deleted;

  return (
    <>
      <PageTitle>{t("clients.title")}</PageTitle>
      <Can perm={P.identity.clientWrite}>
        <Actions>
          <Button asChild>
            <Link to="/clients/new">
              <Plus aria-hidden="true" />
              {t("clients.add")}
            </Link>
          </Button>
        </Actions>
      </Can>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <ErrorAlert error={error} />
          {deleted ? <DoneAlert>{t("clients.form.deleted", { id: deleted })}</DoneAlert> : null}
          {loading ? <Loading /> : null}
          <form
            role="search"
            className="flex flex-col gap-4"
            onSubmit={(ev) => {
              ev.preventDefault();
              setFilter({ query: draft.query.trim(), type: draft.type });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label={t("clients.search")}
                value={draft.query}
                onChange={(e) => setDraft((d) => ({ ...d, query: e.target.value }))}
                onClear={() => setDraft((d) => ({ ...d, query: "" }))}
                hint={t("clients.searchHint")}
              />
              <SelectField
                label={t("clients.col.type")}
                value={draft.type}
                onValueChange={(v) => setDraft((d) => ({ ...d, type: v as Filter["type"] }))}
                options={[
                  { value: ALL, label: t("clients.filter.anyType") },
                  { value: "CLIENT_TYPE_CONFIDENTIAL", label: t("clients.type.confidential") },
                  { value: "CLIENT_TYPE_PUBLIC", label: t("clients.type.public") },
                ]}
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
                  setDraft({ query: "", type: ALL });
                  setFilter({ query: "", type: ALL });
                }}
              >
                {t("common.clearSearch")}
              </Button>
            </Actions>
          </form>
          {data ? (
            <DataTable
              rows={data}
              rowKey={(c) => c.clientId}
              columns={[
                {
                  header: t("clients.col.client"),
                  cell: (c) => (
                    <span className="flex flex-wrap items-center gap-2">
                      <strong>{c.clientId}</strong>
                      {c.disabled ? <Badge variant="destructive">{t("clients.status.disabled")}</Badge> : null}
                    </span>
                  ),
                },
                { header: t("clients.col.name"), cell: (c) => c.name },
                { header: t("clients.col.type"), cell: (c) => (c.type === "CLIENT_TYPE_PUBLIC" ? t("clients.type.public") : t("clients.type.confidential")) },
                { header: t("clients.col.grants"), cell: (c) => <BadgeList items={c.allowedGrants} /> },
                { header: t("clients.col.roles"), cell: (c) => <BadgeList items={c.roles} /> },
                {
                  header: <span className="sr-only">{t("clients.col.actions")}</span>,
                  className: "text-right",
                  cell: (c) => (
                    <Actions>
                      <Button asChild variant="outline" size="sm" className={ROW_ACTION}>
                        <Link to={`/clients/${encodeURIComponent(c.clientId)}`} aria-label={t("clients.manageAria", { id: c.clientId })}>
                          <ActionLabel icon={Pencil} iconClassName={iconTone.edit}>{t("clients.manage")}</ActionLabel>
                        </Link>
                      </Button>
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
