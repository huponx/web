import { Can, RequireAuth, useAuth } from "@huponx/auth-client";
import { Button, Center, Layout, Loading } from "@huponx/ui";
import { NavLink, Route, Routes } from "react-router-dom";
import { Clients } from "./pages/Clients";
import { Exchange } from "./pages/Exchange";
import { Home } from "./pages/Home";
import { Roles } from "./pages/Roles";
import { Session } from "./pages/Session";
import { Users } from "./pages/Users";

/** A page of the app: shown in the menu and served only with the permission (the gateway and identity check it again). */
const pages = [
  { path: "/users", label: "Users", perm: "identity:user:read", element: <Users /> },
  { path: "/roles", label: "Roles", perm: "identity:role:read", element: <Roles /> },
  { path: "/clients", label: "Clients", perm: "identity:client:read", element: <Clients /> },
  { path: "/exchange", label: "Exchange policies", perm: "identity:exchange:read", element: <Exchange /> },
];

function Shell() {
  const { user, logout } = useAuth();
  return (
    <Layout
      brand="Identity admin"
      user={user?.sub}
      onLogout={() => void logout()}
      nav={
        <>
          <NavLink to="/" end>
            Home
          </NavLink>
          {pages.map((p) => (
            <Can key={p.path} perm={p.perm}>
              <NavLink to={p.path}>{p.label}</NavLink>
            </Can>
          ))}
          <NavLink to="/session">Session</NavLink>
        </>
      }
    >
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/session" element={<Session />} />
        {pages.map((p) => (
          <Route
            key={p.path}
            path={p.path}
            element={
              <Can perm={p.perm} fallback={<Center>You are not allowed to see this page.</Center>}>
                {p.element}
              </Can>
            }
          />
        ))}
        <Route path="*" element={<Center>Page not found.</Center>} />
      </Routes>
    </Layout>
  );
}

export function App() {
  return (
    <RequireAuth
      loading={<Loading label="Signing in..." />}
      error={({ message, retry }) => (
        <Center>
          <div>
            <p>{message}</p>
            <Button onClick={retry}>Try again</Button>
          </div>
        </Center>
      )}
    >
      <Shell />
    </RequireAuth>
  );
}
