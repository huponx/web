import { AutoAlert, Alert, Button, Loading, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Switch, ToggleGroup, ToggleGroupItem } from "@huponx/ui-kit";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_DECK, MAX_LOOKUP_WORDS } from "../api";
import type { Dictionary, UserSettings } from "../api";
import { errorMessage } from "../lib/errors";
import { useSettings } from "../lib/settings";

function DictionaryRow({ label, checked, onChange, offByAdmin }: { label: string; checked: boolean; onChange: (v: boolean) => void; offByAdmin: boolean }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col">
        <span id={id} className="text-sm font-medium">
          {label}
        </span>
        {offByAdmin ? <span className="text-sm text-muted-foreground">{t("settings.offByAdmin")}</span> : null}
      </div>
      <Switch checked={checked && !offByAdmin} onCheckedChange={onChange} aria-labelledby={id} disabled={offByAdmin} />
    </div>
  );
}

/** The own preferences: which dictionaries to use, which one starts, the deck name and the words per lookup. */
export function SettingsForm() {
  const { t } = useTranslation();
  const { settings, save } = useSettings();
  const { user, system } = settings;
  const [draft, setDraft] = useState<UserSettings>(user);
  // text of the number field, so it can be empty or half typed
  const [words, setWords] = useState(String(user.maxLookupWords));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<{ at: number }>();

  const on = (d: Dictionary) =>
    d === "DICTIONARY_ENGLISH" ? draft.englishEnabled && system.englishEnabled : draft.englishViEnabled && system.englishViEnabled;
  const enabled = (["DICTIONARY_ENGLISH", "DICTIONARY_ENGLISH_VIETNAMESE"] as const).filter(on);
  const n = Number(words);
  const wordsOk = Number.isInteger(n) && n >= 1 && n <= MAX_LOOKUP_WORDS;
  const valid = enabled.length > 0 && wordsOk;

  function toggle(d: Dictionary, v: boolean) {
    setDraft((cur) => {
      const next = d === "DICTIONARY_ENGLISH" ? { ...cur, englishEnabled: v } : { ...cur, englishViEnabled: v };
      // the default has to be one that is on
      const stillOn = (x: Dictionary) =>
        x === "DICTIONARY_ENGLISH" ? next.englishEnabled && system.englishEnabled : next.englishViEnabled && system.englishViEnabled;
      if (!stillOn(next.defaultDictionary)) {
        const other: Dictionary = next.defaultDictionary === "DICTIONARY_ENGLISH" ? "DICTIONARY_ENGLISH_VIETNAMESE" : "DICTIONARY_ENGLISH";
        if (stillOn(other)) next.defaultDictionary = other;
      }
      return next;
    });
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await save({ ...draft, deckName: draft.deckName.trim(), maxLookupWords: n });
      setDone({ at: Date.now() });
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(ev) => void submit(ev)}>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.dictionaries")}</CardTitle>
          <CardDescription>{t("settings.dictionariesHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <DictionaryRow label={t("lookup.english")} checked={draft.englishEnabled} onChange={(v) => toggle("DICTIONARY_ENGLISH", v)} offByAdmin={!system.englishEnabled} />
          <DictionaryRow
            label={t("lookup.englishVietnamese")}
            checked={draft.englishViEnabled}
            onChange={(v) => toggle("DICTIONARY_ENGLISH_VIETNAMESE", v)}
            offByAdmin={!system.englishViEnabled}
          />
          {enabled.length === 0 ? <p className="text-sm text-destructive">{t("settings.oneOn")}</p> : null}
          <div className="space-y-2">
            <Label id="default-dictionary">{t("settings.default")}</Label>
            <div>
              <ToggleGroup
                type="single"
                aria-labelledby="default-dictionary"
                value={enabled.includes(draft.defaultDictionary) ? draft.defaultDictionary : ""}
                onValueChange={(v) => v && setDraft((cur) => ({ ...cur, defaultDictionary: v as Dictionary }))}
              >
                {enabled.map((d) => (
                  <ToggleGroupItem key={d} value={d} className="w-auto px-3 text-sm">
                    {d === "DICTIONARY_ENGLISH" ? t("lookup.english") : t("lookup.englishVietnamese")}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.lookupAndExport")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="max-words">{t("settings.maxWords")}</Label>
            <Input
              id="max-words"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_LOOKUP_WORDS}
              step={1}
              value={words}
              className="max-w-32"
              aria-invalid={!wordsOk || undefined}
              onChange={(e) => setWords(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("settings.maxWordsHint", { max: MAX_LOOKUP_WORDS })}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="deck-default">{t("settings.deckName")}</Label>
            <Input
              id="deck-default"
              value={draft.deckName}
              maxLength={64}
              placeholder={DEFAULT_DECK}
              onChange={(e) => setDraft((cur) => ({ ...cur, deckName: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">{t("settings.deckNameHint")}</p>
          </div>
        </CardContent>
      </Card>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <AutoAlert variant="success" watch={done}>
        {done ? t("settings.saved") : undefined}
      </AutoAlert>
      <div className="flex justify-end">
        <Button type="submit" busy={busy} disabled={!valid}>
          {t("settings.save")}
        </Button>
      </div>
    </form>
  );
}

/** Page of the preferences (menu item Settings). The form starts from the loaded settings. */
export function Settings() {
  const { t } = useTranslation();
  const { loaded } = useSettings();
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>
      {loaded ? <SettingsForm /> : <Loading label={t("common.loading")} />}
    </div>
  );
}
