import { Can } from "@huponx/auth-client";
import { Badge, Button, Card, CardContent, SelectField, TextField, useAction, usePaged } from "@huponx/ui-kit";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionLabel, DataTable, DoneAlert, ErrorAlert, LoadMore, Loading, PageTitle, ROW_ACTION } from "../components/common";
import { ROUTES } from "../authz";
import { useCourier, when } from "../courier";
import type { DeliveryFilter, DeliveryRecord, DeliveryStatus } from "../courier";

const ANY = "any";
const STATUSES = ["DELIVERY_STATUS_PENDING", "DELIVERY_STATUS_SENT", "DELIVERY_STATUS_FAILED", "DELIVERY_STATUS_DEAD", "DELIVERY_STATUS_SKIPPED"] as const;
const CHANNELS = ["email", "telegram"] as const;

const tone: Record<DeliveryStatus, "default" | "secondary" | "destructive"> = {
  DELIVERY_STATUS_PENDING: "secondary",
  DELIVERY_STATUS_SENT: "default",
  DELIVERY_STATUS_FAILED: "destructive",
  DELIVERY_STATUS_DEAD: "destructive",
  DELIVERY_STATUS_SKIPPED: "secondary",
};

/** The delivery log: who was sent what and how it went, with the retry of a failed or dead delivery. */
export function Deliveries() {
  const { t, i18n } = useTranslation();
  const api = useCourier();
  const [draft, setDraft] = useState({ status: ANY, channel: ANY, address: "", userId: "", notificationId: "" });
  const [filter, setFilter] = useState<DeliveryFilter>({});
  const paged = usePaged((token) => api.deliveries(filter, token), [api, JSON.stringify(filter)]);
  const retry = useAction();

  function apply() {
    setFilter({
      status: draft.status === ANY ? "" : draft.status,
      channel: draft.channel === ANY ? "" : draft.channel,
      address: draft.address.trim(),
      userId: draft.userId.trim(),
      notificationId: draft.notificationId.trim(),
    });
  }

  async function doRetry(r: DeliveryRecord) {
    const ok = await retry.run(() => api.retryDelivery(r.delivery.id).then(() => true), t("deliveries.retried"));
    if (ok) paged.reload();
  }

  return (
    <>
      <PageTitle description={t("deliveries.intro")}>{t("deliveries.title")}</PageTitle>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <form
            role="search"
            className="flex flex-col gap-4"
            onSubmit={(ev) => {
              ev.preventDefault();
              apply();
            }}
          >
            <div className="grid gap-4 md:grid-cols-3">
              <SelectField
                label={t("deliveries.filter.status")}
                value={draft.status}
                onValueChange={(v) => setDraft((d) => ({ ...d, status: v }))}
                options={[{ value: ANY, label: t("deliveries.filter.any") }, ...STATUSES.map((s) => ({ value: s, label: t(`deliveries.status.${s}`) }))]}
              />
              <SelectField
                label={t("deliveries.filter.channel")}
                value={draft.channel}
                onValueChange={(v) => setDraft((d) => ({ ...d, channel: v }))}
                options={[{ value: ANY, label: t("deliveries.filter.any") }, ...CHANNELS.map((c) => ({ value: c, label: t(`templates.channel.${c}`) }))]}
              />
              <TextField label={t("deliveries.filter.address")} value={draft.address} onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))} onClear={() => setDraft((d) => ({ ...d, address: "" }))} />
              <TextField label={t("deliveries.filter.user")} value={draft.userId} onChange={(e) => setDraft((d) => ({ ...d, userId: e.target.value }))} onClear={() => setDraft((d) => ({ ...d, userId: "" }))} />
              <TextField label={t("deliveries.filter.notification")} value={draft.notificationId} onChange={(e) => setDraft((d) => ({ ...d, notificationId: e.target.value }))} onClear={() => setDraft((d) => ({ ...d, notificationId: "" }))} />
            </div>
            <div>
              <Button type="submit" variant="outline">
                {t("common.search")}
              </Button>
            </div>
          </form>
          <ErrorAlert error={paged.error ?? retry.error} />
          <DoneAlert watch={retry.doneId}>{retry.done}</DoneAlert>
          {paged.loading ? <Loading /> : null}
          {paged.items ? (
            <DataTable<DeliveryRecord>
              rows={paged.items}
              rowKey={(r) => r.delivery.id}
              columns={[
                { header: t("deliveries.col.when"), cell: (r) => when(r.createdAt, i18n.language) },
                { header: t("deliveries.col.event"), cell: (r) => r.eventType },
                { header: t("deliveries.col.to"), cell: (r) => <span>{t(`templates.channel.${r.delivery.channel}`, { defaultValue: r.delivery.channel })}: {r.delivery.address}</span> },
                {
                  header: t("deliveries.col.status"),
                  cell: (r) => (
                    <div className="flex flex-col gap-1">
                      <Badge variant={tone[r.delivery.status] ?? "secondary"}>{t(`deliveries.status.${r.delivery.status}`, { defaultValue: r.delivery.status })}</Badge>
                      {r.delivery.lastError ? <span className="max-w-xs truncate text-xs text-muted-foreground" title={r.delivery.lastError}>{r.delivery.lastError}</span> : null}
                    </div>
                  ),
                },
                { header: t("deliveries.col.attempts"), cell: (r) => r.delivery.attempts ?? 0 },
                { header: t("deliveries.col.events"), cell: (r) => (r.merged ? t("deliveries.merged", { count: r.merged + 1 }) : "1") },
                {
                  header: <span className="sr-only">{t("deliveries.col.actions")}</span>,
                  className: "text-right",
                  cell: (r) =>
                    r.delivery.status === "DELIVERY_STATUS_FAILED" || r.delivery.status === "DELIVERY_STATUS_DEAD" ? (
                      <Can route={ROUTES.retryDelivery}>
                        <Button variant="outline" size="sm" className={ROW_ACTION} onClick={() => void doRetry(r)} aria-label={t("deliveries.retryAria", { address: r.delivery.address })}>
                          <ActionLabel icon={RotateCcw}>{t("deliveries.retry")}</ActionLabel>
                        </Button>
                      </Can>
                    ) : null,
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
