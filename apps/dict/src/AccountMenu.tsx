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
} from "@huponx/ui-kit";
import { Languages, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { languages } from "./i18n";

/** Name of the user; the menu has the language and Sign out. */
export function AccountMenu() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  return (
    <UserMenu name={user?.name || user?.email || user?.sub || ""} label={t("shell.userMenu")}>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Languages aria-hidden="true" />
          {t("shell.language")}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup value={i18n.resolvedLanguage ?? "en"} onValueChange={(code) => void i18n.changeLanguage(code)}>
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
