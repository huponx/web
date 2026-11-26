import { Languages, LayoutGrid, LogOut, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "../components/ui/dropdown-menu";
import { UserMenu } from "./UserMenu";

/**
 * The address of the portal from the runtime configuration (`PORTAL_URL`): https, or http on localhost for a development
 * run. Anything else (missing, malformed, another scheme) is no link.
 */
export function portalHref(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    const local = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
    return u.protocol === "https:" || (local && u.protocol === "http:") ? u.href : undefined;
  } catch {
    return undefined;
  }
}

export interface AccountMenuProps {
  name: string;
  image?: string;
  /** Accessible name of the trigger ("User menu"). */
  label: string;
  /** Back to the portal (another origin, so a plain link); none: no item. */
  portal?: { href: string; label: string };
  /** The link to the settings of the user; none: no item (the user may not see the page). */
  settings?: { to: string; label: string };
  language: { label: string; value: string; options: { value: string; label: string }[]; onChange: (code: string) => void };
  signOut: { label: string; onSelect: () => void };
}

/**
 * The menu of the signed in user, the same in every app: Settings, language and Sign out. Where the name, the
 * picture, the language and the theme come from (the account) is the business of the app.
 */
export function AccountMenu({ name, image, label, portal, settings, language, signOut }: AccountMenuProps) {
  return (
    <UserMenu name={name} image={image} label={label}>
      {portal ? (
        <DropdownMenuItem asChild>
          <a href={portal.href} data-testid="portal-link">
            <LayoutGrid aria-hidden="true" />
            {portal.label}
          </a>
        </DropdownMenuItem>
      ) : null}
      {settings ? (
        <DropdownMenuItem asChild>
          <Link to={settings.to}>
            <Settings aria-hidden="true" />
            {settings.label}
          </Link>
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Languages aria-hidden="true" />
          {language.label}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup value={language.value} onValueChange={language.onChange}>
            {language.options.map((l) => (
              <DropdownMenuRadioItem key={l.value} value={l.value}>
                {l.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem data-testid="logout" onSelect={signOut.onSelect}>
        <LogOut aria-hidden="true" />
        {signOut.label}
      </DropdownMenuItem>
    </UserMenu>
  );
}
