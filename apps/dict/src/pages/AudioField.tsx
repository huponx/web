import { Button, Input, Label } from "@huponx/ui-kit";
import { Play, Trash2, Upload } from "lucide-react";
import { useRef } from "react";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { AUDIO_ACCEPT, isAudioRef } from "../lib/audio";
import { normalizeAudioInput } from "../lib/audioUrl";
import { usePlayAudio } from "../lib/playAudio";

export interface AudioFieldProps {
  /** Id of the text input (and of the label). */
  id: string;
  label: string;
  /** The region in the accessible names of the buttons ("UK", "US"). */
  region: string;
  /** An https URL, a `dictaud:<id>` reference or "". */
  value: string;
  onChange: (value: string) => void;
  /** Sends the file; the caller shows the progress and the errors. */
  onUpload: (file: File) => void;
  uploading?: boolean;
}

/** One audio field of the card editor: a URL to type or paste, or a file to upload (then a chip with listen and remove). */
export default function AudioField({
  id,
  label,
  region,
  value,
  onChange,
  onUpload,
  uploading = false,
}: AudioFieldProps) {
  const { t } = useTranslation();
  const play = usePlayAudio();
  const file = useRef<HTMLInputElement>(null);
  const uploaded = isAudioRef(value);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) onUpload(f);
  }

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-1">
        {uploaded ? (
          <div
            id={id}
            data-testid={`${id}-uploaded`}
            className="flex h-9 min-w-0 flex-1 items-center gap-1 rounded-md border border-input bg-muted px-2 text-sm"
          >
            <span className="min-w-0 flex-1 truncate">
              {t("editor.audioUploaded")}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("editor.audioListen", { region })}
              title={t("editor.audioListen", { region })}
              onClick={() => void play(value).catch(() => undefined)}
            >
              <Play aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("editor.audioRemove", { region })}
              title={t("editor.audioRemove", { region })}
              onClick={() => onChange("")}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <Input
            id={id}
            type="text"
            inputMode="url"
            value={value}
            onChange={(e) => onChange(normalizeAudioInput(e.target.value))}
          />
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          busy={uploading}
          disabled={uploading}
          aria-label={t("editor.audioUpload", { region })}
          onClick={() => file.current?.click()}
        >
          <Upload aria-hidden="true" />
          {t("editor.upload")}
        </Button>
        <input
          ref={file}
          type="file"
          accept={AUDIO_ACCEPT}
          hidden
          aria-label={t("editor.audioFile", { region })}
          onChange={onPick}
        />
      </div>
    </div>
  );
}
