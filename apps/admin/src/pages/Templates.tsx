import { Badge, Card, CardContent } from "@huponx/ui-kit";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useCourier } from "../courier";
import type { EventType } from "../courier";
import { DataTable, ErrorAlert, Loading, PageTitle } from "../components/common";
import { useLoad } from "@huponx/ui-kit";

export function templatePath(template: string, locale: string, channel: string): string {
  return `/templates/${encodeURIComponent(template)}/${encodeURIComponent(locale)}/${encodeURIComponent(channel)}`;
}

/** The event types of the catalog and, for each, the template of every language and channel (a badge says which are edited). */
export function Templates() {
  const { t } = useTranslation();
  const api = useCourier();
  const types = useLoad(() => api.eventTypes(), [api]);
  return (
    <>
      <PageTitle description={t("templates.intro")}>{t("templates.title")}</PageTitle>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <ErrorAlert error={types.error} />
          {types.loading ? <Loading /> : null}
          {types.data ? (
            <DataTable<EventType>
              rows={types.data.eventTypes}
              rowKey={(e) => e.type}
              columns={[
                {
                  header: t("templates.col.type"),
                  cell: (e) => (
                    <div className="flex flex-col">
                      <strong>{e.type}</strong>
                      <span className="text-xs text-muted-foreground">
                        {e.category}
                        {e.mandatory ? ` · ${t("templates.mandatory")}` : ""}
                        {e.digestWindow ? ` · ${t("templates.digest", { window: e.digestWindow })}` : ""}
                      </span>
                    </div>
                  ),
                },
                {
                  header: t("templates.col.templates"),
                  cell: (e) => (
                    <div className="flex flex-wrap gap-2">
                      {(e.templates ?? []).map((x) => (
                        <Link
                          key={`${x.template ?? ""}/${x.locale}/${x.channel}`}
                          to={templatePath(x.template ?? e.template, x.locale, x.channel)}
                          aria-label={t(x.template ? "templates.editDigestAria" : "templates.editAria", { type: e.type, locale: x.locale, channel: t(`templates.channel.${x.channel}`) })}
                        >
                          <Badge variant={x.customized ? "default" : "secondary"}>
                            {x.template ? `${t("templates.digestBadge")} · ` : ""}
                            {x.locale} · {t(`templates.channel.${x.channel}`)}
                            {x.customized ? ` · v${x.version}` : ""}
                          </Badge>
                        </Link>
                      ))}
                    </div>
                  ),
                },
              ]}
            />
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
