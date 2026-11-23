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
}
 from "@huponx/ui-kit";
import { Languages, LogOut, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useIdentity } from "./api";
import { AVATAR_CHANGED } from "./lib/avatarEvents";
import { LANGUAGE_STORAGE_KEY, languages } from "./i18n";
import type { LanguageCode } from "./i18n";
import type { AccountProfile } from "@huponx/ui-kit";

const languageCodes = languages.map((l) => l.code);

/** Current language of the UI (the base language of a regional one, e.g. "vi" for "vi-VN"). */
export function useLanguage() {
  const { i18n } = useTranslation();
  const api = useIdentity();
  const language = (i18n.resolvedLanguage ?? "en") as LanguageCode;
  return {
    language,
    /** Changes the UI at once and, best effort, the language of the account (identity_users.locale). */
    setLanguage: (code: string) => {
      void i18n.changeLanguage(code);
      rememberLanguageChoice(LANGUAGE_STORAGE_KEY, code);
      api.updateMe({ locale: code }).catch(() => undefined); // the choice is kept in the browser anyway
    },
  };
}

/**
 * The profile of the signed in user (picture and name), read with GetMe: it needs no permission. It is read
 * again when the profile or the Edit page saves a picture. Language and theme are the ones of the account, so
 * they are the same in every app.
 */
function useMyProfile(): AccountProfile {
  const { user } = useAuth();
  const api = useIdentity();
  const { i18n } = useTranslation();
  const profile = useAccountProfile(
    user?.sub,
    () => api.getMe().then((u) => (u ? { name: u.name, avatar: u.avatar, locale: u.locale, theme: u.theme || "" } : undefined)),
    AVATAR_CHANGED,
  );
  useAccountTheme(profile?.theme, (theme) => api.updateMe({ theme }));
  useAccountLocale(profile?.locale, i18n.resolvedLanguage ?? "en", languageCodes, (code) => void i18n.changeLanguage(code), LANGUAGE_STORAGE_KEY);
  return profile ?? {};
}

/** Name and avatar of the user; the menu has Settings, language and Sign out. */
export function AccountMenu() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const profile = useMyProfile();
  const { language, setLanguage } = useLanguage();
  return (
    <UserMenu name={profile.name || user?.name || user?.email || user?.sub || ""} image={profile.avatar || undefined} label={t("shell.userMenu")}>
      <DropdownMenuItem asChild>
        <Link to="/settings">
          <Settings aria-hidden="true" />
          {t("nav.settings")}
        </Link>
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Languages aria-hidden="true" />
          {t("shell.language")}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup value={language} onValueChange={setLanguage}>
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
