import { ApiError } from "@huponx/auth-client";
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, ErrorAlert, iconTone, Stepper, TextField, useAction } from "@huponx/ui-kit";
import { MoreHorizontal, RefreshCw, ShieldCheck, ShieldOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useIdentity } from "../api";
import type { MyMfa } from "../api";

type Step = 1 | 2 | 3;

/** Leaving MFA or replacing the authenticator: a dialog of two steps, the password and a code only after the user went on. */
type Action = "disable" | "change";

/**
 * Multi-factor authentication of the user, on the portal. Turning it on is a wizard in a dialog: connect the
 * authenticator (QR code), verify it with the first code, save the recovery codes (shown once, so that step cannot be
 * left by accident). Otherwise: the status, and turning it off with the password and a code. The steps and the limits
 * are the ones of the sign in pages; identity does the work.
 */
export function Mfa() {
  const { t } = useTranslation();
  const api = useIdentity();
  const a = useAction();
  const [status, setStatus] = useState<MyMfa>();
  const [loadError, setLoadError] = useState<unknown>();
  // the QR code and the key, once the user asked to set MFA up; step is the step of the wizard while it is open
  const [setup, setSetup] = useState<{ qr?: string; secret?: string }>();
  const [step, setStep] = useState<Step>(1);
  const [off, setOff] = useState(false);
  const [codes, setCodes] = useState<string[]>();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [action, setAction] = useState<Action>();
  const [astep, setAstep] = useState<1 | 2>(1);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");

  const load = useCallback(() => {
    api.getMyMfa().then(
      (s) => {
        setLoadError(undefined);
        setStatus(s);
      },
      (err: unknown) => {
        // MFA turned off on the server: there is nothing to manage, so the card is not shown
        if (err instanceof ApiError && err.reason === "mfa_disabled_on_server") setOff(true);
        else setLoadError(err);
      },
    );
  }, [api]);
  useEffect(load, [load]);

  async function begin() {
    const r = await a.run(() => api.beginMyMfa());
    if (r) {
      setSetup(r);
      setStep(1);
    }
  }

  async function confirm(ev: FormEvent) {
    ev.preventDefault();
    const r = await a.run(() => api.confirmMyMfa(code.trim()));
    if (r) {
      setCodes(r.recoveryCodes ?? []);
      setStep(3);
      setCode("");
    }
  }

  /** Gives up the pending setup: back to "Set up" (a new try starts a new enrollment). */
  function cancel() {
    setSetup(undefined);
    setCode("");
    setStep(1);
    setShowKey(false);
    a.clear();
  }

  function openAction(k: Action) {
    setAction(k);
    setAstep(1);
    setPassword("");
    setCode("");
    a.clear();
  }

  function closeAction() {
    setAction(undefined);
    setPassword("");
    setCode("");
    a.clear();
  }

  /** The second step of the dialog: re-authenticate, turn MFA off, and for a change go on with the setup of the new one. */
  async function submitAction(ev: FormEvent) {
    ev.preventDefault();
    if (astep === 1) {
      setAstep(2);
      a.clear();
      return;
    }
    const next = await a.run(async () => {
      await api.disableMyMfa(password, code.trim());
      return action === "change" ? await api.beginMyMfa() : null;
    });
    if (next === undefined) return; // refused: the error is in the dialog, nothing changed
    closeAction();
    setStatus(undefined);
    load();
    if (next) {
      setSetup(next);
      setStep(1);
    }
  }

  function done() {
    setCodes(undefined);
    setSetup(undefined);
    setSaved(false);
    setCopied(false);
    setShowKey(false);
    setStep(1);
    setStatus(undefined);
    load();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText((codes ?? []).join("\n"));
      setCopied(true);
    } catch {
      // no clipboard (insecure context): the codes are on screen to copy by hand
    }
  }

  if (off) return null;

  const wizard = setup !== undefined || codes !== undefined;
  let body;
  if (loadError) {
    body = <ErrorAlert error={loadError} />;
  } else if (status?.enabled && !codes) {
    body = status.forced ? (
      <Alert>{t("security.mfa.forced")}</Alert>
    ) : (
      <div className="flex items-center gap-3 rounded-md border p-3" data-testid="mfa-row">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ShieldCheck className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{t("security.mfa.authenticator")}</div>
          <div className="text-xs text-muted-foreground">{t("security.mfa.codesLeft", { count: status.recoveryCodesLeft ?? 0 })}</div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={t("security.mfa.actions")}>
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => openAction("change")}>
              <RefreshCw aria-hidden="true" className={iconTone.refresh} />
              {t("security.mfa.change")}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => openAction("disable")}>
              <ShieldOff aria-hidden="true" />
              {t("security.mfa.disable")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  } else if (status && !wizard) {
    body = (
      <div className="flex flex-col gap-4">
        <ErrorAlert error={a.error} />
        <div className="flex justify-end">
          <Button onClick={() => void begin()} busy={a.busy}>
            {t("security.mfa.setUp")}
          </Button>
        </div>
      </div>
    );
  } else {
    body = null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("security.mfa.title")}</CardTitle>
        <CardDescription>{status?.enabled ? t("security.mfa.onShort") : t("security.mfa.description")}</CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>

      <Dialog open={action !== undefined} onOpenChange={(o) => !o && closeAction()}>
        <DialogContent closeLabel={t("common.close")}>
          <form className="flex flex-col gap-4" onSubmit={(ev) => void submitAction(ev)}>
            <DialogHeader>
              <DialogTitle>{action === "change" ? t("security.mfa.changeTitle") : t("security.mfa.disableTitle")}</DialogTitle>
              <DialogDescription>
                {astep === 1
                  ? action === "change"
                    ? t("security.mfa.changeConfirm")
                    : t("security.mfa.disableConfirm")
                  : t("security.mfa.reauth")}
              </DialogDescription>
            </DialogHeader>
            <ErrorAlert error={a.error} />
            {astep === 2 ? (
              <>
                <TextField label={t("security.mfa.password")} type="password" name="mfa-password" autoComplete="current-password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
                <TextField label={t("security.mfa.codeOrRecovery")} name="mfa-code" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
              </>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={a.busy} onClick={closeAction}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" variant={action === "disable" ? "destructive" : "default"} busy={a.busy}>
                {astep === 1 ? t("security.mfa.continue") : action === "change" ? t("security.mfa.change") : t("security.mfa.disable")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={wizard} onOpenChange={(o) => !o && step !== 3 && cancel()}>
        <DialogContent
          closeLabel={t("common.close")}
          hideClose={step === 3}
          onEscapeKeyDown={(e) => step === 3 && e.preventDefault()}
          onInteractOutside={(e) => step === 3 && e.preventDefault()}
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>{t("security.mfa.wizardTitle")}</DialogTitle>
            <DialogDescription className="sr-only">{t("security.mfa.description")}</DialogDescription>
          </DialogHeader>
          <Stepper current={step} label={t("security.mfa.steps.label")} steps={[t("security.mfa.steps.connect"), t("security.mfa.steps.verify"), t("security.mfa.steps.save")]} />

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <h3 className="font-medium">{t("security.mfa.connectTitle")}</h3>
              <p className="text-sm text-muted-foreground">{t("security.mfa.scan")}</p>
              <img className="mx-auto size-56 rounded bg-white p-2" src={setup?.qr} alt={t("security.mfa.qrAlt")} width={224} height={224} />
              {showKey ? (
                <p className="text-center text-sm text-muted-foreground">
                  {t("security.mfa.typeKey")} <code className="break-all">{setup?.secret}</code>
                </p>
              ) : (
                <div className="flex justify-center">
                  <Button type="button" variant="link" size="sm" onClick={() => setShowKey(true)}>
                    {t("security.mfa.cantScan")}
                  </Button>
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={cancel}>
                  {t("common.cancel")}
                </Button>
                <Button type="button" onClick={() => setStep(2)}>
                  {t("security.mfa.next")}
                </Button>
              </DialogFooter>
            </div>
          )}

          {step === 2 && (
            <form className="flex flex-col gap-4" onSubmit={(ev) => void confirm(ev)}>
              <h3 className="font-medium">{t("security.mfa.verifyTitle")}</h3>
              <p className="text-sm text-muted-foreground">{t("security.mfa.verifyText")}</p>
              <TextField label={t("security.mfa.code")} name="mfa-code" inputMode="numeric" autoComplete="one-time-code" required autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
              <ErrorAlert error={a.error} />
              <DialogFooter>
                <Button type="button" variant="outline" disabled={a.busy} onClick={() => (setStep(1), a.clear())}>
                  {t("security.mfa.back")}
                </Button>
                <Button type="submit" busy={a.busy}>
                  {t("security.mfa.turnOn")}
                </Button>
              </DialogFooter>
            </form>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <h3 className="font-medium">{t("security.mfa.saveTitle")}</h3>
              <Alert variant="warning">{t("security.mfa.codesText")}</Alert>
              <ul className="grid grid-cols-2 gap-2">
                {(codes ?? []).map((c) => (
                  <li key={c}>
                    <code className="block break-all rounded bg-muted px-2 py-1 text-sm">{c}</code>
                  </li>
                ))}
              </ul>
              <div className="flex justify-start">
                <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
                  {copied ? t("security.mfa.copied") : t("security.mfa.copy")}
                </Button>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={saved} onCheckedChange={(v) => setSaved(v === true)} />
                {t("security.mfa.savedCheck")}
              </label>
              <DialogFooter>
                <Button type="button" disabled={!saved} onClick={done}>
                  {t("security.mfa.codesDone")}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
