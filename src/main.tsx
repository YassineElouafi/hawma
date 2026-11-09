import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { I18nProvider } from "@/i18n";
import Landing from "@/Landing";
import { lazy, Suspense } from "react";
const OpsApp = lazy(() => import("@/ops/OpsApp"));
const WebApp = lazy(() => import("@/webapp/WebApp"));

const path = location.pathname.replace(/\/$/, "");
const isApp = path === "/app";
const isOps = path === "/ops";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      {isOps ? <Suspense fallback={null}><OpsApp /></Suspense> : isApp ? <Suspense fallback={null}><WebApp /></Suspense> : <Landing />}
    </I18nProvider>
  </StrictMode>,
);
