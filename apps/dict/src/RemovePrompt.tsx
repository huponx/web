import { useAuth } from "@huponx/auth-client";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@huponx/ui-kit";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { removesAfterExport, SAVED_CHANGED, useDictionary } from "./api";
import { errorMessage } from "./lib/errors";
import { useRegistry } from "./lib/registry";
import { useSettings } from "./lib/settings";
import { ROUTES } from "./authz";

/**
 * Remove after export came on (the administrator or the user turned it on) while exported words are still in
 * the list: ask whether to remove them or keep them, once. Either answer is remembered in the preferences
 * (removeAcknowledged), which is cleared when the setting goes off, so the question comes back next time.
 * Renders nothing but the question.
 */
export function RemovePrompt() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const api = useDictionary();
  const { settings, known, save } = useSettings();
  const { all: groups, loaded: registryLoaded } = useRegistry();
  const [exported, setExported] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const handled = useRef<string>();

  const allowed = can(ROUTES.listSaved) && can(ROUTES.saveWord);
  const effective = removesAfterExport(settings);
  const acknowledged = settings.user.removeAcknowledged;

  useEffect(() => {
    // only act on settings the service really answered: writing the defaults back would overwrite the choices
    if (!allowed || !known || !registryLoaded) return;
    const key = `${effective}:${acknowledged}`;
    if (handled.current === key) return;
    handled.current = key;
    if (!effective) {
      // it went off: the next time it comes on the question is asked again
      if (acknowledged)
        void save({ ...settings.user, removeAcknowledged: false }).catch(
          () => undefined,
        );
      return;
    }
    if (acknowledged) return;
    let live = true;
    // the exported words of every group count
    Promise.all(groups.map((g) => api.list(g.id)))
      .then((pages) => {
        if (!live) return;
        const n = pages.reduce(
          (sum, p) => sum + p.total - (p.newTotal ?? p.total),
          0,
        );
        if (n > 0) {
          setExported(n);
          setOpen(true);
        } else {
          void save({ ...settings.user, removeAcknowledged: true }).catch(
            () => undefined,
          );
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
      handled.current = undefined;
    };
  }, [
    allowed,
    known,
    registryLoaded,
    groups,
    effective,
    acknowledged,
    api,
    save,
    settings.user,
  ]);

  async function answer(remove: boolean) {
    setBusy(true);
    try {
      if (remove) {
        await Promise.all(groups.map((g) => api.removeExportedWords(g.id)));
        window.dispatchEvent(new Event(SAVED_CHANGED));
      }
      await save({ ...settings.user, removeAcknowledged: true });
      setError(undefined);
      setOpen(false);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    // closing it without an answer asks again on the next visit
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{t("removePrompt.title")}</DialogTitle>
          <DialogDescription>
            {t("removePrompt.message", { count: exported })}
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{errorMessage(error, t)}</p> : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void answer(false)}
          >
            {t("removePrompt.keep")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            busy={busy}
            onClick={() => void answer(true)}
          >
            {t("removePrompt.remove")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
