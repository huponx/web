import { ArrowLeftRight, BookOpen, FileText, KeyRound, LayoutDashboard, Megaphone, Send, Webhook as WebhookIcon, Settings as SettingsIcon, Shield, SlidersHorizontal, Users as UsersIcon } from "lucide-react";
import type { ComponentType, ReactElement } from "react";
import { Announcements } from "./pages/Announcements";
import { ClientForm } from "./pages/ClientForm";
import { Clients } from "./pages/Clients";
import { Deliveries } from "./pages/Deliveries";
import { Dictionary } from "./pages/Dictionary";
import { Exchange } from "./pages/Exchange";
import { ExchangeForm } from "./pages/ExchangeForm";
import { Home } from "./pages/Home";
import { RoleForm } from "./pages/RoleForm";
import { Roles } from "./pages/Roles";
import { Settings } from "./pages/Settings";
import { SystemSettings } from "./pages/SystemSettings";
import { TemplateEditor } from "./pages/TemplateEditor";
import { Templates } from "./pages/Templates";
import { UserForm } from "./pages/UserForm";
import { Webhooks } from "./pages/Webhooks";
import { Users } from "./pages/Users";
import { ROUTES } from "./authz";


/**
 * A page of the app. This one table drives the sidebar, the breadcrumb and the permission guard, so a page is
 * added in one place. A menu item is shown, and the page served, only with `needs` (the gateway and identity
 * check it again).
 */
export interface AppRoute {
  path: string;
  /** Key of the translation of the title (menu item, breadcrumb). */
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
  /** Route or capability needed to see the page; none: every signed in user. */
  needs?: string;
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
  { path: "/users", labelKey: "nav.users", icon: UsersIcon, needs: ROUTES.listUsers, element: <Users />, testId: "nav-users" },
  { path: "/roles", labelKey: "nav.roles", icon: Shield, needs: ROUTES.listRoles, element: <Roles />, testId: "nav-roles" },
  { path: "/clients", labelKey: "nav.clients", icon: KeyRound, needs: ROUTES.listClients, element: <Clients />, testId: "nav-clients" },
  {
    path: "/exchange",
    labelKey: "nav.exchange",
    icon: ArrowLeftRight,
    needs: ROUTES.listExchange,
    element: <Exchange />,
    testId: "nav-exchange",
  },
  {
    path: "/dictionary",
    labelKey: "nav.dictionary",
    icon: BookOpen,
    needs: ROUTES.getDictSettings,
    element: <Dictionary />,
    testId: "nav-dictionary",
  },
  {
    path: "/templates",
    labelKey: "nav.templates",
    icon: FileText,
    needs: ROUTES.courierEventTypes,
    element: <Templates />,
    testId: "nav-templates",
  },
  {
    path: "/announcements",
    labelKey: "nav.announcements",
    icon: Megaphone,
    needs: ROUTES.listBroadcasts,
    element: <Announcements />,
    testId: "nav-announcements",
  },
  {
    path: "/deliveries",
    labelKey: "nav.deliveries",
    icon: Send,
    needs: ROUTES.listDeliveries,
    element: <Deliveries />,
    testId: "nav-deliveries",
  },
  {
    path: "/webhooks",
    labelKey: "nav.webhooks",
    icon: WebhookIcon,
    needs: ROUTES.listWebhooks,
    element: <Webhooks />,
    testId: "nav-webhooks",
  },
  {
    path: "/system",
    labelKey: "nav.system",
    icon: SlidersHorizontal,
    needs: ROUTES.putUiStyle,
    element: <SystemSettings />,
    testId: "nav-system",
  },
];

/** Pages that are not in the menu (reached from another page). Their parent is highlighted in the menu. */
export const subRoutes: AppRoute[] = [
  {
    path: "/templates/:template/:locale/:channel",
    labelKey: "nav.templateEdit",
    icon: FileText,
    needs: ROUTES.getTemplate,
    element: <TemplateEditor />,
    testId: "nav-template-edit",
    parent: "/templates",
  },
  {
    path: "/users/new",
    labelKey: "nav.userNew",
    icon: UsersIcon,
    needs: ROUTES.createUser,
    element: <UserForm />,
    testId: "nav-user-new",
    parent: "/users",
  },
  {
    path: "/users/:id",
    labelKey: "nav.userEdit",
    icon: UsersIcon,
    needs: ROUTES.getUser,
    element: <UserForm />,
    testId: "nav-user-edit",
    parent: "/users",
  },
  {
    path: "/roles/new",
    labelKey: "nav.roleNew",
    icon: Shield,
    needs: ROUTES.createRole,
    element: <RoleForm />,
    testId: "nav-role-new",
    parent: "/roles",
  },
  {
    path: "/roles/:name",
    labelKey: "nav.roleEdit",
    icon: Shield,
    needs: ROUTES.listRoles,
    element: <RoleForm />,
    testId: "nav-role-edit",
    parent: "/roles",
  },
  {
    path: "/clients/new",
    labelKey: "nav.clientNew",
    icon: KeyRound,
    needs: ROUTES.createClient,
    element: <ClientForm />,
    testId: "nav-client-new",
    parent: "/clients",
  },
  {
    path: "/clients/:id",
    labelKey: "nav.clientEdit",
    icon: KeyRound,
    needs: ROUTES.listClients,
    element: <ClientForm />,
    testId: "nav-client-edit",
    parent: "/clients",
  },
  {
    path: "/exchange/new",
    labelKey: "nav.exchangeNew",
    icon: ArrowLeftRight,
    needs: ROUTES.putExchange,
    element: <ExchangeForm />,
    testId: "nav-exchange-new",
    parent: "/exchange",
  },
  {
    path: "/exchange/edit",
    labelKey: "nav.exchangeEdit",
    icon: ArrowLeftRight,
    needs: ROUTES.listExchange,
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
