# Public mirrors

Every mirror is fully self-contained: it serves the app and its **own** Canvas /
file / AI proxy. Nothing routes through another host (the school blocks Vercel,
so no mirror may depend on it).

| Host | URL | Proxy implementation | Auto-deploy |
| ---- | --- | -------------------- | ----------- |
| Cloudflare Pages | https://canvas-pro-suite.pages.dev | Pages Functions — `functions/api/{canvas,dl,ai}.js` | `.github/workflows/cloudflare-pages.yml` on `beta` |
| Netlify | https://canvas-pro-suite.netlify.app | Netlify Functions — `netlify/functions/{canvas,dl,ai}.mjs` | `.github/workflows/netlify.yml` on `beta` (secrets set) |
| Render | https://canvas-pro-suite.onrender.com | the full `server.py` (static + `/api/canvas`, `/api/dl`, `/api/ai`) | Render Git auto-deploy (`render.yaml`, branch `beta`) |
| Vercel | https://canvas-pro-suite-beta.vercel.app | Python functions — `api/{canvas,dl,ai}.py` | Git integration |

Render's free instance sleeps after ~15 minutes idle — first visit takes ~30–60 s.

## Legacy static extras (no proxy)

GitHub Pages (`https://morpis-jpg.github.io/canvas-pro-suite/`) and Firebase
(`https://canvas-pro-suite.web.app`) cannot run a server proxy (Firebase Functions
need the paid Blaze plan). They still serve the calculator, reference sheets, and
saved data, and show a notice pointing at a full mirror. Retire them any time:
delete `.github/workflows/pages.yml` / `firebase-hosting.yml` and remove the
deployments (Firebase console → Hosting; repo Settings → Pages).

## Local (never blockable)

```bash
npm start        # serves http://localhost:8000 with the same proxies
```
