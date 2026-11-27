import { Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { ACCEPTED_TYPES, AVATAR_SIDE, ImageError, resizeAvatar, validateImage } from "../lib/image";
import type { Crop } from "../lib/crop";
import type { ResizedImage } from "../lib/image";
import { ImageCropDialog } from "./image-crop-dialog";
import type { ImageCropLabels } from "./image-crop-dialog";
import { iconTone } from "../lib/tones";
import { Button } from "./ui/button";
import { UserAvatar } from "./user-avatar";

/** What the user did with the picture: nothing (undefined), removed it (null), or picked a new one. */
export type AvatarChange = ResizedImage | null | undefined;

/** The texts of the control; the kit has no i18n, the app passes them translated. */
export interface AvatarUploadLabels {
  /** Accessible name of the file input. */
  file: string;
  upload: string;
  remove: string;
  /** What is accepted; `side` is the edge of the stored picture. */
  hint: (side: number) => string;
  /** The size of the picture that was prepared. */
  size: (kb: number) => string;
  error: Record<ImageError["code"], string>;
  crop: ImageCropLabels;
}

interface Props {
  name: string;
  email: string;
  /** The stored picture (data URI). */
  current?: string;
  value: AvatarChange;
  onChange: (v: AvatarChange) => void;
  disabled?: boolean;
  labels: AvatarUploadLabels;
}

/** Picks a picture, lets the user choose the square to keep, and hands back the resized result. */
export function AvatarUpload({ name, email, current, value, onChange, disabled, labels }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<File>();

  const shown = value === null ? undefined : (value?.dataUrl ?? current);

  function fail(e: unknown) {
    setError(labels.error[e instanceof ImageError ? e.code : "decode"]);
  }

  function pick(file: File | undefined) {
    if (!file) return;
    try {
      validateImage(file);
      setError(undefined);
      setPicked(file); // opens the crop dialog
    } catch (e) {
      fail(e);
    }
    if (input.current) input.current.value = ""; // the same file can be picked again
  }

  async function use(file: File, crop: Crop) {
    setPicked(undefined);
    setBusy(true);
    try {
      onChange(await resizeAvatar(file, crop));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
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
            aria-label={labels.file}
            disabled={disabled}
            onChange={(ev) => pick(ev.target.files?.[0])}
          />
          <Button type="button" variant="outline" busy={busy} disabled={disabled} onClick={() => input.current?.click()}>
            <Upload aria-hidden="true" className={iconTone.save} />
            {labels.upload}
          </Button>
          {shown ? (
            <Button type="button" variant="ghost" disabled={disabled} onClick={() => onChange(null)}>
              <Trash2 aria-hidden="true" className={iconTone.danger} />
              {labels.remove}
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{labels.hint(AVATAR_SIDE)}</p>
      {value ? (
        <p className="text-xs text-muted-foreground" data-testid="avatar-size">
          {labels.size(Math.max(1, Math.round(value.bytes / 1024)))}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <ImageCropDialog file={picked} open={!!picked} labels={labels.crop} onCancel={() => setPicked(undefined)} onConfirm={(crop) => picked && void use(picked, crop)} />
    </div>
  );
}
