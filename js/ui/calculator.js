import { settings } from "../storage.js";

const MATHJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/mathjs/13.0.3/math.min.js";
let mathPromise;

const CANVAS_CALC_THEMES = {
  "midnight-dark": { bg: "#0f1220", grid: "rgba(255,255,255,.08)", axis: "#6d76a0", num: "#8490bb", label: "#e7e9f4" },
  "midnight-light": { bg: "#eef1fa", grid: "rgba(90,105,150,.16)", axis: "#7b86ae", num: "#7d87aa", label: "#222a45" },
  "earthy-dark": { bg: "#191512", grid: "rgba(255,255,255,.08)", axis: "#86785f", num: "#bca98a", label: "#f2e8d6" },
  "earthy-light": { bg: "#f2e9da", grid: "rgba(120,100,65,.18)", axis: "#9e8960", num: "#93805f", label: "#44382a" },
  "earthy-green-dark": { bg: "#101712", grid: "rgba(255,255,255,.08)", axis: "#63806d", num: "#9db5a0", label: "#eaf2e6" },
  "earthy-green-light": { bg: "#eff4e8", grid: "rgba(70,110,75,.16)", axis: "#7c957b", num: "#71866b", label: "#2f402e" },
  "cream-dark": { bg: "#16120d", grid: "rgba(255,255,255,.08)", axis: "#8f7c5b", num: "#b3a383", label: "#f0e6d3" },
  "cream-light": { bg: "#f6ecd9", grid: "rgba(130,105,55,.18)", axis: "#a58f68", num: "#93805f", label: "#3a3124" },
};

function loadMathjs() {
  if (window.math) return Promise.resolve();
  if (mathPromise) return mathPromise;
  mathPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = MATHJS_URL;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load mathjs for the calculator."));
    document.head.appendChild(script);
  });
  return mathPromise;
}

function transformCalculatorCss(css) {
  return css
    .replace(/html\[data-theme="dark"\]\s+body/g, ':host([data-theme="dark"])')
    .replace(/html\[data-theme="dark"\]/g, ':host([data-theme="dark"])')
    .replace(/html\[data-theme="light"\]/g, ':host([data-theme="light"])')
    .replace(/:root/g, ":host")
    .replace(/\bbody\b/g, ":host")
    .replace(/\bhtml\b/g, ":host");
}

function scopedDocument(shadow, host) {
  const real = document;
  return new Proxy(real, {
    get(target, prop) {
      if (prop === "getElementById") return (id) => shadow.querySelector("#" + id);
      if (prop === "querySelector") return (selector) => shadow.querySelector(selector);
      if (prop === "querySelectorAll") return (selector) => shadow.querySelectorAll(selector);
      if (prop === "addEventListener") return (...args) => shadow.addEventListener(...args);
      if (prop === "removeEventListener") return (...args) => shadow.removeEventListener(...args);
      if (prop === "documentElement") return host;
      if (prop === "activeElement") return shadow.activeElement || real.activeElement;
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function prepareMarkup(doc) {
  const template = document.createElement("template");
  template.innerHTML = doc.body.innerHTML;
  template.content.querySelectorAll("*").forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      if (!attribute.name.startsWith("on")) return;
      element.setAttribute("data-inline-" + attribute.name, attribute.value);
      element.removeAttribute(attribute.name);
    });
  });
  return template.content;
}

export async function render(_state, root, isStale = () => false) {
  window.__gcalcInstance?.unmount?.();
  window.__gcalcInstance = null;
  root.innerHTML = `
    <div class="calculator-tool calculator-native">
      <div class="calculator-tool-head">
        <div>
          <h1>Calculator</h1>
          <p class="subtitle">Graphing, scientific, CAS, AP science, SAT &amp; ACT references, and 3D shape formulas.</p>
        </div>
        <span class="badge badge-beta">FULL TOOL</span>
      </div>
      <div class="calculator-mount" id="calculatorMount"></div>
    </div>
  `;

  await loadMathjs();
  if (isStale()) return;
  const mount = root.querySelector("#calculatorMount");
  const shadow = mount.attachShadow({ mode: "open" });
  const source = await fetch("tools/calculator/index.html?embedded-source=1").then((r) => {
    if (!r.ok) throw new Error("Could not load calculator source.");
    return r.text();
  });
  if (isStale()) return;
  const sourceDoc = new DOMParser().parseFromString(source, "text/html");
  const style = document.createElement("style");
  style.textContent = ":host { display:block; width:100%; height:100%; min-height:100%; } .gcalc-body { width:100%; height:max(820px, calc(100vh - 180px)); overflow:hidden; }\n" + [...sourceDoc.querySelectorAll("style")].map((s) => transformCalculatorCss(s.textContent)).join("\n");
  shadow.appendChild(style);
  const body = document.createElement("div");
  body.className = "gcalc-body";
  body.appendChild(prepareMarkup(sourceDoc));
  shadow.appendChild(body);

  const mainScript = [...sourceDoc.scripts].find((s) => !s.src && s.textContent.includes("const exprInput"))?.textContent;
  if (!mainScript) throw new Error("Calculator script was not found.");
  window.MathJax = window.MathJax || { tex: { inlineMath: [["$", "$"]], displayMath: [["$$", "$$"]] }, startup: { typeset: false } };

  const scoped = scopedDocument(shadow, mount);
  const embeddedScript = mainScript.replace("window.addEventListener('resize',", "root.addEventListener('gcalc-resize',");
  const runner = new Function("document", "window", "root", "host", "themeMap", `${embeddedScript}
  for (const inlineType of ["click", "change", "input", "keydown", "keyup"]) {
    root.addEventListener(inlineType, function (event) {
      let element = event.target;
      while (element && element !== root) {
        const code = element.getAttribute && element.getAttribute("data-inline-on" + inlineType);
        if (code) { eval(code); break; }
        element = element.parentNode;
      }
    });
  }
return {
    setTheme(palette, mode) {
      const p = ["midnight", "earthy", "earthy-green", "cream"].includes(palette) ? palette : "midnight";
      const m = mode === "light" ? "light" : "dark";
      host.setAttribute("data-canvas-palette", p);
      host.setAttribute("data-canvas-mode", m);
      host.setAttribute("data-theme", m);
      if (typeof DARK !== "undefined") DARK = m === "dark";
      if (typeof THEMES !== "undefined" && typeof THEME !== "undefined") THEME = themeMap[p + "-" + m] || THEMES[m];
      if (typeof syncTheme === "function") syncTheme();
      if (typeof draw === "function") draw();
    },
    unmount() {
      if (typeof resizeHandler === "function") window.removeEventListener("resize", resizeHandler);
    }
  };`);

  const api = runner(scoped, window, shadow, mount, CANVAS_CALC_THEMES);
  const resizeHandler = () => shadow.dispatchEvent(new Event("gcalc-resize"));
  window.addEventListener("resize", resizeHandler);

  const originalUnmount = api.unmount;
  api.unmount = () => { originalUnmount(); mount.replaceChildren(); };
  window.__gcalcInstance = api;
  api.setTheme(settings().theme, settings().mode);
}
