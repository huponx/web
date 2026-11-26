import { useCallback, useEffect, useRef, useState } from "react";
import { exportJobActive } from "../api";
import type { ExportJob } from "../api";

/** The calls of the export jobs the hook needs (a part of the `useDictionary` API). */
interface JobApi {
  getExport: (id?: string) => Promise<ExportJob | undefined>;
  cancelExport: (id: string) => Promise<ExportJob>;
}

const DISMISSED_KEY = "dict:export-dismissed";

/** The id of the job whose result the user closed (kept in the browser, so it does not come back on a reload). */
function dismissedId(): string {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) ?? "";
  } catch {
    return "";
  }
}

function rememberDismissed(id: string): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, id);
  } catch {
    // no storage (private window): it comes back on a reload
  }
}

/** How often a running job is read again. */
export const EXPORT_POLL_MS = 2000;

/**
 * The export job of the user that was started last: it is read once, and again every EXPORT_POLL_MS while it is
 * queued or running, so a page that is opened (or reloaded) in the middle of a job shows its progress. A job that is
 * finished stays on the page, with its parts to download, until the user closes it (`dismiss`, remembered in the
 * browser) or the service deletes it when it expires. `set` takes a job the page just started.
 */
export function useExportJob(api: JobApi, enabled: boolean) {
  const [job, setJob] = useState<ExportJob | undefined>();
  const [error, setError] = useState<unknown>();
  const apiRef = useRef(api);
  apiRef.current = api;

  const active = exportJobActive(job);
  const id = job?.id;

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    apiRef.current
      .getExport("latest")
      .then((j) => {
        if (live && j && (exportJobActive(j) || j.id !== dismissedId()))
          setJob(j);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [enabled]);

  useEffect(() => {
    if (!active || !id) return;
    let live = true;
    const timer = setInterval(() => {
      apiRef.current
        .getExport(id)
        .then((j) => {
          if (live && j) setJob(j);
        })
        .catch((e: unknown) => {
          if (live) setError(e);
        });
    }, EXPORT_POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [active, id]);

  const cancel = useCallback(async () => {
    if (!id) return;
    try {
      setJob(await apiRef.current.cancelExport(id));
    } catch (e) {
      setError(e);
    }
  }, [id]);

  return {
    job,
    error,
    set: setJob,
    cancel,
    dismiss: () => {
      if (id) rememberDismissed(id);
      setJob(undefined);
      setError(undefined);
    },
  };
}
