import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DEFAULT_UI_PALETTE,
  UI_PALETTES,
  UI_STYLES,
  cn,
  isUIPalette,
  useAction,
  useTheme,
  useUIStyle,
} from "@huponx/ui-kit";
import type { UIPalette, UIStyle } from "@huponx/ui-kit";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIdentity } from "../api";
import { DoneAlert, ErrorAlert, PageTitle } from "../components/common";

/** A miniature of one style: the tokens of `data-style` apply to this element and its children, so no copy of the colours is kept here. */
function StylePreview({ value, palette }: { value: UIStyle; palette: UIPalette }) {
  const { resolved } = useTheme();
  return (
    <div
      data-style={value}
      data-palette={palette}
      className={cn(
        "pointer-events-none flex h-20 w-full flex-col justify-between overflow-hidden rounded-md border bg-(--page-bg) bg-(image:--page-image) p-2 text-foreground",
        resolved === "dark" && "dark",
      )}
      aria-hidden="true"
    >
      <div className="ui-glass h-7 rounded-(--radius) border bg-card shadow-(--shadow-card)" />
      {/* mono keeps black and white buttons, so the colour of the palette shows as a dot */}
      {value === "mono" && <div className="size-3 rounded-full bg-(--pal-primary)" />}
      <div className="h-4 w-14 self-end rounded-md bg-primary bg-(image:--btn-bg) shadow-(--shadow-btn) glass:rounded-full" />
    </div>
  );
}

/** The palette of each style, a style that is not set is the default one. */
type Palettes = Record<UIStyle, UIPalette>;

function palettesOf(raw: Record<string, string>): Palettes {
  const pick = (s: UIStyle) => (isUIPalette(raw[s]) ? raw[s] : DEFAULT_UI_PALETTE);
  return { saas: pick("saas"), glass: pick("glass"), mono: pick("mono") };
}

/** The look of every web app, for every user: one of three styles and the colour set of each, saved for the whole system. Needs identity:settings:write. */
function SystemStyle() {
  const { t } = useTranslation();
  const api = useIdentity();
  const { style, setStyle, palette, setPalette } = useUIStyle();
  const a = useAction();
  const [picked, setPicked] = useState<UIStyle>(style);
  const [palettes, setPalettes] = useState<Palettes>(() => ({ ...palettesOf({}), [style]: palette }));
  // the system value (it can differ from the cached one of this browser)
  useEffect(() => {
    let live = true;
    api.getUiStyle().then(
      (v) => {
        if (!live) return;
        if (UI_STYLES.includes(v.uiStyle as UIStyle)) setPicked(v.uiStyle as UIStyle);
        setPalettes(palettesOf(v.uiPalettes));
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [api]);

  async function save() {
    const ok = await a.run(async () => {
      await api.updateUiStyle({ uiStyle: picked, uiPalettes: palettes });
      return true;
    }, t("systemSettings.uiStyle.saved"));
    if (ok) {
      setStyle(picked);
      setPalette(palettes[picked]);
    }
  }

  return (
    <Card data-testid="ui-style-card">
      <CardHeader>
        <CardTitle>{t("systemSettings.uiStyle.title")}</CardTitle>
        <CardDescription>{t("systemSettings.uiStyle.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div role="radiogroup" aria-label={t("systemSettings.uiStyle.title")} className="grid gap-3 sm:grid-cols-3">
          {UI_STYLES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={picked === s}
              data-testid={`ui-style-${s}`}
              onClick={() => setPicked(s)}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-2 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
                picked === s && "border-primary ring-2 ring-primary/40",
              )}
            >
              <StylePreview value={s} palette={palettes[s]} />
              <span className="px-1 text-sm font-medium">{t(`systemSettings.uiStyle.${s}.name`)}</span>
              <span className="px-1 text-xs text-muted-foreground">{t(`systemSettings.uiStyle.${s}.hint`)}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <div>
            <h3 className="text-sm font-medium">{t("systemSettings.palette.title")}</h3>
            <p className="text-xs text-muted-foreground">{t("systemSettings.palette.description")}</p>
          </div>
          <div role="radiogroup" aria-label={t("systemSettings.palette.title")} className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {UI_PALETTES.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={palettes[picked] === p}
                data-testid={`ui-palette-${p}`}
                onClick={() => setPalettes((cur) => ({ ...cur, [picked]: p }))}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border p-2 outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  palettes[picked] === p && "border-primary ring-2 ring-primary/40",
                )}
              >
                <StylePreview value={picked} palette={p} />
                <span className="text-xs font-medium">{t(`systemSettings.palette.${p}`)}</span>
              </button>
            ))}
          </div>
        </div>
        <ErrorAlert error={a.error} />
        <DoneAlert watch={a.doneId}>{a.done}</DoneAlert>
        <div className="flex justify-end">
          <Button onClick={() => void save()} busy={a.busy}>
            {t("systemSettings.uiStyle.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Settings of the whole system (every user, every app), unlike Settings, which holds the ones of the signed in user. */
export function SystemSettings() {
  const { t } = useTranslation();
  return (
    <>
      <PageTitle description={t("systemSettings.description")}>{t("systemSettings.title")}</PageTitle>
      <SystemStyle />
    </>
  );
}
