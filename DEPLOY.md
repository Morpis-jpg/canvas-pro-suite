# Public mirrors

The same build is deployed to several free hosts so the app keeps working even when
a school network blocks one of them — including Vercel, which many districts block.

| Host | URL | Canvas sync | Auto-deploy |
| ---- | --- | ----------- | ----------- |
| Cloudflare Pages | https://canvas-pro-suite.pages.dev | yes — Pages Functions proxy (`functions/api/canvas.js`, `functions/api/dl.js`) | `.github/workflows/cloudflare-pages.yml` on `beta` |
| Vercel | https://canvas-pro-suite-beta.vercel.app | yes — Python functions (`api/canvas.py`, `api/dl.py`) | `vercel deploy --prod --yes` |
| GitHub Pages | https://morpis-jpg.github.io/canvas-pro-suite/ | no (static only) | `.github/workflows/pages.yml` on `beta` |
| Firebase Hosting | https://canvas-pro-suite.web.app | no (static only) | `.github/workflows/firebase-hosting.yml` on `beta` |

Static-only mirrors still run the full calculator, reference sheets, and saved
data; they show a notice pointing at the Cloudflare mirror when Canvas features
are unavailable. Nothing routes through Vercel.

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

If every full-feature mirror is blocked, ask district IT to allowlist
`canvas-pro-suite.pages.dev` (Cloudflare — full features) or use the local server,
which cannot be blocked: `npm start` then open http://localhost:8000.
