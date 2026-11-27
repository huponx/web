import { Button, cn, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DoneAlert, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, ErrorAlert, iconTone, passkeysSupported, rememberPasskey, TextField } from "@huponx/ui-kit";
import { KeyRound, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, authApi } from "../api";
import type { Passkey } from "../api";
import { makePasskey } from "./passkey";
import { Form, SubmitButton, useSubmit } from "./common";

/**
 * What the dialog is for. Adding and deleting have two steps: what is about to happen first, and the password only
 * after the user went on with it. Renaming has one.
 */
type Dialogue = { kind: "add" } | { kind: "rename"; passkey: Passkey } | { kind: "delete"; passkey: Passkey };

/**
 * The passkeys of the signed in user: the list (each row has a menu), and a dialog for add, rename and delete. Not
 * shown when the server has passkeys turned off. `bare`: no heading and no rule, the page that holds it has them.
 * `onAdded` is called after a passkey was added, with the address the server says to go on to (`returnTo` checked).
 */
export function Passkeys({ bare, returnTo = "", onAdded }: { bare?: boolean; returnTo?: string; onAdded?: (redirect: string | undefined) => void }) {
  const { t, i18n } = useTranslation();
  const [list, setList] = useState<{ passkeys: Passkey[]; max: number }>();
  const [off, setOff] = useState(false);
  const [dialogue, setDialogue] = useState<Dialogue>();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<{ text: string; n: number }>();
  const say = (text: string) => setNotice((p) => ({ text, n: (p?.n ?? 0) + 1 }));
  const s = useSubmit();

  const load = useCallback(() => {
    authApi.passkeys().then(setList, (err) => {
      // off on the server (404) or no session (the page redirects on its own): nothing to show
      if (err instanceof ApiError && (err.status === 404 || err.status === 401)) setOff(true);
    });
  }, []);
  useEffect(load, [load]);

  if (off || !list) return null;
  const supported = passkeysSupported();
  const full = list.passkeys.length >= list.max;
  const date = (iso: string) => new Date(iso).toLocaleDateString(i18n.resolvedLanguage);

  function open(d: Dialogue) {
    setDialogue(d);
    setStep(1);
    setName(d.kind === "rename" ? d.passkey.name : "");
    setPassword("");
    setNotice(undefined);
    s.clear();
  }

  function close() {
    setDialogue(undefined);
    setName("");
    setPassword("");
    s.clear();
  }

  async function add() {
    const added = await s.run(async () => {
      const begin = await authApi.beginPasskey(password);
      const credential = await makePasskey(begin.options);
      if (!credential) return undefined; // the prompt was dismissed
      return authApi.finishPasskey(begin.c, credential, name.trim() || t("passkeys.defaultName"), returnTo);
    });
    if (added) {
      rememberPasskey();
      say(t("passkeys.added"));
      close();
      load();
      onAdded?.(added.redirect);
    }
  }

  async function rename(p: Passkey) {
    if (await s.run(() => authApi.renamePasskey(p.id, name).then(() => true))) {
      close();
      load();
    }
  }

  async function remove(p: Passkey) {
    if (await s.run(() => authApi.deletePasskey(p.id, password).then(() => true))) {
      say(t("passkeys.removed"));
      close();
      load();
    }
  }

  function submit() {
    if (!dialogue) return;
    if (dialogue.kind === "rename") return void rename(dialogue.passkey);
    if (step === 1) {
      setStep(2);
      s.clear();
      return;
    }
    void (dialogue.kind === "add" ? add() : remove(dialogue.passkey));
  }

  const title = !dialogue ? "" : dialogue.kind === "add" ? t("passkeys.addTitle") : dialogue.kind === "rename" ? t("passkeys.renameTitle") : t("passkeys.deleteTitle");
  const description = !dialogue
    ? ""
    : dialogue.kind === "add"
      ? step === 1
        ? t("passkeys.addText")
        : t("passkeys.addPasswordText")
      : dialogue.kind === "delete"
        ? step === 1
          ? t("passkeys.deleteConfirm", { name: dialogue.passkey.name })
          : t("passkeys.deleteText", { name: dialogue.passkey.name })
        : "";
  const submitLabel =
    dialogue?.kind === "rename"
      ? t("passkeys.save")
      : step === 1
        ? dialogue?.kind === "delete"
          ? t("passkeys.delete")
          : t("common.continue")
        : dialogue?.kind === "delete"
          ? t("passkeys.delete")
          : t("passkeys.create");

  return (
    <section className={bare ? "flex flex-col gap-3" : "flex flex-col gap-3 border-t pt-4"} data-testid="passkeys">
      {bare ? null : (
        <>
          <h2 className="text-base font-semibold">{t("passkeys.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("passkeys.intro")}</p>
        </>
      )}
      {dialogue ? null : <ErrorAlert error={s.error} />}
      <DoneAlert watch={notice?.n}>{notice?.text}</DoneAlert>
      {list.passkeys.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("passkeys.none")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.passkeys.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-md border p-3" data-testid="passkey-row">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <KeyRound className={cn("size-4", iconTone.tags)} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">
                  {p.synced ? t("passkeys.synced") : t("passkeys.deviceBound")} · {p.lastUsedAt ? t("passkeys.lastUsed", { date: date(p.lastUsedAt) }) : t("passkeys.neverUsed")}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t("passkeys.actions", { name: p.name })}>
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => open({ kind: "rename", passkey: p })}>
                    <Pencil aria-hidden="true" className={iconTone.edit} />
                    {t("passkeys.rename")}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => open({ kind: "delete", passkey: p })}>
                    <Trash2 aria-hidden="true" />
                    {t("passkeys.delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}
      {!supported ? (
        <p className="text-sm text-muted-foreground">{t("passkeys.unsupported")}</p>
      ) : full ? (
        <p className="text-sm text-muted-foreground">{t("passkeys.limit", { max: list.max })}</p>
      ) : (
        <Button type="button" variant="outline" onClick={() => open({ kind: "add" })}>
          <KeyRound aria-hidden="true" />
          {t("passkeys.add")}
        </Button>
      )}

      <Dialog open={dialogue !== undefined} onOpenChange={(o) => !o && close()}>
        <DialogContent closeLabel={t("common.close")}>
          <Form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              {description ? <DialogDescription>{description}</DialogDescription> : null}
            </DialogHeader>
            <ErrorAlert error={s.error} />
            {dialogue && (dialogue.kind === "rename" || (dialogue.kind === "add" && step === 1)) ? (
              <TextField
                label={t("passkeys.name")}
                name="passkey-name"
                maxLength={60}
                required={dialogue.kind === "rename"}
                placeholder={dialogue.kind === "add" ? t("passkeys.namePlaceholder") : undefined}
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            ) : null}
            {dialogue && dialogue.kind !== "rename" && step === 2 ? (
              <TextField label={t("passkeys.password")} type="password" name="passkey-password" autoComplete="current-password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={s.busy} onClick={close}>
                {t("passkeys.cancel")}
              </Button>
              <SubmitButton busy={s.busy} variant={dialogue?.kind === "delete" ? "destructive" : "default"}>
                {submitLabel}
              </SubmitButton>
            </DialogFooter>
          </Form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
