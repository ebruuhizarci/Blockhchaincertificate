import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "react-hot-toast";
import App from "./App";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.innerHTML =
    '<p style="color:red;padding:2rem">#root bulunamadı — index.html kontrol edin.</p>';
} else {
  try {
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 4500,
              style: {
                borderRadius: "16px",
                fontSize: "13px",
                background: "#161d31",
                color: "#f1f5f9",
                border: "1px solid rgba(255,255,255,0.1)",
              },
            }}
          />
        </ErrorBoundary>
      </React.StrictMode>
    );
  } catch (e) {
    rootEl.innerHTML = `<pre style="color:#fca5a5;padding:2rem;background:#0b0f1a">${(e as Error).message}</pre>`;
  }
}
