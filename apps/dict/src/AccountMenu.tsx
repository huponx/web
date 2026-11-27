import { P, useAuth } from "@huponx/auth-client";
import {
  AccountMenuView,
  portalHref,
  rememberLanguageChoice,
  useAccountLocale,
  useAccountProfile,
  useAccountTheme,
} from "@huponx/ui-kit";
import type { AccountProfile } from "@huponx/ui-kit";
import { useTranslation } from "react-i18next";
import { LANGUAGE_STORAGE_KEY, languages } from "./i18n";

/** The link back to the portal; none when PORTAL_URL is not configured. */
function portalLink(label: string) {
  const href = portalHref(window.__env__?.PORTAL_URL);
  return href ? { href, label } : undefined;
}

const languageCodes = languages.map((l) => l.code);

/** Name of the user; the menu has the language and Sign out. */
export function AccountMenu() {
  const { t, i18n } = useTranslation();
  const { user, client, logout, can } = useAuth();
  // name, picture, language and theme are the ones of the account, the same in every app (each app has its own origin)
  const profile = useAccountProfile(user?.sub, () =>
    client
      .api<{ user?: AccountProfile }>("GET", "/api/me")
      .then((r) =>
        r.user ? { ...r.user, theme: r.user.theme || "" } : undefined,
      ),
  );
  useAccountTheme(profile?.theme, (theme) =>
    client.api("PUT", "/api/me", { theme }),
  );
  useAccountLocale(
    profile?.locale,
    i18n.resolvedLanguage ?? "en",
    languageCodes,
    (code) => void i18n.changeLanguage(code),
    LANGUAGE_STORAGE_KEY,
  );
  const setLanguage = (code: string) => {
    void i18n.changeLanguage(code);
    rememberLanguageChoice(LANGUAGE_STORAGE_KEY, code);
    client.api("PUT", "/api/me", { locale: code }).catch(() => undefined); // best effort: the browser keeps the choice anyway
  };
  return (
    <AccountMenuView
      name={profile?.name || user?.name || user?.email || user?.sub || ""}
      image={profile?.avatar || undefined}
      label={t("shell.userMenu")}
      portal={portalLink(t("shell.portal"))}
      settings={
        can(P.dictionary.wordRead)
          ? { to: "/settings", label: t("nav.settings") }
          : undefined
      }
      language={{
        label: t("shell.language"),
        value: i18n.resolvedLanguage ?? "en",
        options: languages.map((l) => ({ value: l.code, label: l.label })),
        onChange: setLanguage,
      }}
      signOut={{ label: t("shell.signOut"), onSelect: () => void logout() }}
    />
  );
}
