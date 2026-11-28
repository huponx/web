import { RequireAuth, useAuth } from "@huponx/auth-client";
import { AppShell, Button, UiMessagesProvider, systemStyleOf, translateApiError, useSystemStyle } from "@huponx/ui-kit";
import type { Crumb, SystemStyleReply, NavItem, ShellLabels, ShellLink } from "@huponx/ui-kit";
import { useTranslation } from "react-i18next";
import { matchPath, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { AccountMenu } from "./AccountMenu";
import { Notifications } from "./Notifications";
import { Loading } from "./components/common";
import { allRoutes, routes, settingsRoute } from "./routes";
import type { AppRoute } from "./routes";

// NavLink of React Router fits the link of the shell
const link = NavLink as unknown as ShellLink;

function Message({ children }: { children: React.ReactNode }) {
  return <p className="py-12 text-center text-muted-foreground">{children}</p>;
}

function Guarded({ route }: { route: AppRoute }) {
  const { can } = useAuth();
  const { t } = useTranslation();
  if (route.needs && !can(route.needs)) return <Message>{t("common.notAllowed")}</Message>;
  return route.element;
}

/** Applies the style the administrator picked for the whole system (the cached one is used until it arrives). */
function SystemStyle() {
  const { client } = useAuth();
  useSystemStyle(() => client.api<SystemStyleReply>("GET", "/api/ui-style").then(systemStyleOf));
  return null;
}

function Shell() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { pathname } = useLocation();

  const toItem = (r: AppRoute): NavItem => ({ to: r.path, label: t(r.labelKey), icon: r.icon, end: r.end, testId: r.testId });
  const items = routes.filter((r) => !r.needs || can(r.needs)).map(toItem);

  // Home > parent > ... > this page; every crumb but the last is a link
  const current = allRoutes.find((r) => r.path !== "/" && matchPath({ path: r.path, end: true }, pathname));
  const chain: AppRoute[] = [];
  for (let r: AppRoute | undefined = current; r; r = r.parent ? allRoutes.find((p) => p.path === r?.parent) : undefined) chain.unshift(r);
  const breadcrumbs: Crumb[] = [
    { label: t("nav.home"), to: current ? "/" : undefined },
    ...chain.map((r, i): Crumb => ({ label: t(r.labelKey), to: i < chain.length - 1 ? r.path : undefined })),
  ];

  const labels: ShellLabels = {
    navigation: t("shell.navigation"),
    collapse: t("shell.collapse"),
    expand: t("shell.expand"),
    openMenu: t("shell.openMenu"),
    closeMenu: t("shell.closeMenu"),
    backToTop: t("shell.backToTop"),
    breadcrumb: t("shell.breadcrumb"),
    theme: {
      group: t("shell.theme.group"),
      light: t("shell.theme.light"),
      dark: t("shell.theme.dark"),
      system: t("shell.theme.system"),
    },
  };

  return (
    <AppShell
      pageKey={pathname}
      brand={t("shell.brand")}
      items={items}
      bottomItems={[toItem(settingsRoute)]}
      breadcrumbs={breadcrumbs}
      link={link}
      labels={labels}
      userMenu={<AccountMenu />} notifications={<Notifications />}
    >
      <Routes>
        {allRoutes.map((r) => (
          <Route key={r.path} path={r.path} element={<Guarded route={r} />} />
        ))}
        <Route path="/session" element={<Navigate to={settingsRoute.path} replace />} />
        <Route path="*" element={<Message>{t("common.notFound")}</Message>} />
      </Routes>
    </AppShell>
  );
}

export function App() {
  const { t, i18n } = useTranslation();
  // the texts of the shared components of the kit (loading, field errors, ...) in the language of the app
  const messages = {
    loading: t("common.loading"),
    somethingWrong: t("common.somethingWrong"),
    apiError: (e: unknown) => translateApiError(e, i18n, t("common.somethingWrong")),
    required: t("common.required"),
    invalidEmail: t("common.invalidEmail"),
    invalidFormat: t("common.invalidFormat"),
    clearField: (label: string) => t("common.clearField", { label }),
    empty: t("common.empty"),
    close: t("common.close"),
    loadMore: t("common.loadMore"),
    none: t("common.none"),
  };
  return (
    <UiMessagesProvider value={messages}>
    <RequireAuth
      loading={<Loading label={t("common.signingIn")} />}
      signingOut={<Loading label={t("common.signingOut")} />}
      error={({ message, retry }) => (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <p>{message}</p>
          <Button onClick={retry}>{t("common.tryAgain")}</Button>
        </div>
      )}
    >
      <SystemStyle />
      <Shell />
    </RequireAuth>
    </UiMessagesProvider>
  );
}
