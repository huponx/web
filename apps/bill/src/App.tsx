import { Can, RequireAuth, useAuth } from "@huponx/auth-client";
import { Button, Center, Layout, Loading } from "@huponx/ui";
import { NavLink, Route, Routes } from "react-router-dom";
import { Invoices } from "./pages/Invoices";
import { Home } from "./pages/Home";
import { Session } from "./pages/Session";

function Shell() {
  const { user, logout } = useAuth();
  return (
    <Layout
      brand="Bill"
      user={user?.sub}
      onLogout={() => void logout()}
      nav={
        <>
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/session">Session</NavLink>
          {/* the menu only shows what the user may use; the gateway checks the permission again */}
          <Can perm="bill:invoice:read">
            <NavLink to="/invoices">Invoices</NavLink>
          </Can>
        </>
      }
    >
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/session" element={<Session />} />
        <Route
          path="/invoices"
          element={
            <Can perm="bill:invoice:read" fallback={<Center>You are not allowed to see this page.</Center>}>
              <Invoices />
            </Can>
          }
        />
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
