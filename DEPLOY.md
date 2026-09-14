# Public mirrors

Every mirror is fully self-contained: it serves the app and its **own** Canvas /
file / AI proxy. Nothing routes through another host (the school blocks Vercel,
so no mirror may depend on it).

| Host | URL | Proxy implementation | Auto-deploy |
| ---- | --- | -------------------- | ----------- |
| Cloudflare Pages | https://canvas-pro-suite.pages.dev | Pages Functions — `functions/api/{canvas,dl,ai}.js` | `.github/workflows/cloudflare-pages.yml` on `beta` |
| Netlify | (site URL after setup) | Netlify Functions — `netlify/functions/{canvas,dl,ai}.mjs` | `.github/workflows/netlify.yml` on `beta` |
| Render | (service URL after setup) | the full `server.py` (static + `/api/canvas`, `/api/dl`, `/api/ai`) | Render Git integration (`render.yaml`) |
| Vercel | https://canvas-pro-suite-beta.vercel.app | Python functions — `api/{canvas,dl,ai}.py` | Git integration (repo default branch) |

## Static-only extras (no proxy)

GitHub Pages (`https://morpis-jpg.github.io/canvas-pro-suite/`) and Firebase
(`https://canvas-pro-suite.web.app`) are pure static hosting: they cannot run a
server proxy (Firebase Functions require the paid Blaze plan). They still run the
full calculator, reference sheets, and saved data, and show a notice pointing at
the Cloudflare mirror. They can be deleted any time without breaking anything.

## Setting up Netlify (one time)

1. Create a free account at https://app.netlify.com.
2. Either click **Add new site → Import an existing project → GitHub →
   `canvas-pro-suite`** (branch `beta`), or create a bare site and copy its API ID.
3. Add two repo secrets:
   - `NETLIFY_AUTH_TOKEN` — Netlify → User settings → Applications → Personal access tokens
   - `NETLIFY_SITE_ID` — Site configuration → General → Site information → API ID
4. Every push to `beta` then deploys the mirror; the first deploy creates it.

## Setting up Render (one time)

1. Create a free account at https://render.com and connect GitHub.
2. **New → Blueprint**, pick the `canvas-pro-suite` repo; `render.yaml` is applied
   automatically (free plan, `python server.py`).
3. Render sets `PORT`, so the server binds it and skips opening a browser.
   Free services sleep after ~15 minutes idle (first visit takes ~30–60 s).

## Local (never blockable)

```bash
npm start        # serves http://localhost:8000 with the same proxies
```
