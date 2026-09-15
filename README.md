<div align="center">

# Canvas Pro

**A grade-aware Canvas dashboard with a full graphing calculator built in.**

One workspace for classes, grades, assignments, study plans — plus a Desmos-style
calculator with graphing, scientific, CAS, AP science solvers, and printable
reference sheets.

</div>

## Live mirrors

Every mirror is fully self-contained: it serves the app **and its own Canvas /
file / AI proxy**, so nothing depends on another host (useful when a school
network blocks one of them).

| Mirror | URL | Notes |
| ------ | --- | ----- |
| **Cloudflare** | https://canvas-pro-suite.pages.dev | full features · Cloudflare Pages Functions proxy |
| **Netlify** | https://canvas-pro-suite.netlify.app | full features · Netlify Functions proxy |
| **Render** | https://canvas-pro-suite.onrender.com | full features · runs the whole Python server · free tier sleeps when idle |
| **Vercel** | https://canvas-pro-suite-beta.vercel.app | full features · Python functions proxy |
| GitHub Pages | https://morpis-jpg.github.io/canvas-pro-suite/ | calculator + reference sheets only (static — no proxy) |
| Firebase | https://canvas-pro-suite.web.app | calculator + reference sheets only (static — no proxy) |

Static-only mirrors show a notice with a link to a full mirror.

## Features

### Canvas dashboard
- **Dashboard** — every class and current grade up front, plus "do these first"
- **Assignments** — type, weight, points, and due date for everything
- **Tests** — exams and quizzes separated out
- **To-Do** — work ranked by urgency, weight, points at stake, and distance from each course's GPA target
- **Late Work** — syllabus-aware late list
- **Grades** — current grades vs targets, GPA estimate
- **Study Plan** — nightly schedule that slots homework before it's due and ramps test prep over the days before an exam
- **Curve Calc** — see what a curve does to your grade; optional shared curve history
- **Documents** — teacher-posted files with in-app previews and downloads
- **Announcements** — course announcements in one feed
- **AI Assistant** — optional chat that knows your courses and open work (bring your own provider/key)

### Integrated calculator (native, not an iframe)
- **Graphing** — implicit equations, inequalities with shading, tables + live regression, system intersections, hover-to-inspect points, click-to-pin points, smart key points (intercepts, vertices, curve intersections)
- **Scientific** — 6-column Desmos-style keypad, history tape, `ans`, full trig/hyperbolic/log/γ/nCr/nPr set
- **CAS** — simplify, differentiate, solve, expand, rationalize, evaluate, plot back to the graph
- **AP Physics / Chem / Bio / Calc / Stats / SAT & ACT** — topic formula cards with a one-click equation solver (polynomials solved exactly, everything else numerically)
- **Reference sheets** — every subject plus 3D shapes, printable
- Follows the host theme (8 palettes × light/dark), vendored mathjs + MathJax (no CDN dependency)

## Use it

**Hosted:** open any full mirror above and paste a Canvas token.

**Locally (never blocked by any network):**

```bash
npm start          # http://localhost:8000
```

No install and no build step — Python 3 standard library only.

## Connect to Canvas

1. Canvas → Account → Settings → **New Access Token** (add the `Files` and
   `Modules` scopes if you want the Documents tab).
2. Paste the token and your school's Canvas URL into the app.
3. The token stays in your browser's localStorage and is used only through the
   app's own proxy to reach Canvas — it is never stored on any server and never
   committed to this repo.

> Access is Canvas-email based. The app reads the email from your Canvas profile
> and can reject personal-mail aliases unless you allowlist a domain in
> Settings → Account access.

## Run it yourself / self-hosting

| Piece | Where |
| ----- | ----- |
| Static app | repo root (`index.html`, `css/`, `js/`, `tools/calculator/`, `vendor/`) |
| Proxy (Node) | `functions/api/*.js` (Cloudflare Pages), `netlify/functions/*.mjs` (Netlify) |
| Proxy (Python) | `api/*.py` (Vercel), `server.py` (local / Render) |
| Deploy docs | [DEPLOY.md](DEPLOY.md) |

Every proxy implements the same three routes:

- `GET/POST /api/canvas?p=<Canvas API path>` — Canvas REST passthrough (adds the caller's token, rewrites pagination links)
- `GET /api/dl?u=<Canvas file URL>` — authenticated file download
- `POST /api/ai` — AI provider passthrough using the key you supply in the browser

## Optional cloud storage

Curve history can sync to a free Supabase project so other students see how a
class has curved before. Canvas tokens never go near it.

1. Create a project at https://supabase.com and run `supabase/schema.sql`.
2. In the app: Settings → Cloud storage → paste the project URL + anon key.

## Privacy

| Data | Where |
| ---- | ----- |
| Canvas access token | this device only (localStorage); sent only to the app's own proxy on the same origin |
| Canvas profile, classes, grades | cached in the browser |
| Curve logs | this device + optional Supabase if you enable it |
| AI provider key | this device only; sent only to the app's own proxy for your request |

## Branches

- `beta` — active development; every mirror auto-deploys from this branch.
- `main` — stable snapshot, promoted only when explicitly asked.

## Structure

```
index.html              app shell + onboarding
css/styles.css          theme (8 palettes × light/dark)
js/app.js               bootstrap, tabs, sync, mirror detection
js/canvas.js            Canvas REST client (paged) through the local proxy
js/data.js              normalize courses/assignments/todos
js/storage.js           local settings + Supabase adapter
js/priorities.js        "what to do first" ranking engine
js/schedule.js          study-plan generator
js/curve.js             curve math + history rendering
js/ui/*.js              one renderer per tab (incl. calculator.js — native Shadow DOM mount)
tools/calculator/       the calculator app (also usable standalone)
vendor/                 vendored mathjs + MathJax (no CDN needed)
functions/api/*.js      Cloudflare Pages Functions proxy
netlify/functions/*.mjs Netlify Functions proxy
api/*.py                Vercel Python Functions proxy
server.py               local / Render server (static + all three proxies)
supabase/schema.sql     optional cloud schema (RLS on)
scripts/                Netlify build helper
```

## License / credits

mathjs and MathJax are vendored under their own licenses (Apache-2.0); see
`vendor/README.md`.
