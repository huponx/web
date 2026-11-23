import { useAuth } from "@huponx/auth-client";
import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  UserMenu,
  rememberLanguageChoice,
  useAccountLocale,
  useAccountProfile,
  useAccountTheme,
} from "@huponx/ui-kit";
import type { AccountProfile } from "@huponx/ui-kit";
import { Languages, LogOut, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { LANGUAGE_STORAGE_KEY, languages } from "./i18n";

const languageCodes = languages.map((l) => l.code);

/** Name of the user; the menu has the language and Sign out. */
export function AccountMenu() {
  const { t, i18n } = useTranslation();
  const { user, client, logout, can } = useAuth();
  // name, picture, language and theme are the ones of the account, the same in every app (each app has its own origin)
  const profile = useAccountProfile(user?.sub, () =>
    client.api<{ user?: AccountProfile }>("GET", "/api/me").then((r) => (r.user ? { ...r.user, theme: r.user.theme || "" } : undefined)),
  );
  useAccountTheme(profile?.theme, (theme) => client.api("PUT", "/api/me", { theme }));
  useAccountLocale(profile?.locale, i18n.resolvedLanguage ?? "en", languageCodes, (code) => void i18n.changeLanguage(code), LANGUAGE_STORAGE_KEY);
  const setLanguage = (code: string) => {
    void i18n.changeLanguage(code);
    rememberLanguageChoice(LANGUAGE_STORAGE_KEY, code);
    client.api("PUT", "/api/me", { locale: code }).catch(() => undefined); // best effort: the browser keeps the choice anyway
  };
  return (
    <UserMenu name={profile?.name || user?.name || user?.email || user?.sub || ""} image={profile?.avatar || undefined} label={t("shell.userMenu")}>
      {can("dictionary:word:read") && (
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings aria-hidden="true" />
            {t("nav.settings")}
          </Link>
        </DropdownMenuItem>
      )}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Languages aria-hidden="true" />
          {t("shell.language")}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup value={i18n.resolvedLanguage ?? "en"} onValueChange={setLanguage}>
            {languages.map((l) => (
              <DropdownMenuRadioItem key={l.code} value={l.code}>
                {l.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem data-testid="logout" onSelect={() => void logout()}>
        <LogOut aria-hidden="true" />
        {t("shell.signOut")}
      </DropdownMenuItem>
    </UserMenu>
  );
}
