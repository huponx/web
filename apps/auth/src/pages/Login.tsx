import { applyAccountLocale, rememberLanguageChoice, useTheme } from "@huponx/ui-kit";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { authApi } from "../api";
import { LANGUAGE_STORAGE_KEY, languages } from "../i18n";
import { AuthLayout, ErrorAlert, TextField, Form, SubmitButton, go, isTheme, useSubmit } from "../components/common";

export function Login() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  // a step that sent the user back here (an expired challenge) says why
  const reason = (useLocation().state as { error?: string } | null)?.error;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const s = useSubmit();
  const { theme, setTheme } = useTheme();
  // the theme and the language when the page opened: a difference at submit is a choice made here, which the account takes
  const opened = useRef({ theme, language: i18n.resolvedLanguage ?? "en" });
  // the link to the registration shows only when the server has it open
  const [canRegister, setCanRegister] = useState(false);
  useEffect(() => {
    let live = true;
    authApi.registrationOpen().then(
      (r) => live && setCanRegister(r.open),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  const returnTo = params.get("return_to");

  // already signed in: the portal, not the form (a return_to means a flow is under way: leave it alone)
  useEffect(() => {
    if (returnTo) return;
    let live = true;
    authApi.session().then(
      (i) => {
        if (live && i.redirect) window.location.assign(i.redirect); // another origin: no router navigate
      },
      () => undefined, // no session (401) or the check failed: the form is shown anyway
    );
    return () => {
      live = false;
    };
  }, [returnTo]);

  async function submit() {
    const language = i18n.resolvedLanguage ?? "en";
    const pickedTheme = theme !== opened.current.theme;
    const pickedLanguage = language !== opened.current.language;
    const r = await s.run(() =>
      authApi.login(email, password, params.get("return_to") ?? "", {
        theme: pickedTheme ? theme : undefined,
        locale: pickedLanguage ? language : undefined,
      }),
    );
    if (r) {
      // the account's choices, kept for the next visit of these pages (a choice made here is the account's now)
      if (!pickedTheme && isTheme(r.theme)) setTheme(r.theme);
      if (pickedLanguage) rememberLanguageChoice(LANGUAGE_STORAGE_KEY, language);
      else
        applyAccountLocale(r.locale, language, languages.map((l) => l.code), (code) => void i18n.changeLanguage(code), LANGUAGE_STORAGE_KEY);
      go(r, true);
    }
  }

  return (
    <AuthLayout title={t("login.title")}>
      <ErrorAlert error={s.error ?? (reason ? t(`errors.code.${reason}`) : undefined)} />
      <Form onSubmit={() => void submit()}>
        <TextField label={t("common.email")} type="email" name="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label={t("common.password")} type="password" name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <SubmitButton busy={s.busy}>{t("login.submit")}</SubmitButton>
      </Form>
      <Link className="text-center text-sm text-primary underline-offset-4 hover:underline" to="/password/forgot">
        {t("login.forgot")}
      </Link>
      {canRegister && (
        <Link className="text-center text-sm text-primary underline-offset-4 hover:underline" to="/register">
          {t("login.register")}
        </Link>
      )}
    </AuthLayout>
  );
}
