import { Button, Card, CardContent, Skeleton } from "@huponx/ui-kit";
import { BookOpen, CircleCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDictionary } from "../api";
import { ICONS } from "../lib/apps";
import type { PortalApp } from "../lib/apps";
import { formatCount, splitInterval } from "../lib/review";
import type { ReviewSummary } from "../lib/review";

const KINDS = [
  ["new", "newCount", "text-primary"],
  ["learning", "learningCount", "text-warning"],
  ["toReview", "dueCount", "text-success"],
] as const;

/** The card of Dict on the home page: the review counts and the way to start. A failure leaves the link to the app only. */
export function DictPanel({ app }: { app: PortalApp }) {
  const { t } = useTranslation();
  const dictionary = useDictionary();
  const [summary, setSummary] = useState<ReviewSummary>();
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    let live = true;
    dictionary
      .review()
      .then((s) => {
        if (!live) return;
        setSummary(s);
        setFailed(false);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [dictionary]);

  useEffect(() => {
    let stop = load();
    // The counts change in Dict: read them again when the user comes back to this tab.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      stop();
      stop = load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      stop();
    };
  }, [load]);

  const Icon = (app.icon && ICONS[app.icon]) || BookOpen;
  const reviewUrl = new URL("review", app.url.endsWith("/") ? app.url : `${app.url}/`).href;
  const ready = summary ? summary.newCount + summary.learningCount + summary.dueCount : 0;
  const wait = summary?.nextDueAt ? (Date.parse(summary.nextDueAt) - Date.now()) / 1000 : undefined;
  const span = wait !== undefined && Number.isFinite(wait) ? splitInterval(wait) : undefined;

  return (
    <Card className="h-full" data-testid="dict-panel">
      <CardContent className="space-y-4">
        <a href={app.url} aria-label={t("home.open", { name: app.name })} className="flex items-center gap-4 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
            <Icon className="size-6" />
          </span>
          <span className="truncate font-medium">{app.name}</span>
        </a>
        {failed ? (
          <p className="text-sm text-muted-foreground" data-testid="dict-unavailable">
            {t("home.dict.unavailable")}
          </p>
        ) : !summary ? (
          <Skeleton className="h-16 w-full" data-testid="dict-loading" />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 text-center" role="group" aria-label={t("home.dict.counts")}>
              {KINDS.map(([kind, field, tone]) => (
                <div key={kind}>
                  <p className={`text-3xl font-semibold ${tone}`} data-testid={`dict-${kind}`}>
                    {formatCount(summary[field], summary.countsCapped)}
                  </p>
                  <p className="text-sm text-muted-foreground">{t(`home.dict.${kind}`)}</p>
                </div>
              ))}
            </div>
            <p className="text-center text-sm text-muted-foreground">{t("home.dict.saved", { count: summary.totalCount })}</p>
            {summary.totalCount === 0 ? (
              <div className="space-y-2 text-center">
                <p>{t("home.dict.noWords")}</p>
                <Button asChild variant="outline">
                  <a href={app.url}>{t("home.dict.goLookup")}</a>
                </Button>
              </div>
            ) : ready > 0 ? (
              <Button asChild className="w-full">
                <a href={reviewUrl}>{t("home.dict.start")}</a>
              </Button>
            ) : (
              <div className="space-y-1 text-center" data-testid="dict-done">
                <CircleCheck className="mx-auto size-8 text-success" aria-hidden="true" />
                <p className="font-medium">{t("home.dict.caughtUp")}</p>
                {span ? <p className="text-sm text-muted-foreground">{t("home.dict.comeBack", { in: t(`home.dict.unit.${span.unit}`, { n: span.n }) })}</p> : null}
              </div>
            )}
            {summary.newHeld > 0 || summary.dueHeld > 0 ? (
              <p className="text-center text-xs text-muted-foreground">{t("home.dict.waiting", { new: summary.newHeld, due: summary.dueHeld })}</p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
