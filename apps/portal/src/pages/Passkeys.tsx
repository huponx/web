import { ApiError } from "@huponx/auth-client";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, cn, createPasskey, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DoneAlert, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, ErrorAlert, iconTone, passkeyFailure, passkeysSupported, rememberPasskey, TextField, useAction } from "@huponx/ui-kit";
import { KeyRound, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useIdentity } from "../api";
import type { MyPasskey } from "../api";

/**
 * What the dialog is for. Adding and deleting have two steps: what is about to happen first, and the password only
 * after the user went on with it. Renaming has one.
 */
type Dialogue = { kind: "add" } | { kind: "rename"; passkey: MyPasskey } | { kind: "delete"; passkey: MyPasskey };

/**
 * The passkeys of the user, on the Security page: the list (each row has a menu), and a dialog for add, rename and
 * delete. The ceremony runs here, in the browser of the portal; identity checks it through the gateway. The card is not
 * shown when the server has passkeys turned off.
 */
export function Passkeys() {
  const { t, i18n } = useTranslation();
  const api = useIdentity();
  const a = useAction();
  const [list, setList] = useState<{ passkeys: MyPasskey[]; max: number }>();
  const [off, setOff] = useState(false);
  const [dialogue, setDialogue] = useState<Dialogue>();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  // the result of an add or a delete; useAction shows its message also when the prompt was dismissed, so it is kept here
  const [notice, setNotice] = useState<{ text: string; n: number }>();
  const say = (text: string) => setNotice((p) => ({ text, n: (p?.n ?? 0) + 1 }));

  const load = useCallback(() => {
    api.listMyPasskeys().then(
      (r) => setList({ passkeys: r.passkeys ?? [], max: r.max ?? 20 }),
      (err: unknown) => {
        if (err instanceof ApiError && err.reason === "passkeys_off") setOff(true);
      },
    );
  }, [api]);
  useEffect(load, [load]);

  if (off || !list) return null;
  const supported = passkeysSupported();
  const full = list.passkeys.length >= list.max;
  const date = (seconds: string) => new Date(Number(seconds) * 1000).toLocaleDateString(i18n.resolvedLanguage);

  function open(d: Dialogue) {
    setDialogue(d);
    setStep(1);
    setName(d.kind === "rename" ? d.passkey.name : "");
    setPassword("");
    setNotice(undefined);
    a.clear();
  }

  function close() {
    setDialogue(undefined);
    setName("");
    setPassword("");
    a.clear();
  }

  async function add() {
    const added = await a.run(async () => {
      const begin = await api.beginMyPasskey(password);
      let credential;
      try {
        credential = await createPasskey(JSON.parse(begin.optionsJson ?? "{}") as Record<string, unknown>);
      } catch (err) {
        if (passkeyFailure(err) === "cancelled") return undefined; // the user dismissed the prompt
        throw new ApiError(0, "error", "The passkey could not be created.", "passkey_failed");
      }
      return api.finishMyPasskey(begin.ceremonyId ?? "", credential, name.trim() || t("security.passkeys.defaultName"));
    });
    if (added) {
      rememberPasskey();
      say(t("security.passkeys.added"));
      close();
      load();
    }
  }

  async function rename(p: MyPasskey) {
    if (await a.run(() => api.renameMyPasskey(p.id, name.trim()).then(() => true))) {
      close();
      load();
    }
  }

  async function remove(p: MyPasskey) {
    if (await a.run(() => api.deleteMyPasskey(p.id, password).then(() => true))) {
      say(t("security.passkeys.removed"));
      close();
      load();
    }
  }

  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!dialogue) return;
    if (dialogue.kind === "rename") return void rename(dialogue.passkey);
    if (step === 1) {
      setStep(2);
      a.clear();
      return;
    }
    void (dialogue.kind === "add" ? add() : remove(dialogue.passkey));
  }

  const title = !dialogue
    ? ""
    : dialogue.kind === "add"
      ? t("security.passkeys.addTitle")
      : dialogue.kind === "rename"
        ? t("security.passkeys.renameTitle")
        : t("security.passkeys.deleteTitle");
  const description = !dialogue
    ? ""
    : dialogue.kind === "add"
      ? step === 1
        ? t("security.passkeys.addText")
        : t("security.passkeys.addPasswordText")
      : dialogue.kind === "delete"
        ? step === 1
          ? t("security.passkeys.deleteConfirm", { name: dialogue.passkey.name })
          : t("security.passkeys.deleteText", { name: dialogue.passkey.name })
        : "";

  return (
    <Card data-testid="passkeys">
      <CardHeader>
        <CardTitle>{t("security.passkeys.title")}</CardTitle>
        <CardDescription>{t("security.passkeys.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {dialogue ? null : <ErrorAlert error={a.error} />}
        <DoneAlert watch={notice?.n}>{notice?.text}</DoneAlert>
        {list.passkeys.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("security.passkeys.none")}</p>
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
                    {p.synced ? t("security.passkeys.synced") : t("security.passkeys.deviceBound")} ·{" "}
                    {p.lastUsedAt ? t("security.passkeys.lastUsed", { date: date(p.lastUsedAt) }) : t("security.passkeys.neverUsed")}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={t("security.passkeys.actions", { name: p.name })}>
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => open({ kind: "rename", passkey: p })}>
                      <Pencil aria-hidden="true" className={iconTone.edit} />
                      {t("security.passkeys.rename")}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => open({ kind: "delete", passkey: p })}>
                      <Trash2 aria-hidden="true" />
                      {t("security.passkeys.delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
        {!supported ? (
          <p className="text-sm text-muted-foreground">{t("security.passkeys.unsupported")}</p>
        ) : full ? (
          <p className="text-sm text-muted-foreground">{t("security.passkeys.limit", { max: list.max })}</p>
        ) : (
          <div className="flex justify-end">
            <Button type="button" onClick={() => open({ kind: "add" })}>
              <KeyRound aria-hidden="true" />
              {t("security.passkeys.add")}
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={dialogue !== undefined} onOpenChange={(o) => !o && close()}>
        <DialogContent closeLabel={t("common.close")}>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              {description ? <DialogDescription>{description}</DialogDescription> : null}
            </DialogHeader>
            <ErrorAlert error={a.error} />
            {dialogue && (dialogue.kind === "rename" || (dialogue.kind === "add" && step === 1)) ? (
              <TextField
                label={t("security.passkeys.name")}
                name="passkey-name"
                maxLength={60}
                required={dialogue.kind === "rename"}
                placeholder={dialogue.kind === "add" ? t("security.passkeys.namePlaceholder") : undefined}
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            ) : null}
            {dialogue && dialogue.kind !== "rename" && step === 2 ? (
              <TextField label={t("security.passkeys.password")} type="password" name="passkey-password" autoComplete="current-password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={a.busy} onClick={close}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" variant={dialogue?.kind === "delete" ? "destructive" : "default"} busy={a.busy}>
                {dialogue?.kind === "rename"
                  ? t("security.passkeys.save")
                  : step === 1
                    ? dialogue?.kind === "delete"
                      ? t("security.passkeys.delete")
                      : t("security.passkeys.continue")
                    : dialogue?.kind === "delete"
                      ? t("security.passkeys.delete")
                      : t("security.passkeys.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
