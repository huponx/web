import { Can } from "@huponx/auth-client";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  iconTone,
  useAction,
  useLoad,
} from "@huponx/ui-kit";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useIdentity } from "../api";
import type { StorageQuota, UserQuota } from "../api";
import {
  ActionLabel,
  Actions,
  DoneAlert,
  ErrorAlert,
  Loading,
  TextField,
} from "../components/common";
import { formatBytes } from "../lib/bytes";
import { ROUTES } from "../authz";

const MIB = 1024 * 1024;
const KINDS = ["content", "image", "audio"] as const;

/** The override in MiB for an input; empty when the user has none. */
const mibOf = (bytes: number) =>
  bytes > 0 ? String(Number((bytes / MIB).toFixed(3))) : "";

function Editor({ userId, initial }: { userId: string; initial: UserQuota }) {
  const { t } = useTranslation();
  const api = useIdentity();
  const a = useAction();
  const [q, setQ] = useState(initial);
  const [text, setText] = useState<Record<(typeof KINDS)[number], string>>({
    content: mibOf(initial.override.content),
    image: mibOf(initial.override.image),
    audio: mibOf(initial.override.audio),
  });

  async function write(next: StorageQuota) {
    const saved = await a.run(
      () => api.setUserQuota(userId, next),
      t("users.storage.saved"),
    );
    if (saved) {
      setQ(saved);
      setText({
        content: mibOf(saved.override.content),
        image: mibOf(saved.override.image),
        audio: mibOf(saved.override.audio),
      });
    }
  }

  const [note, setNote] = useState<{ id: number; text: string }>();
  async function recalculate() {
    const r = await a.run(() => api.recalculateUserStorage(userId));
    if (!r) return;
    setQ(r);
    const changed = KINDS.filter((k) => r.previous[k] !== r.used[k]);
    const text = changed.length
      ? t("users.storage.recalculatedChanged", {
          changes: changed
            .map(
              (k) =>
                `${t(`users.storage.${k}`)}: ${formatBytes(r.previous[k])} → ${formatBytes(r.used[k])}`,
            )
            .join(", "),
        })
      : t("users.storage.recalculated");
    setNote((n) => ({ id: (n?.id ?? 0) + 1, text }));
  }

  const fromText = (): StorageQuota => {
    const bytes = (k: (typeof KINDS)[number]) =>
      Math.round(Number(text[k] || 0) * MIB);
    return {
      content: bytes("content"),
      image: bytes("image"),
      audio: bytes("audio"),
    };
  };

  function submit(ev: FormEvent) {
    ev.preventDefault();
    void write(fromText());
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      {KINDS.map((k) => (
        <div
          key={k}
          className="flex flex-wrap items-end gap-3"
          data-testid={`quota-${k}`}
        >
          <div className="min-w-48 flex-1">
            <p className="text-sm font-medium">{t(`users.storage.${k}`)}</p>
            <p
              className="text-sm text-muted-foreground"
              data-testid={`quota-${k}-usage`}
            >
              {t("users.storage.usage", {
                used: formatBytes(q.used[k]),
                limit: formatBytes(q.effective[k]),
              })}{" "}
              {q.override[k] > 0
                ? t("users.storage.own")
                : t("users.storage.default")}
            </p>
          </div>
          <Can route={ROUTES.putDictSettings}>
            <TextField
              label={t("users.storage.override")}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={text[k]}
              placeholder={t("users.storage.defaultPlaceholder")}
              onChange={(e) =>
                setText((cur) => ({ ...cur, [k]: e.target.value }))
              }
              className="w-40"
            />
            <Button
              type="button"
              variant="outline"
              busy={a.busy}
              disabled={q.override[k] === 0}
              onClick={() => void write({ ...q.override, [k]: 0 })}
            >
              {t("users.storage.useDefault")}
            </Button>
          </Can>
        </div>
      ))}
      <ErrorAlert error={a.error} />
      <DoneAlert watch={a.doneId}>{a.done}</DoneAlert>
      {note && <DoneAlert watch={note.id}>{note.text}</DoneAlert>}
      <Can route={ROUTES.putDictSettings}>
        <Actions>
          <Button type="submit" busy={a.busy}>
            {t("users.storage.save")}
          </Button>
          <Button
            type="button"
            variant="outline"
            busy={a.busy}
            onClick={() => void recalculate()}
          >
            <ActionLabel icon={RefreshCw} iconClassName={iconTone.refresh}>
              {t("users.storage.recalculate")}
            </ActionLabel>
          </Button>
        </Actions>
      </Can>
    </form>
  );
}

/** What a user stores in the dictionary against the limits, and the own limits an administrator can set. */
export function UserStorage({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const api = useIdentity();
  const { data, error } = useLoad(
    () => api.getUserQuota(userId),
    [api, userId],
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("users.storage.title")}</CardTitle>
        <CardDescription>{t("users.storage.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorAlert error={error} />
        ) : data ? (
          <Editor key={userId} userId={userId} initial={data} />
        ) : (
          <Loading />
        )}
      </CardContent>
    </Card>
  );
}
