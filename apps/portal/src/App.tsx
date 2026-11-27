import { RequireAuth } from "@huponx/auth-client";
import { useAuth } from "@huponx/auth-client";
import { AppShell, Button, Loading, UiMessagesProvider, systemStyleOf, translateApiError, useSystemStyle } from "@huponx/ui-kit";
import type { Crumb, NavItem, ShellLabels, ShellLink, SystemStyleReply } from "@huponx/ui-kit";
import { Home as HomeIcon, ShieldCheck, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { AccountMenu } from "./AccountMenu";
import { PortalLogo } from "./Logo";
import { Home } from "./pages/Home";
import { Profile } from "./pages/Profile";
import { Security } from "./pages/Security";

// NavLink of React Router fits the link of the shell
const link = NavLink as unknown as ShellLink;

function Message({ children }: { children: string }) {
  return <p className="py-12 text-center text-muted-foreground">{children}</p>;
}

/** Applies the style the administrator picked for the whole system (the cached one is used until it arrives). */
function SystemStyle() {
  const { client } = useAuth();
  useSystemStyle(() => client.api<SystemStyleReply>("GET", "/api/ui-style").then(systemStyleOf));
  return null;
}

function Shell() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const items: NavItem[] = [
    { to: "/", label: t("nav.home"), icon: HomeIcon, end: true },
    { to: "/profile", label: t("nav.profile"), icon: UserRound },
    { to: "/security", label: t("nav.security"), icon: ShieldCheck },
  ];
  const current = items.find((i) => i.to !== "/" && i.to === pathname);
  const breadcrumbs: Crumb[] = [{ label: t("nav.home"), to: current ? "/" : undefined }, ...(current ? [{ label: current.label }] : [])];
  const labels: ShellLabels = {
    navigation: t("shell.navigation"),
    collapse: t("shell.collapse"),
    expand: t("shell.expand"),
    openMenu: t("shell.openMenu"),
    closeMenu: t("shell.closeMenu"),
    backToTop: t("shell.backToTop"),
    breadcrumb: t("shell.breadcrumb"),
    theme: { group: t("shell.theme.group"), light: t("shell.theme.light"), dark: t("shell.theme.dark"), system: t("shell.theme.system") },
  };
  return (
    <AppShell pageKey={pathname} logo={<PortalLogo />} brand={t("shell.brand")} items={items} breadcrumbs={breadcrumbs} link={link} labels={labels} userMenu={<AccountMenu />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/security" element={<Security />} />
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
  };
  return (
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
      <UiMessagesProvider value={messages}>
        <SystemStyle />
        <Shell />
      </UiMessagesProvider>
    </RequireAuth>
  );
}
