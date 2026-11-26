import {
  AutoAlert,
  Alert,
  Button,
  Loading,
  Progress,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  SwitchRow,
  ToggleGroup,
  ToggleGroupItem,
} from "@huponx/ui-kit";
import { Lock } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_DECK,
  MAX_DESIRED_RETENTION,
  MAX_LOOKUP_WORDS,
  MAX_REVIEW_MAX_PER_DAY,
  MAX_REVIEW_NEW_PER_DAY,
  MIN_DESIRED_RETENTION,
  useDictionary,
} from "../api";
import type {
  Dictionary,
  OptimizeResult,
  ReviewAlgorithm,
  UserSettings,
} from "../api";
import { formatBytes } from "../lib/bytes";
import { errorMessage } from "../lib/errors";
import { useSettings } from "../lib/settings";
import { nearlyFull, useStorage } from "../lib/useStorage";

/** What the user stores of content, images and audio against the limits that apply to them. */
function StorageCard() {
  const { t } = useTranslation();
  const { storage } = useStorage();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.storage")}</CardTitle>
        <CardDescription>{t("settings.storageHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {storage ? (
          (["content", "image", "audio"] as const).map((k) => {
            const u = storage[k];
            return (
              <div key={k} className="space-y-1.5" data-testid={`storage-${k}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span className="text-sm font-medium">
                    {t(`settings.storage_${k}`)}
                  </span>
                  <span
                    className={
                      nearlyFull(u)
                        ? "text-sm font-medium text-destructive"
                        : "text-sm text-muted-foreground"
                    }
                  >
                    {t("settings.storageUsage", {
                      used: formatBytes(u.used),
                      limit: formatBytes(u.limit),
                    })}
                  </span>
                </div>
                <Progress
                  value={Math.min(u.used, u.limit)}
                  max={Math.max(u.limit, 1)}
                  tone={nearlyFull(u) ? "destructive" : "primary"}
                  className="h-1.5"
                  aria-label={t(`settings.storage_${k}`)}
                />
              </div>
            );
          })
        ) : (
          <Loading />
        )}
      </CardContent>
    </Card>
  );
}

function DictionaryRow({
  label,
  hint,
  checked,
  onChange,
  offByAdmin,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  offByAdmin: boolean;
}) {
  const { t } = useTranslation();
  return (
    <SwitchRow
      label={label}
      hint={hint}
      checked={checked && !offByAdmin}
      onChange={onChange}
      disabled={offByAdmin}
      extra={
        offByAdmin ? (
          <span className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-md bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
            <Lock className="size-3" aria-hidden="true" />
            {t("settings.offByAdmin")}
          </span>
        ) : null
      }
    />
  );
}

/**
 * FSRS parameters of the user: fit them to the own review history, see when that was last done and go back to the
 * defaults. The service fits on request only and stores the result when it predicts better than the defaults.
 */
function FsrsParameters() {
  const { t } = useTranslation();
  const api = useDictionary();
  const { settings, setFsrs } = useSettings();
  const [busy, setBusy] = useState<"optimize" | "restore">();
  const [result, setResult] = useState<OptimizeResult>();
  const [error, setError] = useState<unknown>();
  const trained = settings.fsrsTrainedAt;

  async function run(restore: boolean) {
    setBusy(restore ? "restore" : "optimize");
    // the notices below stay on screen while it runs and change their content when it is over
    try {
      const r = await api.optimizeReview(restore);
      setError(undefined);
      if (restore) {
        setFsrs("", 0);
        setResult(undefined);
      } else {
        setResult(r);
        if (r.applied) setFsrs(r.trainedAt, r.reviewCount);
      }
    } catch (e) {
      setResult(undefined);
      setError(e);
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <div className="space-y-2" data-testid="fsrs-parameters">
      <Label>{t("settings.fsrsParameters")}</Label>
      <p className="text-xs text-muted-foreground">
        {trained
          ? t("settings.fsrsTrained", {
              count: settings.fsrsReviewCount,
              date: new Date(trained).toLocaleDateString(),
            })
          : t("settings.fsrsDefault")}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          busy={busy === "optimize"}
          disabled={busy !== undefined}
          onClick={() => void run(false)}
        >
          {t("settings.fsrsOptimize")}
        </Button>
        {trained ? (
          <Button
            type="button"
            variant="outline"
            busy={busy === "restore"}
            disabled={busy !== undefined}
            onClick={() => void run(true)}
          >
            {t("settings.fsrsRestore")}
          </Button>
        ) : null}
      </div>
      {error ? <Alert variant="destructive">{errorMessage(error, t)}</Alert> : null}
      {result ? (
        <Alert
          variant={result.applied ? "success" : "default"}
          data-testid="fsrs-result"
        >
          {result.applied
            ? t("settings.fsrsApplied", {
                count: result.reviewCount,
                before: result.lossDefault.toFixed(3),
                after: result.lossTrained.toFixed(3),
              })
            : t("settings.fsrsNotApplied", { reason: result.reason })}
        </Alert>
      ) : null}
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
  const [newPerDay, setNewPerDay] = useState(String(user.reviewNewPerDay));
  const [maxPerDay, setMaxPerDay] = useState(String(user.reviewMaxPerDay));
  const [retention, setRetention] = useState(String(user.desiredRetention));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [done, setDone] = useState<{ at: number }>();

  const on = (d: Dictionary) =>
    d === "DICTIONARY_ENGLISH"
      ? draft.englishEnabled && system.englishEnabled
      : draft.englishViEnabled && system.englishViEnabled;
  const enabled = (
    ["DICTIONARY_ENGLISH", "DICTIONARY_ENGLISH_VIETNAMESE"] as const
  ).filter(on);
  const n = Number(words);
  const wordsOk = Number.isInteger(n) && n >= 1 && n <= MAX_LOOKUP_WORDS;
  const perDay = Number(newPerDay);
  const perDayOk =
    newPerDay.trim() !== "" &&
    Number.isInteger(perDay) &&
    perDay >= 0 &&
    perDay <= MAX_REVIEW_NEW_PER_DAY;
  const maxPerDayN = Number(maxPerDay);
  const maxPerDayOk =
    maxPerDay.trim() !== "" &&
    Number.isInteger(maxPerDayN) &&
    maxPerDayN >= 0 &&
    maxPerDayN <= MAX_REVIEW_MAX_PER_DAY;
  const retentionN = Number(retention);
  const retentionOk =
    retention.trim() !== "" &&
    Number.isInteger(retentionN) &&
    retentionN >= MIN_DESIRED_RETENTION &&
    retentionN <= MAX_DESIRED_RETENTION;
  const fsrs = draft.reviewAlgorithm === "fsrs";
  // the retention only matters (and is only checked) while FSRS is chosen
  const valid =
    enabled.length > 0 &&
    wordsOk &&
    perDayOk &&
    maxPerDayOk &&
    (!fsrs || retentionOk);

  function toggle(d: Dictionary, v: boolean) {
    setDraft((cur) => {
      const next =
        d === "DICTIONARY_ENGLISH"
          ? { ...cur, englishEnabled: v }
          : { ...cur, englishViEnabled: v };
      // the default has to be one that is on
      const stillOn = (x: Dictionary) =>
        x === "DICTIONARY_ENGLISH"
          ? next.englishEnabled && system.englishEnabled
          : next.englishViEnabled && system.englishViEnabled;
      if (!stillOn(next.defaultDictionary)) {
        const other: Dictionary =
          next.defaultDictionary === "DICTIONARY_ENGLISH"
            ? "DICTIONARY_ENGLISH_VIETNAMESE"
            : "DICTIONARY_ENGLISH";
        if (stillOn(other)) next.defaultDictionary = other;
      }
      return next;
    });
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    try {
      await save({
        ...draft,
        deckName: draft.deckName.trim(),
        maxLookupWords: n,
        reviewNewPerDay: perDay,
        reviewMaxPerDay: maxPerDayN,
        desiredRetention: retentionOk ? retentionN : draft.desiredRetention,
      });
      setError(undefined);
      setDone({ at: Date.now() });
    } catch (e) {
      setError(e);
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
          <DictionaryRow
            label={t("lookup.english")}
            checked={draft.englishEnabled}
            onChange={(v) => toggle("DICTIONARY_ENGLISH", v)}
            offByAdmin={!system.englishEnabled}
          />
          <DictionaryRow
            label={t("lookup.englishVietnamese")}
            checked={draft.englishViEnabled}
            onChange={(v) => toggle("DICTIONARY_ENGLISH_VIETNAMESE", v)}
            offByAdmin={!system.englishViEnabled}
          />
          {enabled.length === 0 ? (
            <p className="text-sm text-destructive">{t("settings.oneOn")}</p>
          ) : null}
          <div className="space-y-2">
            <Label id="default-dictionary">{t("settings.default")}</Label>
            <div>
              <ToggleGroup
                type="single"
                aria-labelledby="default-dictionary"
                value={
                  enabled.includes(draft.defaultDictionary)
                    ? draft.defaultDictionary
                    : ""
                }
                onValueChange={(v) =>
                  v &&
                  setDraft((cur) => ({
                    ...cur,
                    defaultDictionary: v as Dictionary,
                  }))
                }
              >
                {enabled.map((d) => (
                  <ToggleGroupItem
                    key={d}
                    value={d}
                    className="w-auto px-3 text-sm"
                  >
                    {d === "DICTIONARY_ENGLISH"
                      ? t("lookup.english")
                      : t("lookup.englishVietnamese")}
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
            <p className="text-xs text-muted-foreground">
              {t("settings.maxWordsHint", { max: MAX_LOOKUP_WORDS })}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="deck-default">{t("settings.deckName")}</Label>
            <Input
              id="deck-default"
              value={draft.deckName}
              maxLength={64}
              placeholder={DEFAULT_DECK}
              onChange={(e) =>
                setDraft((cur) => ({ ...cur, deckName: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              {t("settings.deckNameHint")}
            </p>
          </div>
          <DictionaryRow
            label={t("settings.removeAfterExport")}
            hint={t("settings.removeAfterExportHint")}
            checked={draft.removeAfterExport}
            onChange={(v) =>
              setDraft((cur) => ({ ...cur, removeAfterExport: v }))
            }
            offByAdmin={!system.removeAfterExport}
          />
          <DictionaryRow
            label={t("settings.freshDeck")}
            hint={t("settings.freshDeckHint")}
            checked={draft.freshDeck}
            onChange={(v) => setDraft((cur) => ({ ...cur, freshDeck: v }))}
            offByAdmin={false}
          />
        </CardContent>
      </Card>
      <StorageCard />
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.reviewTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="review-new">{t("settings.reviewNewPerDay")}</Label>
            <Input
              id="review-new"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_REVIEW_NEW_PER_DAY}
              step={1}
              value={newPerDay}
              className="max-w-32"
              aria-invalid={!perDayOk || undefined}
              onChange={(e) => setNewPerDay(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("settings.reviewNewPerDayHint", {
                max: MAX_REVIEW_NEW_PER_DAY,
              })}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="review-max">{t("settings.reviewMaxPerDay")}</Label>
            <Input
              id="review-max"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_REVIEW_MAX_PER_DAY}
              step={1}
              value={maxPerDay}
              className="max-w-32"
              aria-invalid={!maxPerDayOk || undefined}
              onChange={(e) => setMaxPerDay(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("settings.reviewMaxPerDayHint", {
                max: MAX_REVIEW_MAX_PER_DAY,
              })}
            </p>
          </div>
          <div className="space-y-2">
            <Label id="review-algorithm">{t("settings.reviewAlgorithm")}</Label>
            <div>
              <ToggleGroup
                type="single"
                aria-labelledby="review-algorithm"
                value={draft.reviewAlgorithm}
                onValueChange={(v) =>
                  v &&
                  setDraft((cur) => ({
                    ...cur,
                    reviewAlgorithm: v as ReviewAlgorithm,
                  }))
                }
              >
                <ToggleGroupItem value="sm2" className="w-auto px-3 text-sm">
                  {t("settings.reviewAlgorithmSm2")}
                </ToggleGroupItem>
                <ToggleGroupItem value="fsrs" className="w-auto px-3 text-sm">
                  {t("settings.reviewAlgorithmFsrs")}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("settings.reviewAlgorithmHint")}
            </p>
          </div>
          {fsrs ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="desired-retention">
                  {t("settings.desiredRetention")}
                </Label>
                <Input
                  id="desired-retention"
                  type="number"
                  inputMode="numeric"
                  min={MIN_DESIRED_RETENTION}
                  max={MAX_DESIRED_RETENTION}
                  step={1}
                  value={retention}
                  className="max-w-32"
                  aria-invalid={!retentionOk || undefined}
                  onChange={(e) => setRetention(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t("settings.desiredRetentionHint", {
                    min: MIN_DESIRED_RETENTION,
                    max: MAX_DESIRED_RETENTION,
                  })}
                </p>
              </div>
              <FsrsParameters />
            </>
          ) : null}
        </CardContent>
      </Card>
      {error ? <Alert variant="destructive">{errorMessage(error, t)}</Alert> : null}
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
