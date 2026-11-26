import { Button } from "@huponx/ui-kit";
import { Volume2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePlayAudio } from "../lib/playAudio";

/** Plays the audio of a card: an https URL or an uploaded file (`dictaud:<id>`); nothing when there is none. */
export function Play({
  url,
  region,
  className,
}: {
  url: string;
  region: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const play = usePlayAudio();
  if (!url) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={className}
      aria-label={t("lookup.play", { region })}
      title={t("lookup.play", { region })}
      onClick={() => void play(url).catch(() => undefined)}
    >
      <Volume2 aria-hidden="true" />
    </Button>
  );
}
