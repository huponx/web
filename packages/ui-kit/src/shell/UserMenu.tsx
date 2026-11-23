import type { ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "../components/ui/dropdown-menu";

/** The letter of the avatar when there is no picture: the first letter of the name ("A" for "Administrator"). */
export function initials(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toLocaleUpperCase() : "?";
}

export interface UserMenuProps {
  /** Name of the user: shown left of the avatar (hidden on narrow screens) and its first letter is the avatar when there is no picture. */
  name: string;
  /** Picture of the user (URL or data URI); the letter shows while there is none or it cannot load. */
  image?: string;
  /** Accessible name of the trigger ("User menu"). */
  label: string;
  /** Menu items (DropdownMenuItem, ...): Settings, language, sign out. */
  children: ReactNode;
}

/** The user's name and avatar; a click opens the menu with the items of the app. */
export function UserMenu({ name, image, label, children }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        data-testid="user-menu"
        className="flex items-center gap-2 rounded-full py-0.5 pl-0.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:pl-3"
      >
        <span className="hidden max-w-48 truncate text-sm font-medium sm:inline" data-testid="user-name">
          {name}
        </span>
        <Avatar>
          {image ? <AvatarImage src={image} alt="" data-testid="user-image" /> : null}
          <AvatarFallback>{initials(name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
