import { ArrowLeftRight, BookOpen, KeyRound, LayoutDashboard, Settings as SettingsIcon, Shield, SlidersHorizontal, Users as UsersIcon } from "lucide-react";
import type { ComponentType, ReactElement } from "react";
import { ClientForm } from "./pages/ClientForm";
import { Clients } from "./pages/Clients";
import { Dictionary } from "./pages/Dictionary";
import { Exchange } from "./pages/Exchange";
import { ExchangeForm } from "./pages/ExchangeForm";
import { Home } from "./pages/Home";
import { RoleForm } from "./pages/RoleForm";
import { Roles } from "./pages/Roles";
import { Settings } from "./pages/Settings";
import { SystemSettings } from "./pages/SystemSettings";
import { UserForm } from "./pages/UserForm";
import { Users } from "./pages/Users";
import { P } from "@huponx/auth-client";
import type { Permission } from "@huponx/auth-client";

/**
 * A page of the app. This one table drives the sidebar, the breadcrumb and the permission guard, so a page is
 * added in one place. A menu item is shown, and the page served, only with `perm` (the gateway and identity
 * check it again).
 */
export interface AppRoute {
  path: string;
  /** Key of the translation of the title (menu item, breadcrumb). */
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
  /** Permission needed to see the page; none: every signed in user. */
  perm?: Permission;
  /** The home item matches only "/". */
  end?: boolean;
  element: ReactElement;
  /** Stable id for tests. */
  testId: string;
  /** Path of the page this one belongs to: the breadcrumb is Home > parent > this page. */
  parent?: string;
}

/** Menu items, top to bottom. */
export const routes: AppRoute[] = [
  { path: "/", labelKey: "nav.home", icon: LayoutDashboard, end: true, element: <Home />, testId: "nav-home" },
  { path: "/users", labelKey: "nav.users", icon: UsersIcon, perm: P.identity.userRead, element: <Users />, testId: "nav-users" },
  { path: "/roles", labelKey: "nav.roles", icon: Shield, perm: P.identity.roleRead, element: <Roles />, testId: "nav-roles" },
  { path: "/clients", labelKey: "nav.clients", icon: KeyRound, perm: P.identity.clientRead, element: <Clients />, testId: "nav-clients" },
  {
    path: "/exchange",
    labelKey: "nav.exchange",
    icon: ArrowLeftRight,
    perm: P.identity.exchangeRead,
    element: <Exchange />,
    testId: "nav-exchange",
  },
  {
    path: "/dictionary",
    labelKey: "nav.dictionary",
    icon: BookOpen,
    perm: P.dictionary.settingsRead,
    element: <Dictionary />,
    testId: "nav-dictionary",
  },
  {
    path: "/system",
    labelKey: "nav.system",
    icon: SlidersHorizontal,
    perm: P.identity.settingsWrite,
    element: <SystemSettings />,
    testId: "nav-system",
  },
];

/** Pages that are not in the menu (reached from another page). Their parent is highlighted in the menu. */
export const subRoutes: AppRoute[] = [
  {
    path: "/users/new",
    labelKey: "nav.userNew",
    icon: UsersIcon,
    perm: P.identity.userWrite,
    element: <UserForm />,
    testId: "nav-user-new",
    parent: "/users",
  },
  {
    path: "/users/:id",
    labelKey: "nav.userEdit",
    icon: UsersIcon,
    perm: P.identity.userRead,
    element: <UserForm />,
    testId: "nav-user-edit",
    parent: "/users",
  },
  {
    path: "/roles/new",
    labelKey: "nav.roleNew",
    icon: Shield,
    perm: P.identity.roleWrite,
    element: <RoleForm />,
    testId: "nav-role-new",
    parent: "/roles",
  },
  {
    path: "/roles/:name",
    labelKey: "nav.roleEdit",
    icon: Shield,
    perm: P.identity.roleRead,
    element: <RoleForm />,
    testId: "nav-role-edit",
    parent: "/roles",
  },
  {
    path: "/clients/new",
    labelKey: "nav.clientNew",
    icon: KeyRound,
    perm: P.identity.clientWrite,
    element: <ClientForm />,
    testId: "nav-client-new",
    parent: "/clients",
  },
  {
    path: "/clients/:id",
    labelKey: "nav.clientEdit",
    icon: KeyRound,
    perm: P.identity.clientRead,
    element: <ClientForm />,
    testId: "nav-client-edit",
    parent: "/clients",
  },
  {
    path: "/exchange/new",
    labelKey: "nav.exchangeNew",
    icon: ArrowLeftRight,
    perm: P.identity.exchangeWrite,
    element: <ExchangeForm />,
    testId: "nav-exchange-new",
    parent: "/exchange",
  },
  {
    path: "/exchange/edit",
    labelKey: "nav.exchangeEdit",
    icon: ArrowLeftRight,
    perm: P.identity.exchangeRead,
    element: <ExchangeForm />,
    testId: "nav-exchange-edit",
    parent: "/exchange",
  },
];

/** Pinned to the bottom of the sidebar. */
export const settingsRoute: AppRoute = {
  path: "/settings",
  labelKey: "nav.settings",
  icon: SettingsIcon,
  element: <Settings />,
  testId: "nav-settings",
};

export const allRoutes: AppRoute[] = [...routes, ...subRoutes, settingsRoute];
