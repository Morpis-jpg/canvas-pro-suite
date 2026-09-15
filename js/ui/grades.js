import { pct, esc } from "../utils.js";

const GPA_SCALE = { "A+": 4.0, "A": 4.0, "A-": 3.7, "B+": 3.3, "B": 3.0, "B-": 2.7, "C+": 2.3, "C": 2.0, "C-": 1.7, "D+": 1.3, "D": 1.0, "D-": 0.7, "F": 0.0 };

// Robust letter→points lookup. Normalizes case/marks and falls back to a
// standard letter derived from the numeric score when Canvas didn't hand us a
// letter (so a scored course is never silently counted as 0.0 in the GPA).
function gpaLetterFor(c) {
  let g = String(c.currentGrade || "").trim().toUpperCase();
  if (!g && c.currentScore != null) {
    const s = c.currentScore;
    if (s >= 93) g = "A";
    else if (s >= 90) g = "A-";
    else if (s >= 87) g = "B+";
    else if (s >= 83) g = "B";
    else if (s >= 80) g = "B-";
    else if (s >= 77) g = "C+";
    else if (s >= 73) g = "C";
    else if (s >= 70) g = "C-";
    else if (s >= 67) g = "D+";
    else if (s >= 63) g = "D";
    else if (s >= 60) g = "D-";
    else g = "F";
  }
  return g && GPA_SCALE[g] != null ? g : null;
}

export function render(state, root) {
  const { courses } = state.data;

  const graded = courses.filter((c) => gpaLetterFor(c) != null);
  const currentGPA = graded.length
    ? graded.reduce((a, c) => a + GPA_SCALE[gpaLetterFor(c)], 0) / graded.length
    : 0;
  const onTrack = courses.filter((c) => c.currentScore != null && c.currentScore >= c.targetGrade).length;

  const rows = courses.map((c) => {
    const score = c.currentScore;
    const delta = score != null ? Math.round((score - c.targetGrade) * 10) / 10 : null;
    const status = delta == null ? "No grade yet"
      : delta >= 0 ? "On track"
      : delta >= -4 ? "At risk"
      : "In danger";
    const tag = delta == null ? "tag-blue" : delta >= 0 ? "tag-green" : delta >= -4 ? "tag-yellow" : "tag-red";
    return `
      <tr>
        <td><b>${esc(c.name)}</b><div class="small muted">${esc(c.type)} · target ${c.targetGrade}%</div></td>
        <td><span class="grade-pill ${c.currentGrade ? (delta >= 0 ? "grade-high" : "grade-low") : ""}">${esc(c.currentGrade || "—")}</span></td>
        <td><b>${pct(score)}</b></td>
        <td><b class="${delta != null && delta >= 0 ? "" : "grade-low"}">${delta != null ? (delta >= 0 ? "+" : "") + delta : "—"}</b></td>
        <td><span class="tag ${tag}">${status}</span></td>
      </tr>`;
  }).join("");

  root.innerHTML = `
    <h1>Grades</h1>
    <p class="subtitle">Targets follow <b>your GPA rule</b>: AP/IB classes are fine at a B (83%), honors at B+ (88%), regular classes need an A (93%) to keep a 4.0. Edit in Settings.</p>

    <div class="grid grid-3 mt">
      <div class="card"><div class="small muted">GPA (estimate, unweighted)</div><div class="stat"><b>${currentGPA.toFixed(2)}</b></div></div>
      <div class="card"><div class="small muted">On track for target</div><div class="stat"><b>${onTrack}</b> / ${courses.length}</div></div>
      <div class="card"><div class="small muted">Weighted towards</div><div class="stat"><b>${graded.length ? (Math.max(0, Math.min(5, currentGPA + 0.1 * courses.filter(c => c.type === "ap").length))).toFixed(2) : "—"}</b> <span class="muted small">(AP ×0.1)</span></div></div>
    </div>

    <div class="card mt"><div class="table-wrap"><table>
      <thead><tr><th>Class</th><th>Letter</th><th>% Score</th><th>vs target</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>

    <div class="card mt">
      <div class="small muted">What this means: an A (93+) in regular classes and a B (83+) in an AP class both keep your GPA at 4.0. The priority system uses these exact targets to decide what actually needs your time.</div>
    </div>
  `;
}