import { cn } from "../lib/cn";
import { initials } from "../shell/UserMenu";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

/** The picture of a user (a URL or data URI), or the first letter of the name (of the email without a name). */
export function UserAvatar({ name, email, src, className }: { name?: string; email: string; src?: string; className?: string }) {
  return (
    <Avatar className={cn("size-8", className)}>
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback>{initials(name || email)}</AvatarFallback>
    </Avatar>
  );
}
