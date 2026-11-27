import { Alert, Button, buttonVariants, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, iconTone, passkeysSupported, Stepper } from "@huponx/ui-kit";
import { MoreHorizontal, RefreshCw, ShieldCheck, ShieldOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { ApiError, authApi } from "../api";
import type { MfaStatus } from "../api";
import { AuthLayout, ErrorAlert, TextField, Form, SubmitButton, go, useSubmit } from "../components/common";
import { Passkeys } from "../components/Passkeys";
import { ErrorPage } from "./ErrorPage";

/** Leaving MFA or replacing the authenticator: a dialog of two steps, the password and a code only after the user went on. */
type Action = "disable" | "change";

/**
 * Multi-factor authentication of the signed in user. Not on yet: a wizard of three steps (connect the authenticator,
 * verify it with the first code, save the recovery codes, shown once). On: the status as a row with a menu to change the
 * authenticator or turn MFA off, both after a re-authentication. The server starts a new enrollment whenever MFA is off,
 * so after either action the wizard is what the page shows.
 */
export function AccountMfa() {
  const { t } = useTranslation();
  const returnTo = useSearchParams()[0].get("return_to") ?? "";
  const [status, setStatus] = useState<MfaStatus>();
  const [missing, setMissing] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // the page has two views, never both at once: the authenticator app and the passkeys
  const [view, setView] = useState<"authenticator" | "passkeys">("authenticator");
  const [passkeysOn, setPasskeysOn] = useState(false); // the server has them on and this browser can make one
  const [codes, setCodes] = useState<{ list: string[]; next: string }>();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [action, setAction] = useState<Action>();
  const [astep, setAstep] = useState<1 | 2>(1);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const s = useSubmit();

  const load = useCallback(() => {
    authApi.mfaStatus().then(setStatus, (err) => {
      if (err instanceof ApiError && err.status === 401) {
        // no session: sign in, then come back here
        const back = `/account/mfa${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ""}`;
        window.location.assign(`/login?return_to=${encodeURIComponent(back)}`);
      } else setMissing(true);
    });
  }, [returnTo]);
  useEffect(load, [load]);
  useEffect(() => {
    let live = true;
    authApi.registrationOpen().then(
      (r) => live && setPasskeysOn(r.passkeys && passkeysSupported()),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);

  async function confirm() {
    const r = await s.run(() => authApi.confirmMfa(code, returnTo));
    if (r) {
      setCodes({ list: r.recoveryCodes, next: r.redirect });
      setStep(3);
      setCode("");
    }
  }

  function openAction(k: Action) {
    setAction(k);
    setAstep(1);
    setPassword("");
    setCode("");
    s.clear();
  }

  function closeAction() {
    setAction(undefined);
    setPassword("");
    setCode("");
    s.clear();
  }

  async function submitAction() {
    if (astep === 1) {
      setAstep(2);
      s.clear();
      return;
    }
    const r = await s.run(() => authApi.disableMfa(password, code));
    if (r !== undefined) {
      closeAction();
      setStep(1);
      setShowKey(false);
      setStatus(undefined);
      load(); // MFA is off: the server answers with a new enrollment, which is the wizard
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText((codes?.list ?? []).join("\n"));
      setCopied(true);
    } catch {
      // no clipboard (insecure context): the codes are on screen to copy by hand
    }
  }

  // Back goes to where the user came from (a path of this site), the list of applications otherwise; never to this page
  // itself. A user who must enroll has no way back (the application sends them here again): they can sign out instead.
  const here = returnTo === "/account/mfa" || returnTo.startsWith("/account/mfa?");
  const backTo = !here && returnTo.startsWith("/") && !returnTo.startsWith("//") && !returnTo.includes("\\") ? returnTo : "/";
  const mustEnroll = status !== undefined && !status.enabled && status.forced === true;
  const back = mustEnroll ? (
    <a className={buttonVariants({ variant: "ghost" })} href="/logout" data-testid="mfa-signout">
      {t("logout.submit")}
    </a>
  ) : (
    <a className={buttonVariants({ variant: "ghost" })} href={backTo} data-testid="mfa-back">
      {t("common.back")}
    </a>
  );

  if (missing) return <ErrorPage code="not_found" />;
  if (!status) return null;

  if (view === "passkeys")
    return (
      <AuthLayout signedIn title={t("passkeys.title")} description={t("passkeys.intro")}>
        {/* a user who had to enroll is done with the first passkey: on to where they were going */}
        <Passkeys bare returnTo={returnTo} onAdded={mustEnroll ? (redirect) => go({ redirect }, true) : undefined} />
        <Button type="button" variant="link" onClick={() => setView("authenticator")}>
          {status.enabled ? t("account.backToMfa") : t("account.switchToAuthenticator")}
        </Button>
        {back}
      </AuthLayout>
    );

  // the other way in, when the server has passkeys on
  const toPasskeys = (label: string) =>
    passkeysOn ? (
      <Button type="button" variant="link" onClick={() => setView("passkeys")} data-testid="to-passkeys">
        {label}
      </Button>
    ) : null;

  if (status.enabled && !codes)
    return (
      <AuthLayout signedIn title={t("account.title")} description={t("account.onShort")}>
        {status.forced ? (
          <Alert>{t("account.forced")}</Alert>
        ) : (
          <div className="flex items-center gap-3 rounded-md border p-3" data-testid="mfa-row">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <ShieldCheck className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{t("account.authenticator")}</div>
              <div className="text-xs text-muted-foreground">{t("account.codesLeft", { count: status.codesLeft ?? 0 })}</div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={t("account.actions")}>
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => openAction("change")}>
                  <RefreshCw aria-hidden="true" className={iconTone.refresh} />
                  {t("account.change")}
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => openAction("disable")}>
                  <ShieldOff aria-hidden="true" />
                  {t("account.disable")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        {toPasskeys(t("account.managePasskeys"))}
        {back}

        <Dialog open={action !== undefined} onOpenChange={(o) => !o && closeAction()}>
          <DialogContent closeLabel={t("common.close")}>
            <Form onSubmit={() => void submitAction()}>
              <DialogHeader>
                <DialogTitle>{action === "change" ? t("account.changeTitle") : t("account.disableTitle")}</DialogTitle>
                <DialogDescription>
                  {astep === 1 ? (action === "change" ? t("account.changeConfirm") : t("account.disableConfirm")) : t("account.reauth")}
                </DialogDescription>
              </DialogHeader>
              <ErrorAlert error={s.error} />
              {astep === 2 ? (
                <>
                  <TextField label={t("common.password")} type="password" name="password" autoComplete="current-password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
                  <TextField label={t("account.codeOrRecovery")} name="code" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
                </>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" disabled={s.busy} onClick={closeAction}>
                  {t("passkeys.cancel")}
                </Button>
                <SubmitButton busy={s.busy} variant={action === "disable" ? "destructive" : "default"}>
                  {astep === 1 ? t("common.continue") : action === "change" ? t("account.change") : t("account.disable")}
                </SubmitButton>
              </DialogFooter>
            </Form>
          </DialogContent>
        </Dialog>
      </AuthLayout>
    );

  return (
    <AuthLayout signedIn title={t("account.enrollTitle")}>
      <Stepper current={step} label={t("account.steps.label")} steps={[t("account.steps.connect"), t("account.steps.verify"), t("account.steps.save")]} />

      {step === 1 && (
        <>
          <h2 className="font-medium">{t("account.connectTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("account.scan")}</p>
          <img className="mx-auto size-56 rounded bg-white p-2" src={status.qr} alt={t("account.qrAlt")} width={224} height={224} />
          {showKey ? (
            <p className="text-center text-sm text-muted-foreground">
              {t("account.typeKey")} <code className="break-all">{status.secret}</code>
            </p>
          ) : (
            <div className="flex justify-center">
              <Button type="button" variant="link" size="sm" onClick={() => setShowKey(true)}>
                {t("account.cantScan")}
              </Button>
            </div>
          )}
          <Button type="button" onClick={() => setStep(2)}>
            {t("account.next")}
          </Button>
          {toPasskeys(t("account.switchToPasskey"))}
          {back}
        </>
      )}

      {step === 2 && (
        <>
          <h2 className="font-medium">{t("account.verifyTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("account.verifyText")}</p>
          <ErrorAlert error={s.error} />
          <Form onSubmit={() => void confirm()}>
            <TextField label={t("account.code")} name="code" inputMode="numeric" autoComplete="one-time-code" required autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
            <SubmitButton busy={s.busy}>{t("account.turnOn")}</SubmitButton>
            <Button type="button" variant="ghost" disabled={s.busy} onClick={() => (setStep(1), s.clear())}>
              {t("common.back")}
            </Button>
          </Form>
        </>
      )}

      {step === 3 && codes && (
        <>
          <h2 className="font-medium">{t("account.saveTitle")}</h2>
          <Alert variant="warning">{t("account.codesText")}</Alert>
          <ul className="grid grid-cols-2 gap-2">
            {codes.list.map((c) => (
              <li key={c}>
                <code className="block break-all rounded bg-muted px-2 py-1 text-sm">{c}</code>
              </li>
            ))}
          </ul>
          <div className="flex justify-start">
            <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
              {copied ? t("account.copied") : t("account.copy")}
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={saved} onCheckedChange={(v) => setSaved(v === true)} />
            {t("account.savedCheck")}
          </label>
          <Button disabled={!saved} onClick={() => go({ redirect: codes.next }, true)}>
            {t("common.continue")}
          </Button>
        </>
      )}
    </AuthLayout>
  );
}
