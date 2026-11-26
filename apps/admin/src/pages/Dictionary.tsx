import { Can, useAuth } from "@huponx/auth-client";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SwitchRow,
  useAction,
  useLoad,
} from "@huponx/ui-kit";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useIdentity } from "../api";
import type { DictionarySettings } from "../api";
import { formatBytes } from "../lib/bytes";
import {
  Actions,
  DoneAlert,
  ErrorAlert,
  Loading,
  PageTitle,
  SelectField,
  TextField,
} from "../components/common";

const MAX_SAVED_LIMIT = 1_000_000;
const MAX_RETENTION_HOURS = 8760;
const MAX_CATEGORIES_LIMIT = 200;
const MAX_CATEGORY_NAME_LIMIT = 100;
const MAX_EXPORT_SYNC_WORDS = 5000;

const KIB = 1024;
const MIB = 1024 * KIB;
const GIB = 1024 * MIB;
/** The sizes an administrator can choose; the ones above the ceiling of the deployment are left out. */
const EXPORT_SIZES = [1, 3, 6, 10].map((m) => m * MIB);
const EXPORT_PART_SIZES = [3, 6, 10, 25, 50].map((m) => m * MIB);
const CONTENT_SIZES = [16, 32, 64, 128, 256, 512].map((k) => k * KIB);
const CONTENT_QUOTAS = [64 * KIB, 1 * MIB, 16 * MIB, 64 * MIB, 256 * MIB, 512 * MIB, GIB];
const FILE_QUOTAS = [1, 5, 10, 20, 50, 100, 250, 500, 1024].map((m) => m * MIB);

/** The choices up to the ceiling; the current value stays in the list even when it is not one of the usual sizes. */
function sizeOptions(sizes: number[], ceiling: number, current: number) {
  const set = new Set(sizes.filter((b) => b <= ceiling));
  if (current > 0) set.add(current);
  return [...set]
    .sort((a, b) => a - b)
    .map((b) => ({ value: String(b), label: formatBytes(b) }));
}

