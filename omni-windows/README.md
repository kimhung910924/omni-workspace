# Omni Windows

Electron + React + TypeScript + Vite shell for the Windows-first Omni Workspace milestone.

## What this milestone includes

- Electron `BrowserWindow` host.
- React layout with a left sidebar, top tab bar, and central WebView area.
- A single Claude WebView loading `https://claude.ai`.
- Persistent Claude session partition (`persist:claude`) so Claude cookies/cache are stored under Electron user data and can survive full app restarts.

## Run in development

```bash
cd omni-windows
npm install
npm run dev
```

Log in to Claude in the WebView, fully quit the Electron app, then run `npm run dev` again to verify that the Claude session remains available.

## Checks

```bash
npm run typecheck
npm run build
```

Packaging, broadcast, file attachment, backend/database integration, payments, and multi-provider WebViews are intentionally out of scope for this milestone.
