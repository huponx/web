import { useAuth } from "@huponx/auth-client";
import { Card, CardContent, PageTitle } from "@huponx/ui-kit";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DictPanel } from "../components/DictPanel";
import { ICONS, parseApps, visibleApps } from "../lib/apps";

/** The applications the user may use, one card each. The list is the runtime configuration (APPS), without Admin. */
export function Home() {
  const { t } = useTranslation();
  const { user, can } = useAuth();
  const apps = useMemo(() => parseApps(window.__env__?.APPS), []);
  // a key the gateway does not know is never allowed: the card stays hidden instead of open to everybody
  const shown = visibleApps(apps, can);
  return (
    <>
      <PageTitle description={t("home.subtitle")}>{t("home.greeting", { name: user?.name || user?.email || user?.sub || "" })}</PageTitle>
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground" data-testid="no-apps">
          {t("home.none")}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((a) => {
            const Icon = a.icon ? ICONS[a.icon] : undefined;
            if (a.widget === "dict-review") {
              return (
                <li key={a.url} className="sm:col-span-2">
                  <DictPanel app={a} />
                </li>
              );
            }
            return (
              <li key={a.url}>
                <a href={a.url} aria-label={t("home.open", { name: a.name })} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  <Card className="h-full transition-colors hover:bg-accent">
                    <CardContent className="flex items-center gap-4">
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg font-semibold text-primary" aria-hidden="true">
                        {Icon ? <Icon className="size-6" /> : a.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate font-medium">{a.name}</span>
                    </CardContent>
                  </Card>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
