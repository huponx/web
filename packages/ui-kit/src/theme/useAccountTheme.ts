import { useEffect, useRef } from "react";
import { useTheme } from "./ThemeProvider";
import type { Theme } from "./ThemeProvider";

const isTheme = (v: unknown): v is Theme => v === "light" || v === "dark" || v === "system";

/**
 * Keeps the theme the same in every app: the browser stores the choice per origin (each app has its own), so
 * the theme of the account is the shared one.
 *
 * `account` is the theme the account holds, as read from the profile: `undefined` while it is not read, `""` when
 * the user never chose. The first value read is applied (unless empty: then this browser's choice stays); after that
 * every change of the switch is passed to `save` (best effort: the browser keeps the choice anyway).
 */
export function useAccountTheme(account: string | undefined, save: (theme: Theme) => Promise<unknown>) {
  const { theme, setTheme } = useTheme();
  // the theme the account holds as far as we know (undefined until it was read)
  const known = useRef<string>();
  // set while an applied account theme has not reached `theme` yet, so it is not saved back
  const applying = useRef<string>();
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (account === undefined || known.current !== undefined) return;
    known.current = account;
    if (isTheme(account) && account !== theme) {
      applying.current = account; // cleared when `theme` reaches it
      setTheme(account);
    }
    // only when the account's theme is first read
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, setTheme]);

  useEffect(() => {
    if (applying.current !== undefined) {
      if (theme === applying.current) applying.current = undefined;
      return;
    }
    if (known.current === undefined || known.current === theme) return;
    known.current = theme;
    saveRef.current(theme).catch(() => undefined);
  }, [theme]);
}
