# Omni Windows

Electron + React + TypeScript + Vite shell for the Windows-first Omni Workspace milestone.

## What this milestone includes

- Electron `BrowserWindow` host.
- React layout with a left sidebar, top tab bar, and central WebView area.
- Claude WebView loading `https://claude.ai`.
- ChatGPT WebView loading `https://chatgpt.com`.
- Provider tabs are limited to Claude and ChatGPT for this milestone.
- Separate persistent session partitions so provider cookies/cache are isolated and can survive full app restarts:
  - Claude: `persist:claude`
  - ChatGPT: `persist:chatgpt`

## Run in development

```bash
cd omni-windows
npm install
npm run dev
```

## Manual session isolation check

1. Start the Electron app with `npm run dev`.
2. Open the Claude tab and log in to Claude.
3. Open the ChatGPT tab and log in to ChatGPT.
4. Fully quit the Electron app.
5. Start the app again with `npm run dev`.
6. Confirm Claude is still logged in on the Claude tab.
7. Confirm ChatGPT is still logged in on the ChatGPT tab.
8. Log out of only one service, then switch to the other tab and confirm the other service remains logged in.

## Checks

```bash
npm run typecheck
npm run build
```

Packaging, broadcast, file attachment, backend/database integration, payments, Gemini, and provider WebView DOM manipulation are intentionally out of scope for this milestone.
