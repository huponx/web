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
  useTheme,
} from "@huponx/ui-kit";
import { Languages, LogOut, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useIdentity } from "./api";
import { AVATAR_CHANGED } from "./lib/avatarEvents";
import { LANGUAGE_STORAGE_KEY, languages } from "./i18n";
import type { LanguageCode } from "./i18n";

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
      rememberChoice();
      api.updateMe({ locale: code }).catch(() => undefined); // the choice is kept in the browser anyway
    },
  };
}

// The language detector stores the language it detected too, so "lang" alone does not say the user chose it.
const CHOSEN_KEY = `${LANGUAGE_STORAGE_KEY}-chosen`;

function rememberChoice(): void {
  try {
    window.localStorage.setItem(CHOSEN_KEY, "1");
  } catch {
    // the choice still applies to this page
  }
}

/** True when the user picked a language in this browser (the language of the account must not override it). */
function hasBrowserChoice(): boolean {
  try {
    return !!window.localStorage.getItem(CHOSEN_KEY);
  } catch {
    return false;
  }
}

/**
 * The profile of the signed in user (picture and name), read with GetMe: it needs no permission. It is read
 * again when the profile or the Edit page saves a picture. The first time, the language of the account
 * becomes the language of the UI, unless this browser already has a choice.
 */
function useMyProfile(): { picture?: string; name?: string } {
  const { user } = useAuth();
  const api = useIdentity();
  const { i18n } = useTranslation();
  const [profile, setProfile] = useState<{ picture?: string; name?: string }>({});
  const { theme, setTheme } = useTheme();
  // the theme the account holds (undefined until it was read): the first read applies it, a later change of the switch is saved
  const accountTheme = useRef<string>();
  const sub = user?.sub;
  useEffect(() => {
    if (!sub) {
      setProfile({});
      return;
    }
    let live = true;
    let first = true;
    const load = () =>
      api.getMe().then(
        (u) => {
          if (!live || !u) return;
          setProfile({ picture: u.avatar || undefined, name: u.name || undefined });
          const locale = u.locale?.split("-")[0];
          if (first && locale && languages.some((l) => l.code === locale) && locale !== i18n.resolvedLanguage && !hasBrowserChoice()) {
            void i18n.changeLanguage(locale);
          }
          if (first && (u.theme === "light" || u.theme === "dark" || u.theme === "system")) {
            accountTheme.current = u.theme;
            setTheme(u.theme); // the theme of the account, the same in every app
          } else if (first) accountTheme.current = u.theme || ""; // nothing chosen yet: keep what this browser has
          first = false;
        },
        () => undefined, // the letter and the name of the token are enough when the call fails
      );
    void load();
    window.addEventListener(AVATAR_CHANGED, load);
    return () => {
      live = false;
      window.removeEventListener(AVATAR_CHANGED, load);
    };
  }, [api, sub, i18n, setTheme]);

  useEffect(() => {
    if (accountTheme.current === undefined || accountTheme.current === theme) return;
    accountTheme.current = theme;
    api.updateMe({ theme }).catch(() => undefined); // best effort: the browser keeps the choice anyway
  }, [theme, api]);
  return profile;
}

/** Name and avatar of the user; the menu has Settings, language and Sign out. */
export function AccountMenu() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const profile = useMyProfile();
  const { language, setLanguage } = useLanguage();
  return (
    <UserMenu name={profile.name || user?.name || user?.email || user?.sub || ""} image={profile.picture} label={t("shell.userMenu")}>
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
