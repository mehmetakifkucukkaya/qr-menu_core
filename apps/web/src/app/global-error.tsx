"use client";

/**
 * Last-resort boundary: it replaces the ROOT layout, so it brings its own
 * <html>/<body> and cannot rely on the stylesheet being loaded.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="tr">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          background: "#faf7f2",
          color: "#1f2a24",
        }}
      >
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", margin: 0 }}>Bir şeyler ters gitti</h1>
          <p style={{ margin: 0, maxWidth: "28rem", lineHeight: 1.5 }}>
            Uygulama beklenmedik bir hatayla karşılaştı. Sayfayı yenileyin; sürerse ajansınıza bildirin.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "8px",
              padding: "10px 20px",
              borderRadius: "12px",
              border: "none",
              background: "#1f4d3a",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Tekrar dene
          </button>
        </main>
      </body>
    </html>
  );
}
