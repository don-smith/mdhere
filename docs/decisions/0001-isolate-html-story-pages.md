# Isolate HTML story pages in a sandboxed frame

mdhere renders Markdown in a privileged app document, but story pages need local scripts without native or network access. Serve their files through a root-confined story protocol and load them in an opaque sandboxed iframe with a separate deny-by-default CSP. Keep document navigation and theme handoff in an app-owned bridge. A packaged macOS probe showed that this works without the extra layout and coordination of a second webview; rendering active HTML in the Markdown reader would not isolate its scripts.

## Consequences

- Keep the image protocol and sanitized Markdown path unchanged. Restrict the story protocol to explicit file types and check every path against the selected root.
- The low-level WebKit IPC handler remains visible in the frame. In this one-webview design, Tauri's invoke key is injected into the main frame only; story scripts must not obtain it. Packaged tests observed no successful invalid-key command attempt and no requests at the control-checked loopback sink, but do not prove unconditional IPC denial. Any story-derived native-command success or unauthorized outbound request returns to Design for a separate unprivileged webview.
- Native tests assert exact story response headers constructed by the protocol, while packaged CSP effects were observed; exact headers delivered by release WKWebView and stronger origin/IPC isolation evidence are deferred to a separately scoped security follow-up. Do not treat the bounded Phase 2 gate as proof against every runtime or a leaked invoke key.
- Keep author pages portable: use ordinary semantic HTML, relative links and assets, and browser-usable defaults. mdhere supplies a small palette from the selected theme rather than applying Markdown-specific theme CSS to the frame.

The accepted workstream design records the probe, rejected alternatives, and verification gates: `html-story-pages/design/2026-10-05T06-43-55Z_html-story-pages.md` in the MyFlow artifact store.
