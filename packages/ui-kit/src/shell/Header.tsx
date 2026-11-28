import { PanelLeft } from "lucide-react";
import { Fragment } from "react";
import type { ReactNode } from "react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "../components/ui/breadcrumb";
import { Button } from "../components/ui/button";
import { ThemeSwitch } from "../theme/ThemeSwitch";
import type { Crumb, ShellLabels, ShellLink } from "./types";

export interface HeaderProps {
  breadcrumbs: Crumb[];
  link: ShellLink;
  labels: ShellLabels;
  onOpenMobileMenu: () => void;
  /** The avatar menu (`UserMenu`). */
  userMenu: ReactNode;
  /** The bell (`NotificationBell`), left of the theme switch; none: no bell. */
  notifications?: ReactNode;
}

/** Breadcrumb on the left; on the right the theme switch, then the avatar menu. */
export function Header({ breadcrumbs, link: Link, labels, onOpenMobileMenu, userMenu, notifications }: HeaderProps) {
  return (
    <header className="ui-glass flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label={labels.openMenu} onClick={onOpenMobileMenu}>
        <PanelLeft aria-hidden="true" />
      </Button>

      <Breadcrumb label={labels.breadcrumb} className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap">
          {breadcrumbs.map((c, i) => (
            <Fragment key={`${i}-${c.label}`}>
              {i > 0 ? <BreadcrumbSeparator /> : null}
              {/* the last level is the page: it keeps its full text (up to the width), the parents shrink first */}
              <BreadcrumbItem className={i === breadcrumbs.length - 1 ? "max-w-full shrink-0" : "min-w-0"}>
                {c.to && i < breadcrumbs.length - 1 ? (
                  <BreadcrumbLink asChild>
                    <Link to={c.to} className="truncate">
                      {c.label}
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="truncate">{c.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex shrink-0 items-center gap-3">
        {notifications}
        <ThemeSwitch labels={labels.theme} />
        {userMenu}
      </div>
    </header>
  );
}
