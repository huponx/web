import { applyAccountLocale, conditionalLoginSupported, hasPasskeyHint, passkeysSupported, rememberLanguageChoice, rememberPasskey, useTheme, Button } from "@huponx/ui-kit";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ApiError, authApi } from "../api";
import type { Next } from "../api";
import { LANGUAGE_STORAGE_KEY, languages } from "../i18n";
import { askPasskey } from "../components/passkey";
import { AuthLayout, ErrorAlert, TextField, Form, SubmitButton, go, isTheme, useErrorText, useSubmit } from "../components/common";

/** A key: the passkey button's icon (inline, so the sign in app needs no icon package). */
function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.7 12.3 9.8-9.8M16 7l3 3M14 9l2 2" />
    </svg>
  );
}

export function Login() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  // a step that sent the user back here (an expired challenge) says why
  const reason = (useLocation().state as { error?: string } | null)?.error;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const s = useSubmit();
  const errorText = useErrorText();
  const { theme, setTheme } = useTheme();
  // the theme and the language when the page opened: a difference at submit is a choice made here, which the account takes
  const opened = useRef({ theme, language: i18n.resolvedLanguage ?? "en" });
  // the link to the registration shows only when the server has it open; the passkey button only when it has passkeys on
  const [canRegister, setCanRegister] = useState(false);
  const [serverPasskeys, setServerPasskeys] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string>();
  // the pending request of the autofill list: a click on the button replaces it
  const conditional = useRef<AbortController>();
  const showPasskey = serverPasskeys && passkeysSupported();
  // a browser that signed in with a passkey before: the button is the way in, not the e-mail field
  const passkeyFirst = showPasskey && hasPasskeyHint();
  useEffect(() => {
    let live = true;
    authApi.registrationOpen().then(
      (r) => {
        if (!live) return;
        setCanRegister(r.open);
        setServerPasskeys(r.passkeys);
      },
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

  /** What the sign in does with the answer: the account's theme and language, then the next page. */
  function finish(r: Next & { theme?: string; locale?: string }, pickedTheme: boolean, pickedLanguage: boolean, language: string) {
    // the account's choices, kept for the next visit of these pages (a choice made here is the account's now)
    if (!pickedTheme && isTheme(r.theme)) setTheme(r.theme);
    if (pickedLanguage) rememberLanguageChoice(LANGUAGE_STORAGE_KEY, language);
    else applyAccountLocale(r.locale, language, languages.map((l) => l.code), (code) => void i18n.changeLanguage(code), LANGUAGE_STORAGE_KEY);
    go(r, true);
  }

  function picked() {
    const language = i18n.resolvedLanguage ?? "en";
    return { language, pickedTheme: theme !== opened.current.theme, pickedLanguage: language !== opened.current.language };
  }

  async function submit() {
    const { language, pickedTheme, pickedLanguage } = picked();
    const r = await s.run(() =>
      authApi.login(email, password, params.get("return_to") ?? "", {
        theme: pickedTheme ? theme : undefined,
        locale: pickedLanguage ? language : undefined,
      }),
    );
    if (r) finish(r, pickedTheme, pickedLanguage, language);
  }

  /** The passkey sign in: the options, the browser's prompt (modal, or the autofill list), the answer. */
  async function passkeyLogin(opts: { conditional?: boolean; signal?: AbortSignal } = {}) {
    const { language, pickedTheme, pickedLanguage } = picked();
    const begin = await authApi.passkeyLoginBegin();
    const credential = await askPasskey(begin.options, opts);
    if (!credential) return false;
    const r = await authApi.passkeyLoginFinish(begin.c, credential, params.get("return_to") ?? "", {
      theme: pickedTheme ? theme : undefined,
      locale: pickedLanguage ? language : undefined,
    });
    rememberPasskey();
    finish(r, pickedTheme, pickedLanguage, language);
    return true;
  }

  async function passkeyClick() {
    conditional.current?.abort();
    setPasskeyBusy(true);
    setPasskeyError(undefined);
    try {
      await passkeyLogin();
    } catch (err) {
      setPasskeyError(errorText(err));
    } finally {
      setPasskeyBusy(false);
    }
  }

  // the passkeys in the autofill list of the e-mail field, for the browsers that have it
  useEffect(() => {
    if (!showPasskey) return;
    const ctl = new AbortController();
    conditional.current = ctl;
    void conditionalLoginSupported().then((ok) => {
      if (!ok || ctl.signal.aborted) return;
      passkeyLogin({ conditional: true, signal: ctl.signal }).catch((err) => {
        // an aborted request is the click on the button or leaving the page; a real refusal is shown
        if (!ctl.signal.aborted && err instanceof ApiError) setPasskeyError(errorText(err));
      });
    });
    return () => ctl.abort();
    // the ceremony reads the page's current state when the user picks a passkey; it starts once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPasskey]);

  return (
    <AuthLayout title={t("login.title")}>
      <ErrorAlert error={passkeyError ?? s.error ?? (reason ? t(`errors.code.${reason}`) : undefined)} />
      <Form onSubmit={() => void submit()}>
        <TextField
          label={t("common.email")}
          type="email"
          name="email"
          autoComplete={showPasskey ? "username webauthn" : "username"}
          required
          autoFocus={!passkeyFirst}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField label={t("common.password")} type="password" name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <SubmitButton busy={s.busy} size="lg">
          {t("login.submit")}
        </SubmitButton>
      </Form>
      {showPasskey && (
        <Button type="button" size="lg" variant="outline" busy={passkeyBusy} autoFocus={passkeyFirst} data-testid="passkey-login" onClick={() => void passkeyClick()}>
          <KeyIcon />
          {passkeyBusy ? t("login.passkeyBusy") : t("login.passkey")}
        </Button>
      )}
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
