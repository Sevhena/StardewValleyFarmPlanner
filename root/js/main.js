/**
 * main.js — Application entry point
 * ───────────────────────────────────
 * Wires together all modules and provides the top-level functions called
 * by inline onclick handlers in index.html.
 *
 * Responsibilities:
 *   - saveAndRefresh() — read form fields → update STATE → persist → full re-render
 *   - showTab()        — tab panel switching
 *   - load on DOMContentLoaded
 *
 * All modules must be loaded before this file (see <script> order in index.html):
 *   data.js → gameCalc.js → state.js → plotLogic.js → renderSetup.js → renderSeasonal.js → renderOther.js → main.js
 */


// ─── SAVE & REFRESH ───────────────────────────────────────────────────────────

/**
 * Read all form field values into STATE, persist to storage, and trigger a
 * full re-render of every tab. Called by the "Save & refresh all" button.
 *
 * This is the primary way user edits take effect — all other render calls
 * read from STATE, so nothing updates until this is called.
 */
function saveAndRefresh() {
  // ── Core farm parameters
  if (STATE.season !== document.getElementById("s-season").value || STATE.day !== parseInt(document.getElementById("s-day").value)) {
    STATE.incomeAssignments = {}; // Clear income assignments when season changes, since they may no longer apply
    STATE.seasonChanged = true;
  }
  STATE.season = document.getElementById("s-season").value;
  STATE.day = parseInt(document.getElementById("s-day").value) || 1;
  STATE.year = parseInt(document.getElementById("s-year").value) || 1;
  STATE.gold = parseInt(document.getElementById("s-gold").value) || 0;
  STATE.farmType = document.getElementById("s-farm").value;
  STATE.level = parseInt(document.getElementById("s-level").value) || 0;

  // ── Animal counts
  ["chicken", "duck", "rabbit", "cow", "goat", "sheep", "pig", "ostrich", "dino"]
    .forEach(animalType => {
      const input = document.getElementById("a-" + animalType);
      if (input) STATE.animals[animalType] = parseInt(input.value) || 0;
    });

  // Equipment list is already updated live by the etag onclick handlers
  // (see syncFormFromState in renderSetup.js), so no read needed here.

  saveState();

  // Full re-render in dependency order
  renderPlots();
  renderAll();
  renderArtisan();
  renderSeedMaker();

  console.log("Saved state:", STATE);
}


// ─── TAB SWITCHING ────────────────────────────────────────────────────────────

/**
 * Switch the visible tab panel.
 * Updates tab button active states and shows the matching panel.
 *
 * @param {string} tabId — one of: "seasonal" | "greenhouse" | "artisan" | "seedmaker"
 */
function showTab(tabId) {
  const tabOrder = ["seasonal", "greenhouse", "artisan", "seedmaker"];

  document.querySelectorAll(".tab").forEach((btn, index) => {
    btn.classList.toggle("active", tabOrder[index] === tabId);
  });

  document.querySelectorAll(".panel").forEach(panel => {
    panel.classList.remove("active");
  });

  document.getElementById("tab-" + tabId).classList.add("active");
}


// ─── BOOTSTRAP ────────────────────────────────────────────────────────────────

/**
 * Application entry point.
 * Loads persisted state (which also triggers the initial full render).
 * loadState() is defined in state.js and calls all render functions
 * once STATE has been populated.
 */
document.addEventListener("DOMContentLoaded", () => {
  loadState();
});
