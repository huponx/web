import { Alert, Button, Card, CardContent, Progress, tone } from "@huponx/ui-kit";
import { Check, Download, Link2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { exportJobActive, exportProgress } from "./api";
import type { ExportJob } from "./api";
import { groupLabel, useRegistry } from "./lib/registry";

/** Progress of an export in parts, then the list of its parts to download. */
export function ExportJobPanel({
  job,
  busyPart,
  copied,
  onDownload,
  onCopyLink,
  onCancel,
  onDismiss,
}: {
  job: ExportJob;
  /** The part whose link is being made. */
  busyPart?: number;
  /** The part whose link was copied last (its button shows a tick). */
  copied?: number;
  onDownload: (n: number) => void;
  onCopyLink: (n: number) => void;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const { groups } = useRegistry();
  const active = exportJobActive(job);
  const total = job.total ?? 0;
  const built = exportProgress(job);
  const parts = job.parts ?? [];
  return (
    <Card data-testid="export-job" className="py-4">
      <CardContent className="space-y-3 px-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">
            {t(`saved.job.${job.status}`, { name: job.deckName ?? "" })}
            {groups.length > 1 ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {groupLabel(t, job.group)}
              </span>
            ) : null}
          </p>
          {active ? (
            <Button variant="outline" size="sm" onClick={onCancel}>
              {t("common.cancel")}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("common.close")}
              onClick={onDismiss}
            >
              <X />
            </Button>
          )}
        </div>
        {active ? (
          <>
            <Progress
              value={built}
              max={Math.max(total, 1)}
              tone="primary"
              className="h-1.5"
            />
            <p className="text-sm text-muted-foreground">
              {job.status === "queued" || total === 0
                ? t("saved.job.preparing")
                : t("saved.job.progress", { built, total })}
            </p>
          </>
        ) : null}
        {job.status === "failed" ? (
          <Alert variant="destructive">
            {t("saved.job.failedWhy", { error: job.error ?? "" })}
          </Alert>
        ) : null}
        {parts.length > 0 ? (
          <ul className="space-y-1">
            {parts.map((p) => (
              <li key={p.n} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {t("saved.job.part", {
                      n: p.n,
                      count: p.wordCount ?? 0,
                    })}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className={tone.copy}
                      aria-label={t("saved.job.copyLink")}
                      title={t("saved.job.copyLink")}
                      disabled={busyPart === p.n}
                      onClick={() => onCopyLink(p.n)}
                    >
                      {copied === p.n ? (
                        <Check aria-hidden="true" />
                      ) : (
                        <Link2 aria-hidden="true" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="max-sm:size-8 max-sm:px-0"
                      title={t("saved.job.download")}
                      disabled={busyPart === p.n}
                      onClick={() => onDownload(p.n)}
                    >
                      <Download aria-hidden="true" />
                      <span className="max-sm:sr-only">
                        {t("saved.job.download")}
                      </span>
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {!active && parts.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("saved.job.expires", {
              when: new Date(job.expiresAt).toLocaleString(),
            })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
