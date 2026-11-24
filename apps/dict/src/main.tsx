import { AuthProvider, createClient, readEnv } from "@huponx/auth-client";
import { StyleProvider, ThemeProvider } from "@huponx/ui-kit";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { App } from "./App";
import "./i18n";
import "./index.css";

const env = readEnv();
const client = createClient({ apiBase: env.API_BASE });
// a data router: the lookup page blocks leaving while it holds edits that are not saved
const router = createBrowserRouter([{ path: "*", element: <App /> }]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <StyleProvider>
        <AuthProvider client={client}>
          <RouterProvider router={router} />
        </AuthProvider>
      </StyleProvider>
    </ThemeProvider>
  </StrictMode>,
);
