import type { ComponentType, ReactNode } from "react";

/** Props the shell passes to the link component of the app (React Router's NavLink fits). */
export interface ShellLinkProps {
  to: string;
  end?: boolean;
  className?: string | ((state: { isActive: boolean }) => string);
  children?: ReactNode;
  onClick?: () => void;
  title?: string;
  "aria-label"?: string;
  "data-testid"?: string;
}

export type ShellLink = ComponentType<ShellLinkProps>;

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  /** Match the path exactly (the home item). */
  end?: boolean;
  testId?: string;
}

export interface Crumb {
  label: string;
  /** Without `to` the crumb is the current page. */
  to?: string;
}

export interface ShellLabels {
  /** aria-label of the sidebar navigation. */
  navigation: string;
  collapse: string;
  expand: string;
  openMenu: string;
  closeMenu: string;
  /** aria-label of the button that scrolls the page back to the top (default "Back to top"). */
  backToTop?: string;
  breadcrumb: string;
  theme: { group: string; light: string; dark: string; system: string };
}
