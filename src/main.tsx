import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { I18nProvider } from "@/i18n";
import Landing from "@/Landing";
import App from "@/app/App";

const isApp = location.pathname.replace(/\/$/, "") === "/app";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      {isApp ? <div className="mx-auto h-dvh max-w-[480px] bg-background shadow-2xl"><App /></div> : <Landing />}
    </I18nProvider>
  </StrictMode>,
);
