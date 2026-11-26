import { Can } from "@huponx/auth-client";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, useAction, useLoad } from "@huponx/ui-kit";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useIdentity } from "../api";
import type { StorageQuota, UserQuota } from "../api";
import { Actions, DoneAlert, ErrorAlert, Loading, TextField } from "../components/common";
import { formatBytes } from "../lib/bytes";

const MIB = 1024 * 1024;
const KINDS = ["content", "image", "audio"] as const;

/** The override in MiB for an input; empty when the user has none. */
const mibOf = (bytes: number) => (bytes > 0 ? String(Number((bytes / MIB).toFixed(3))) : "");

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
    const saved = await a.run(() => api.setUserQuota(userId, next), t("users.storage.saved"));
    if (saved) {
      setQ(saved);
      setText({ content: mibOf(saved.override.content), image: mibOf(saved.override.image), audio: mibOf(saved.override.audio) });
    }
  }

  const fromText = (): StorageQuota => {
    const bytes = (k: (typeof KINDS)[number]) => Math.round(Number(text[k] || 0) * MIB);
    return { content: bytes("content"), image: bytes("image"), audio: bytes("audio") };
  };

  function submit(ev: FormEvent) {
    ev.preventDefault();
    void write(fromText());
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      {KINDS.map((k) => (
        <div key={k} className="flex flex-wrap items-end gap-3" data-testid={`quota-${k}`}>
          <div className="min-w-48 flex-1">
            <p className="text-sm font-medium">{t(`users.storage.${k}`)}</p>
            <p className="text-sm text-muted-foreground" data-testid={`quota-${k}-usage`}>
              {t("users.storage.usage", { used: formatBytes(q.used[k]), limit: formatBytes(q.effective[k]) })}{" "}
              {q.override[k] > 0 ? t("users.storage.own") : t("users.storage.default")}
            </p>
          </div>
          <Can perm="dictionary:settings:write">
            <TextField
              label={t("users.storage.override")}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={text[k]}
              placeholder={t("users.storage.defaultPlaceholder")}
              onChange={(e) => setText((cur) => ({ ...cur, [k]: e.target.value }))}
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
      <Can perm="dictionary:settings:write">
        <Actions className="justify-start">
          <Button type="submit" busy={a.busy}>
            {t("users.storage.save")}
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
  const { data, error } = useLoad(() => api.getUserQuota(userId), [api, userId]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("users.storage.title")}</CardTitle>
        <CardDescription>{t("users.storage.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {error ? <ErrorAlert error={error} /> : data ? <Editor key={userId} userId={userId} initial={data} /> : <Loading />}
      </CardContent>
    </Card>
  );
}
