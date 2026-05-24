/**
 * state.js — Application state and persistence
 * ─────────────────────────────────────────────
 * Single source of truth for all mutable app state.
 *
 * Sections:
 *   STATE — the live state object (mutated in place throughout the app)
 *   Persistence — load() and save() via window.storage
 *   Accessors — convenience helpers that read from STATE
 */


// ─── STATE ────────────────────────────────────────────────────────────────────

/**
 * The global app state object.
 * All UI reads from here; all saves write here before persisting.
 *
 * Shape:
 *   season          — current in-game season name
 *   day             — current in-game day (1–28)
 *   year            — current in-game year
 *   gold            — current gold on hand
 *   farmType        — selected farm type (cosmetic, not yet used in calculations)
 *   level           — farming skill level (not yet used in calculations)
 *   equipment       — string[] of owned equipment names (matched against ARTISAN_CHAINS)
 *   animals         — map of { animalType: count }
 *   plots           — array of plot definition objects (see plot shape below)
 *   giantCropAltIdx — which giant crop variant is currently selected (cycles on toggle)
 *   supplyPlotMode  — "feed" = grow hay/feed first | "variety" = all variety crops
 *   flowerAltIdx    — which flower is assigned to the smallest income plot (cycles on toggle)
 *   incomeManual    — whether manual plot assignment mode is active
 *   incomeAssignments — manual assignments: { cropName: { defIdx: count } }
 *
 * Plot definition shape:
 *   name       — display name for the plot
 *   w, h       — width and height in tiles
 *   count      — number of identical plots of this definition
 *   type       — "income" | "giant" | "supply"
 *   sprinkler  — key into SPRINKLER_CONFIGS
 *   boost      — key into FERTILIZER_CONFIGS
 */
let STATE = {
  season: "Spring",
  day: 1,
  year: 3,
  gold: 2000000,
  farmType: "Standard",
  level: 10,

  equipment: [
    "Keg", "Preserves Jar", "Oil Maker", "Mayonnaise Machine", "Cheese Press",
    "Loom", "Seed Maker", "Mill", "Cask", "Bee House", "Dehydrator",
    "Recycling Machine", "Crab Pot", "Furnace", "Crystalarium", "Greenhouse",
  ],

  animals: {
    chicken: 4, duck: 4, rabbit: 4,
    cow: 4, goat: 4, sheep: 0,
    pig: 6, ostrich: 0, dino: 0,
  },

  plots: [
    { name: "3×3 plots", w: 3, h: 3, count: 12, type: "income", sprinkler: "quality", boost: "none" },
    { name: "5×5 plots", w: 5, h: 5, count: 4, type: "income", sprinkler: "iridium", boost: "none" },
    { name: "Large plot A", w: 10, h: 15, count: 1, type: "giant", sprinkler: "iridium", boost: "none" },
    { name: "Long plot", w: 10, h: 10, count: 1, type: "supply", sprinkler: "iridium", boost: "none" },
  ],

  // Toggle state — persisted across saves so user's preferred mode survives refresh
  giantCropAltIdx: 0,       // index into the available giant crops array
  supplyPlotMode: "feed",  // "feed" | "variety"
  flowerAltIdx: 0,       // index into the available flower crops array
  seasonChanged: true,   // whether the season has been changed since last load
  incomeManual: false,   // true = manual assignment mode
  incomeAssignments: {},      // { cropName: { defIdx: count } }
};

/** Storage key used for window.storage persistence */
const STORAGE_KEY = "sdv_v9";


// ─── PERSISTENCE ──────────────────────────────────────────────────────────────

/**
 * Load persisted state from window.storage and merge it into STATE.
 * Missing or new fields fall back to the defaults defined above.
 * After loading, triggers a full UI redraw.
 */
async function loadState() {
  try {
    const result = await window.storage.get(STORAGE_KEY);
    if (result) {
      const persisted = JSON.parse(result.value);
      // Merge persisted fields over defaults (new fields in defaults survive)
      Object.assign(STATE, persisted);
      // Ensure every plot has required fields that may not exist in older saves
      STATE.plots = STATE.plots.map(plot => ({
        sprinkler: "inner",
        boost: "none",
        ...plot,
      }));
      // Ensure toggle state fields have valid defaults if absent from old saves
      STATE.giantCropAltIdx = STATE.giantCropAltIdx ?? 0;
      STATE.supplyPlotMode = STATE.supplyPlotMode ?? "feed";
      STATE.flowerAltIdx = STATE.flowerAltIdx ?? 0;
      STATE.incomeManual = STATE.incomeManual ?? false;
      STATE.incomeAssignments = STATE.incomeAssignments ?? {};
    }
  } catch (err) {
    console.warn("Could not load saved state:", err);
  }

  // Full redraw after load
  syncFormFromState();
  renderPlots();
  renderAll();
  renderGreenhouse();
  renderArtisan();
  renderSeedMaker();
}

/**
 * Persist the current STATE to window.storage.
 * Called automatically by saveAndRefresh() and toggle handlers.
 */
async function saveState() {
  try {
    await window.storage.set(STORAGE_KEY, JSON.stringify(STATE));
  } catch (err) {
    console.warn("Could not save state:", err);
  }
}


// ─── ACCESSORS ────────────────────────────────────────────────────────────────

/** Returns all plots of type "income", sorted largest-first by tile count. */
function getIncomePlots() {
  return STATE.plots
    .filter(p => p.type === "income")
    .sort((a, b) => b.w * b.h - a.w * a.h);
}

/** Returns all plots of type "giant". */
function getGiantPlots() {
  return STATE.plots.filter(p => p.type === "giant");
}

/** Returns all plots of type "supply". */
function getSupplyPlots() {
  return STATE.plots.filter(p => p.type === "supply");
}

/** Total usable tiles across all income plots. */
function getTotalIncomeTiles() {
  return getIncomePlots().reduce((sum, p) => sum + calcUsableTiles(p), 0);
}

/** Total usable tiles across all supply plots. */
function getTotalSupplyTiles() {
  return getSupplyPlots().reduce((sum, p) => sum + calcUsableTiles(p), 0);
}

/** Total usable tiles across all giant plots. */
function getTotalGiantTiles() {
  return getGiantPlots().reduce((sum, p) => sum + calcUsableTiles(p), 0);
}

/** Total number of 3×3 giant-crop blocks across all giant plots. */
function getTotalGiantBlocks() {
  return getGiantPlots().reduce((sum, p) => sum + calcGiantCropBlocks(p), 0);
}

/** Days remaining in the current season (inclusive of today). */
function getDaysLeft() {
  return 28 - STATE.day + 1;
}

/**
 * Check whether a piece of equipment is currently owned.
 * @param {string} equipmentName
 * @returns {boolean}
 */
function ownsEquipment(equipmentName) {
  return (STATE.equipment || []).includes(equipmentName);
}

/**
 * Check whether the player owns at least one animal of a given type.
 * @param {string} animalType — key in STATE.animals (e.g. "pig")
 * @returns {boolean}
 */
function ownsAnimal(animalType) {
  return (STATE.animals[animalType] || 0) > 0;
}
