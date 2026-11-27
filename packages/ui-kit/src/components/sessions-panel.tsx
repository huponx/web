import { Monitor, MoreHorizontal, Smartphone, Tablet } from "lucide-react";
import { useState } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { useConfirm } from "./confirm-dialog";
import type { ConfirmLabels } from "./confirm-dialog";

/** A session as the API answers it (protobuf JSON: int64 as a string of Unix seconds, empty and false fields left out). */
export interface SessionItem {
  id: string;
  ip?: string;
  browser?: string;
  browserVersion?: string;
  os?: string;
  /** desktop, mobile, tablet or unknown. */
  device?: string;
  /** pwd, otp, swk, hwk, mfa */
  amr?: string[];
  createdAt?: string;
  lastSeenAt?: string;
  current?: boolean;
}

/** The texts of the panel; the kit has no i18n, the app passes them translated. */
export interface SessionsPanelLabels {
  none: string;
  thisDevice: string;
  unknownDevice: string;
  /** "Chrome on macOS" */
  browserOnOs: (browser: string, os: string) => string;
  /** "last active 5 minutes ago" */
  lastActive: (when: string) => string;
  /** "signed in 3 Mar 2026" */
  signedIn: (date: string) => string;
  /** How the user signed in. */
  password: string;
  otp: string;
  passkey: string;
  /** Accessible name of the ⋯ button of a row. */
  actions: (device: string) => string;
  revoke: string;
  revokeOthers: string;
  /** The question before ending one session; the current one signs the user out now. */
  confirmRevoke: (device: string) => string;
  confirmRevokeCurrent: (device: string) => string;
  confirmRevokeOthers: string;
  /** Buttons and title of the confirmation dialog (`confirm` is the label of the button that goes on). */
  confirm: ConfirmLabels;
}

export interface SessionsPanelProps {
  sessions: SessionItem[];
  /** The language of the relative times and dates. */
  language: string;
  labels: SessionsPanelLabels;
  /** Ends one session, after the user confirmed. Without it the rows have no menu. */
  onRevoke?: (s: SessionItem) => void | Promise<void>;
  /** Ends every session but the current one, after the user confirmed. Without it there is no button. */
  onRevokeOthers?: () => void | Promise<void>;
  /** The current time in ms (tests). */
  now?: number;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

/** "5 minutes ago", "now", "yesterday" in the language. */
export function relativeTime(seconds: number, nowMs: number, language: string): string {
  const diff = Math.min(0, seconds - Math.floor(nowMs / 1000));
  const rtf = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (-diff >= size) return rtf.format(Math.round(diff / size), unit);
  }
  return rtf.format(0, "second");
}

function DeviceIcon({ device }: { device?: string }) {
  const Icon = device === "mobile" ? Smartphone : device === "tablet" ? Tablet : Monitor;
  return <Icon className="size-4" aria-hidden="true" />;
}

/**
 * The list of the sessions of a user (one per sign in on a browser or device) with the actions to end them. Used by
 * the portal and the admin on the own sessions, and read-only (no `onRevoke`, no `onRevokeOthers`) by the admin on the
 * sessions of another user. Ending a session goes through a confirmation.
 */
export function SessionsPanel({ sessions, language, labels, onRevoke, onRevokeOthers, now }: SessionsPanelProps) {
  const { confirm, dialog } = useConfirm(labels.confirm);
  const [busy, setBusy] = useState(false);
  const nowMs = now ?? Date.now();
  const date = (seconds: string) => new Date(Number(seconds) * 1000).toLocaleDateString(language);
  const others = sessions.some((s) => !s.current);

  const name = (s: SessionItem) => (s.browser ? (s.os ? labels.browserOnOs(s.browser, s.os) : s.browser) : labels.unknownDevice);
  const method = (s: SessionItem) => {
    const amr = s.amr ?? [];
    const first = amr.includes("swk") || amr.includes("hwk") ? labels.passkey : amr.includes("pwd") ? labels.password : "";
    return [first, amr.includes("otp") ? labels.otp : ""].filter(Boolean).join(" + ");
  };

  async function run(ok: boolean, f: () => void | Promise<void>) {
    if (!ok) return;
    setBusy(true);
    try {
      await f();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="sessions">
      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.none}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((s) => {
            const details = [
              s.ip,
              s.lastSeenAt ? labels.lastActive(relativeTime(Number(s.lastSeenAt), nowMs, language)) : "",
              s.createdAt ? labels.signedIn(date(s.createdAt)) : "",
              method(s),
            ].filter(Boolean);
            return (
              <li key={s.id} className="flex items-center gap-3 rounded-md border p-3" data-testid="session-row">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <DeviceIcon device={s.device} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{name(s)}</span>
                    {s.current ? <Badge variant="success">{labels.thisDevice}</Badge> : null}
                  </div>
                  <div className="text-xs text-muted-foreground">{details.join(" · ")}</div>
                </div>
                {onRevoke ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon-sm" disabled={busy} aria-label={labels.actions(name(s))}>
                        <MoreHorizontal aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() =>
                          void confirm({ message: s.current ? labels.confirmRevokeCurrent(name(s)) : labels.confirmRevoke(name(s)), confirmLabel: labels.revoke }).then((ok) =>
                            run(ok, () => onRevoke(s)),
                          )
                        }
                      >
                        {labels.revoke}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {onRevokeOthers && others ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            busy={busy}
            onClick={() => void confirm({ message: labels.confirmRevokeOthers, confirmLabel: labels.revokeOthers }).then((ok) => run(ok, onRevokeOthers))}
          >
            {labels.revokeOthers}
          </Button>
        </div>
      ) : null}
      {dialog}
    </div>
  );
}
