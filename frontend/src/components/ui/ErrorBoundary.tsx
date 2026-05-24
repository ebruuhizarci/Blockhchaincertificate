import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Etherescan render hatası:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            background: "#0b0f1a",
            color: "#fca5a5",
            padding: "2rem",
            fontFamily: "monospace",
          }}
        >
          <h1 style={{ color: "#fff", fontSize: "1.25rem" }}>
            Uygulama yüklenemedi
          </h1>
          <pre style={{ marginTop: "1rem", whiteSpace: "pre-wrap" }}>
            {this.state.error.message}
          </pre>
          <p style={{ marginTop: "1rem", color: "#94a3b8", fontSize: "0.875rem" }}>
            Tarayıcı konsolunu (F12) açıp hatayı kontrol edin. Ardından sayfayı
            yenileyin.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: "1rem",
              padding: "0.5rem 1rem",
              background: "#4f46e5",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            Yenile
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