function Editor({ initial }: { initial: DictionarySettings }) {
  const { t } = useTranslation();
  const api = useIdentity();
  const { can } = useAuth();
  const canWrite = can("dictionary:settings:write");
  const [max, setMax] = useState(String(initial.maxSavedWords));
  const [keep, setKeep] = useState(String(initial.exportedRetentionHours));
  const [maxCats, setMaxCats] = useState(String(initial.maxCategories));
  const [maxName, setMaxName] = useState(String(initial.maxCategoryNameLength));
  const [syncWords, setSyncWords] = useState(
    String(initial.exportSyncMaxWords),
  );
  const [s, setS] = useState(initial);
  const a = useAction();
  const syncSizes = sizeOptions(
    EXPORT_SIZES,
    s.exportMaxBytesCeiling,
    s.exportMaxBytes,
  );
  const partSizes = sizeOptions(
    EXPORT_PART_SIZES,
    s.exportPartMaxBytesCeiling,
    s.exportPartMaxBytes,
  );
  const contentSizes = sizeOptions(
    CONTENT_SIZES,
    s.maxContentBytesCeiling,
    s.maxContentBytes,
  );
  const contentQuotas = sizeOptions(
    CONTENT_QUOTAS,
    s.contentUserQuotaCeiling,
    s.contentUserQuota,
  );
  const imageQuotas = sizeOptions(
    FILE_QUOTAS,
    s.imageUserQuotaCeiling,
    s.imageUserQuota,
  );
  const audioQuotas = sizeOptions(
    FILE_QUOTAS,
    s.audioUserQuotaCeiling,
    s.audioUserQuota,
  );
  const set = (patch: Partial<DictionarySettings>) =>
    setS((cur) => ({ ...cur, ...patch }));
  const oneOn = s.englishEnabled || s.englishViEnabled;

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const saved = await a.run(
      () =>
        api.updateDictionarySettings({
          ...s,
          maxSavedWords: Number(max),
          exportedRetentionHours: Number(keep),
          maxCategories: Number(maxCats),
          maxCategoryNameLength: Number(maxName),
          exportSyncMaxWords: Number(syncWords),
        }),
      t("dictionary.saved"),
    );
    if (saved) {
      setS(saved);
      setMax(String(saved.maxSavedWords));
      setKeep(String(saved.exportedRetentionHours));
      setMaxCats(String(saved.maxCategories));
      setMaxName(String(saved.maxCategoryNameLength));
      setSyncWords(String(saved.exportSyncMaxWords));
    }
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={(ev) => void submit(ev)}>
      <Card>
        <CardHeader>
          <CardTitle>{t("dictionary.limits")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
          <TextField
            label={t("dictionary.maxCategories")}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_CATEGORIES_LIMIT}
            step={1}
            value={maxCats}
            onChange={(e) => setMaxCats(e.target.value)}
            hint={t("dictionary.maxCategoriesHint")}
            required
            disabled={!canWrite}
            className="max-w-40"
          />
          <TextField
            label={t("dictionary.maxCategoryName")}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_CATEGORY_NAME_LIMIT}
            step={1}
            value={maxName}
            onChange={(e) => setMaxName(e.target.value)}
            hint={t("dictionary.maxCategoryNameHint")}
            required
            disabled={!canWrite}
            className="max-w-40"
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("dictionary.storage")}</CardTitle>
          <CardDescription>{t("dictionary.storageHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SelectField
            label={t("dictionary.maxContentBytes")}
            hint={t("dictionary.maxContentBytesHint")}
            value={String(s.maxContentBytes)}
            onValueChange={(v) => set({ maxContentBytes: Number(v) })}
            options={contentSizes}
            disabled={!canWrite}
          />
          <SelectField
            label={t("dictionary.contentUserQuota")}
            hint={t("dictionary.contentUserQuotaHint")}
            value={String(s.contentUserQuota)}
            onValueChange={(v) => set({ contentUserQuota: Number(v) })}
            options={contentQuotas}
            disabled={!canWrite}
          />
          <SelectField
            label={t("dictionary.imageUserQuota")}
            hint={t("dictionary.imageUserQuotaHint")}
            value={String(s.imageUserQuota)}
            onValueChange={(v) => set({ imageUserQuota: Number(v) })}
            options={imageQuotas}
            disabled={!canWrite}
          />
          <SelectField
            label={t("dictionary.audioUserQuota")}
            hint={t("dictionary.audioUserQuotaHint")}
            value={String(s.audioUserQuota)}
            onValueChange={(v) => set({ audioUserQuota: Number(v) })}
            options={audioQuotas}
            disabled={!canWrite}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("dictionary.export")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SwitchRow
            label={t("dictionary.exportDeck")}
            hint={t("dictionary.exportDeckHint")}
            checked={s.allowExportDeck}
            onChange={(v) => set({ allowExportDeck: v })}
            disabled={!canWrite}
          />
          <SwitchRow
            label={t("dictionary.exportLink")}
            hint={t("dictionary.exportLinkHint")}
            checked={s.allowExportLink}
            onChange={(v) => set({ allowExportLink: v })}
            disabled={!canWrite}
          />
          <SwitchRow
            label={t("dictionary.removeAfterExport")}
            hint={t("dictionary.removeAfterExportHint")}
            checked={s.removeAfterExport}
            onChange={(v) => set({ removeAfterExport: v })}
            disabled={!canWrite}
          />
          <SelectField
            label={t("dictionary.exportMaxBytes")}
            hint={t("dictionary.exportMaxBytesHint")}
            value={String(s.exportMaxBytes)}
            onValueChange={(v) => set({ exportMaxBytes: Number(v) })}
            options={syncSizes}
            disabled={!canWrite}
          />
          <SelectField
            label={t("dictionary.exportPartMaxBytes")}
            hint={t("dictionary.exportPartMaxBytesHint")}
            value={String(s.exportPartMaxBytes)}
            onValueChange={(v) => set({ exportPartMaxBytes: Number(v) })}
            options={partSizes}
            disabled={!canWrite}
          />
          <TextField
            label={t("dictionary.exportSyncMaxWords")}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_EXPORT_SYNC_WORDS}
            step={1}
            value={syncWords}
            onChange={(e) => setSyncWords(e.target.value)}
            hint={t("dictionary.exportSyncMaxWordsHint")}
            required
            disabled={!canWrite}
            className="max-w-40"
          />
          <TextField
            label={t("dictionary.retention")}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_RETENTION_HOURS}
            step={1}
            value={keep}
            onChange={(e) => setKeep(e.target.value)}
            hint={t("dictionary.retentionHint")}
            required
            disabled={!canWrite}
            className="max-w-40"
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("dictionary.dictionaries")}</CardTitle>
          <CardDescription>{t("dictionary.oneOn")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SwitchRow
            label={t("dictionary.english")}
            hint={t("dictionary.englishHint")}
            checked={s.englishEnabled}
            onChange={(v) => set({ englishEnabled: v })}
            disabled={!canWrite}
          />
          <SwitchRow
            label={t("dictionary.englishVi")}
            hint={t("dictionary.englishViHint")}
            checked={s.englishViEnabled}
            onChange={(v) => set({ englishViEnabled: v })}
            disabled={!canWrite}
          />
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
      <PageTitle description={t("dictionary.intro")}>
        {t("dictionary.title")}
      </PageTitle>
      {load.error ? (
        <ErrorAlert error={load.error} />
      ) : load.data ? (
        <Editor initial={load.data} />
      ) : (
        <Loading />
      )}
    </div>
  );
}
