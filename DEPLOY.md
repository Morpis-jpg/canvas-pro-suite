# Public mirrors

The same build is deployed to several free hosts so the app keeps working even when
a school network blocks one of them. Canvas sync works on hosts that serve the
serverless proxy (`api/canvas.py`, `api/dl.py`); on static-only mirrors the app shows
a notice and the calculator/reference tools still work.

| Host | URL | Canvas sync | Auto-deploy |
| ---- | --- | ----------- | ----------- |
| Vercel | https://canvas-pro-suite-beta.vercel.app | yes | `vercel deploy --prod --yes` (or Git integration) |
| GitHub Pages | https://morpis-jpg.github.io/canvas-pro-suite/ | no (static) | `.github/workflows/pages.yml` on `beta` |
| Firebase Hosting | https://canvas-pro-suite.web.app | no (static) | `.github/workflows/firebase-hosting.yml` on `beta` |
| Cloudflare Pages | https://canvas-pro-suite.pages.dev | no (static) | `.github/workflows/cloudflare-pages.yml` on `beta` |

## Setting up Firebase Hosting (one time)

1. `npm i -g firebase-tools`
2. `firebase login`
3. Create a project named `canvas-pro-suite` at https://console.firebase.google.com
   (Spark free plan, Hosting enabled).
4. Add the workflow secret `FIREBASE_SERVICE_ACCOUNT` in the repo settings with the
   service-account JSON from Project settings → Service accounts → Generate new key.
   Every push to `beta` then deploys the mirror.

## Setting up Cloudflare Pages (one time)

1. Create an account at https://dash.cloudflare.com (free).
2. Create an API token with the `Cloudflare Pages — Edit` permission; copy the
   Account ID from the dashboard sidebar.
3. Add repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
   Every push to `beta` then deploys the mirror.

## First-time manual deploy (optional)

- Firebase: `firebase deploy --only hosting`
- Cloudflare: `npx wrangler pages deploy . --project-name canvas-pro-suite`

## School-Wi-Fi notes

If every mirror is blocked, ask district IT to allowlist the Vercel URL
(`canvas-pro-suite-beta.vercel.app`). Local use is always available and cannot be
blocked: `npm start` then open http://localhost:8000.
