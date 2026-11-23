import { Button, UserAvatar } from "@huponx/ui-kit";
import { Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ACCEPTED_TYPES, AVATAR_SIDE, ImageError, resizeAvatar } from "../lib/image";
import type { ResizedImage } from "../lib/image";


/** What the user did with the picture: nothing (undefined), removed it (null), or picked a new one. */
export type AvatarChange = ResizedImage | null | undefined;

interface Props {
  name: string;
  email: string;
  /** The stored picture (data URI). */
  current?: string;
  value: AvatarChange;
  onChange: (v: AvatarChange) => void;
  disabled?: boolean;
}

export function AvatarUpload({ name, email, current, value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const shown = value === null ? undefined : (value?.dataUrl ?? current);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(undefined);
    setBusy(true);
    try {
      onChange(await resizeAvatar(file));
    } catch (e) {
      setError(t(`users.avatar.error.${e instanceof ImageError ? e.code : "decode"}`));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = ""; // the same file can be picked again
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4">
        <UserAvatar name={name} email={email} src={shown} className="size-20 text-2xl" />
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            className="hidden"
            data-testid="avatar-input"
            aria-label={t("users.avatar.file")}
            disabled={disabled}
            onChange={(ev) => void pick(ev.target.files?.[0])}
          />
          <Button type="button" variant="outline" busy={busy} disabled={disabled} onClick={() => input.current?.click()}>
            <Upload aria-hidden="true" />
            {t("users.avatar.upload")}
          </Button>
          {shown ? (
            <Button type="button" variant="ghost" disabled={disabled} onClick={() => onChange(null)}>
              <Trash2 aria-hidden="true" />
              {t("users.avatar.remove")}
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("users.avatar.hint", { side: AVATAR_SIDE })}</p>
      {value ? (
        <p className="text-xs text-muted-foreground" data-testid="avatar-size">
          {t("users.avatar.size", { kb: Math.max(1, Math.round(value.bytes / 1024)) })}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
