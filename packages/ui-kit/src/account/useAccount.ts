import { useEffect, useRef, useState } from "react";

/** What the apps share through the account (identity_users); every field is absent until it is known. */
export interface AccountProfile {
  name?: string;
  /** The picture as a data URI. */
  avatar?: string;
  locale?: string;
  /** light, dark or system; empty until the user chose one. */
  theme?: string;
}

/**
 * The profile of the signed in user, read again when `reloadEvent` fires on the window (e.g. after a new
 * picture). `key` is the user (undefined: signed out, nothing is read). A failed read leaves `undefined`: the
 * token's own claims are enough then. Each app is on its own origin, so this is how they stay in step.
 */
export function useAccountProfile(
  key: string | undefined,
  load: () => Promise<AccountProfile | undefined>,
  reloadEvent?: string,
): AccountProfile | undefined {
  const [profile, setProfile] = useState<AccountProfile>();
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!key) {
      setProfile(undefined);
      return;
    }
    let live = true;
    const read = () =>
      loadRef.current().then(
        (p) => {
          if (live && p) setProfile(p);
        },
        () => undefined,
      );
    void read();
    if (reloadEvent) window.addEventListener(reloadEvent, read);
    return () => {
      live = false;
      if (reloadEvent) window.removeEventListener(reloadEvent, read);
    };
  }, [key, reloadEvent]);
  return profile;
}

const chosenKey = (storageKey: string) => `${storageKey}-chosen`;
const syncedKey = (storageKey: string) => `${storageKey}-account`;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // the choice still applies to this page
  }
}

/** Call when the user picks a language here: this browser has a choice now and the account is up to date with it. */
export function rememberLanguageChoice(storageKey: string, code: string): void {
  write(chosenKey(storageKey), "1");
  write(syncedKey(storageKey), code);
}

/**
 * Applies the language the account holds. The account wins when it changed since this browser last saw it
 * (another app saved a choice) and when this browser never made a choice of its own; otherwise the browser keeps
 * its own (the account's default "en" must not override the language the browser asks for).
 */
export function applyAccountLocale(
  account: string | undefined,
  current: string,
  supported: readonly string[],
  apply: (code: string) => void,
  storageKey: string,
): void {
  const code = account?.split("-")[0];
  if (!code || !supported.includes(code)) return;
  const changed = read(syncedKey(storageKey)) !== code;
  const chosen = !!read(chosenKey(storageKey));
  write(syncedKey(storageKey), code);
  if (code !== current && (changed || !chosen)) apply(code);
}

/** `applyAccountLocale` when the account's language is read or changes. */
export function useAccountLocale(
  account: string | undefined,
  current: string,
  supported: readonly string[],
  apply: (code: string) => void,
  storageKey: string,
): void {
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    applyAccountLocale(account, current, supported, (code) => applyRef.current(code), storageKey);
    // only when the account's language is read or changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);
}
