import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, ThemeSwitch, TooltipProvider } from "@huponx/ui-kit";
import type { ButtonProps } from "@huponx/ui-kit";
import { useId, useState } from "react";
import type { FormEvent, InputHTMLAttributes, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../api";
import { languages } from "../i18n";
import type { Next } from "../api";
import { MmLogo } from "./MmLogo";

/** The centered card every page lives in. */
export function AuthLayout({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <main className="relative flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Preferences />
      <Card className="w-full max-w-md">
        <CardHeader className="items-center gap-3 text-center">
          <MmLogo className="size-12 drop-shadow-sm" />
          <CardTitle className="text-xl">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
      </Card>
    </main>
  );
}

/** The switches of theme and language, in the corner of every page (the same choices as in the apps). */
function Preferences() {
  const { t, i18n } = useTranslation();
  const current = i18n.resolvedLanguage ?? "en";
  const idx = Math.max(0, languages.findIndex((l) => l.code === current));
  const next = languages[(idx + 1) % languages.length]!;
  const text = `${t("preferences.language")}: ${languages[idx]!.label}`;
  return (
    <TooltipProvider>
      <div className="absolute right-3 top-3 flex items-center gap-1">
        <Button variant="ghost" size="sm" aria-label={text} title={text} data-testid="language-switch" onClick={() => void i18n.changeLanguage(next.code)}>
          {current.toUpperCase()}
        </Button>
        <ThemeSwitch labels={{ group: t("preferences.group"), light: t("preferences.light"), dark: t("preferences.dark"), system: t("preferences.system") }} />
      </div>
    </TooltipProvider>
  );
}

/** A labelled input. */
export function Field({ label, hint, ...rest }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...rest} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Texts of the error codes of /auth-api; an unknown code shows the message of the server. */
export function useErrorText() {
  const { t, i18n } = useTranslation();
  return (err: unknown): string => {
    if (err instanceof ApiError) {
      const key = `errors.${err.code}`;
      return i18n.exists(key) ? t(key) : err.message || t("errors.internal");
    }
    return t("errors.network");
  };
}

/**
 * Goes to the next page of the flow. Only a path of this site is followed, never a full URL, except with
 * `external` (the sign out, whose address identity only returns when it is registered for the application).
 */
export function go(next: Next | undefined, external = false) {
  const to = next?.redirect;
  if (!to) return;
  const path = to.startsWith("/") && !to.startsWith("//") && !to.includes("\\");
  if (path || (external && /^https?:\/\//i.test(to))) window.location.assign(to);
}

/** Runs a submit: busy while it runs, the error text when it fails. */
export function useSubmit() {
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(undefined);
    try {
      return await fn();
    } catch (err) {
      setError(errorText(err));
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

export function ErrorAlert({ message }: { message?: string }) {
  return message ? <Alert variant="destructive">{message}</Alert> : null;
}

/** A form whose submit is handled by `onSubmit` (no page reload). */
export function Form({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(ev: FormEvent) => {
        ev.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

export function SubmitButton({ busy, children, ...rest }: { busy: boolean; children: ReactNode } & Omit<ButtonProps, "type">) {
  return (
    <Button type="submit" busy={busy} {...rest}>
      {children}
    </Button>
  );
}

/** The three values of the theme of an account. */
export function isTheme(v: unknown): v is "light" | "dark" | "system" {
  return v === "light" || v === "dark" || v === "system";
}
