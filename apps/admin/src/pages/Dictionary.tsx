import { Can, useAuth } from "@huponx/auth-client";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Switch, useAction, useLoad } from "@huponx/ui-kit";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useIdentity } from "../api";
import type { DictionarySettings } from "../api";
import { Actions, DoneAlert, ErrorAlert, Loading, PageTitle, TextField } from "../components/common";

const MAX_SAVED_LIMIT = 1000;

/** A setting that is on or off: the name and what it does on the left, the switch on the right. */
function SwitchRow({ label, hint, checked, onChange, disabled }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col">
        <span id={id} className="text-sm font-medium">
          {label}
        </span>
        <span className="text-sm text-muted-foreground">{hint}</span>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-labelledby={id} disabled={disabled} />
    </div>
  );
}

function Editor({ initial }: { initial: DictionarySettings }) {
  const { t } = useTranslation();
  const api = useIdentity();
  const { can } = useAuth();
  const canWrite = can("dictionary:settings:write");
  const [max, setMax] = useState(String(initial.maxSavedWords));
  const [s, setS] = useState(initial);
  const a = useAction();
  const set = (patch: Partial<DictionarySettings>) => setS((cur) => ({ ...cur, ...patch }));
  const oneOn = s.englishEnabled || s.englishViEnabled;

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const saved = await a.run(() => api.updateDictionarySettings({ ...s, maxSavedWords: Number(max) }), t("dictionary.saved"));
    if (saved) {
      setS(saved);
      setMax(String(saved.maxSavedWords));
    }
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={(ev) => void submit(ev)}>
      <Card>
        <CardHeader>
          <CardTitle>{t("dictionary.limits")}</CardTitle>
        </CardHeader>
        <CardContent>
          <TextField
            label={t("dictionary.maxSaved")}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_SAVED_LIMIT}
            step={1}
            value={max}
            onChange={(e) => setMax(e.target.value)}
            hint={t("dictionary.maxSavedHint")}
            required
            disabled={!canWrite}
            className="max-w-40"
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("dictionary.export")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SwitchRow label={t("dictionary.exportDeck")} hint={t("dictionary.exportDeckHint")} checked={s.allowExportDeck} onChange={(v) => set({ allowExportDeck: v })} disabled={!canWrite} />
          <SwitchRow label={t("dictionary.exportLink")} hint={t("dictionary.exportLinkHint")} checked={s.allowExportLink} onChange={(v) => set({ allowExportLink: v })} disabled={!canWrite} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("dictionary.dictionaries")}</CardTitle>
          <CardDescription>{t("dictionary.oneOn")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SwitchRow label={t("dictionary.english")} hint={t("dictionary.englishHint")} checked={s.englishEnabled} onChange={(v) => set({ englishEnabled: v })} disabled={!canWrite} />
          <SwitchRow label={t("dictionary.englishVi")} hint={t("dictionary.englishViHint")} checked={s.englishViEnabled} onChange={(v) => set({ englishViEnabled: v })} disabled={!canWrite} />
        </CardContent>
      </Card>
      <ErrorAlert error={a.error} />
      <DoneAlert watch={a.doneId}>{a.done}</DoneAlert>
      <Can perm="dictionary:settings:write">
        <Actions>
          <Button type="submit" busy={a.busy} disabled={!oneOn}>
            {t("dictionary.save")}
          </Button>
        </Actions>
      </Can>
    </form>
  );
}

/** Settings of the dictionary for the whole system: limits, exports and which dictionaries are on. */
export function Dictionary() {
  const { t } = useTranslation();
  const api = useIdentity();
  const load = useLoad(() => api.getDictionarySettings(), [api]);
  return (
    <div className="flex flex-col gap-6">
      <PageTitle description={t("dictionary.intro")}>{t("dictionary.title")}</PageTitle>
      {load.error ? <ErrorAlert error={load.error} /> : load.data ? <Editor initial={load.data} /> : <Loading />}
    </div>
  );
}
