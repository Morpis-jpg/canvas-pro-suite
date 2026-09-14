import { settings } from "../storage.js";

function syncFrameTheme(frame) {
  frame.contentWindow?.postMessage({
    type: "canvas-pro-theme",
    mode: settings().mode,
  }, "*");
}

export function render(_state, root) {
  root.innerHTML = `
    <div class="calculator-tool">
      <div class="calculator-tool-head">
        <div>
          <h1>Calculator</h1>
          <p class="subtitle">Graphing, scientific, CAS, AP science, SAT &amp; ACT references, and 3D shape formulas.</p>
        </div>
        <span class="badge badge-beta">FULL TOOL</span>
      </div>
      <iframe id="calculatorFrame" class="calculator-frame" src="tools/calculator/index.html?embedded=1" title="Canvas Pro Calculator"></iframe>
    </div>
  `;

  const frame = root.querySelector("#calculatorFrame");
  frame.addEventListener("load", () => syncFrameTheme(frame), { once: true });
  syncFrameTheme(frame);
}
