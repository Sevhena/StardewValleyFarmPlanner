/**
 * renderSetup.js — Setup bar and plot editor rendering
 * ──────────────────────────────────────────────────────
 * Handles everything inside the "Farm setup" section at the top of the page:
 *   - syncFormFromState()  — push STATE values into form fields
 *   - renderPlots()        — render the plot editor rows
 *   - refreshPlotSummary() — update the tile/block count summary tiles
 *   - updateStatusBanner() — refresh the season/day/gold banner strip
 *   - addPlot() / removePlot() — plot CRUD
 *
 * Depends on: data.js, gameCalc.js, state.js
 */


// ─── SYNC FORM FROM STATE ─────────────────────────────────────────────────────

/**
 * Push all current STATE values into the DOM form fields.
 * Called on initial load and after importing saved state.
 * Does NOT trigger a full re-render — call renderAll() separately.
 */
function syncFormFromState() {
  document.getElementById("s-season").value = STATE.season;
  document.getElementById("s-day").value    = STATE.day;
  document.getElementById("s-year").value   = STATE.year;
  document.getElementById("s-gold").value   = STATE.gold;
  document.getElementById("s-farm").value   = STATE.farmType;
  document.getElementById("s-level").value  = STATE.level;

  // Animal counts
  ["chicken", "duck", "rabbit", "cow", "goat", "sheep", "pig", "ostrich", "dino"]
    .forEach(animalType => {
      const input = document.getElementById("a-" + animalType);
      if (input) input.value = STATE.animals[animalType] || 0;
    });

  // Equipment toggle tags
  document.querySelectorAll(".etag").forEach(tag => {
    const equipName = tag.dataset.e;
    const isOwned = (STATE.equipment || []).includes(equipName);
    tag.classList.toggle("on", isOwned);

    // Re-bind click handler (in case this runs after a fresh DOM render)
    tag.onclick = () => {
      STATE.equipment = STATE.equipment || [];
      if (STATE.equipment.includes(equipName)) {
        STATE.equipment = STATE.equipment.filter(e => e !== equipName);
      } else {
        STATE.equipment = [...STATE.equipment, equipName];
      }
      tag.classList.toggle("on", STATE.equipment.includes(equipName));
    };
  });

  updateStatusBanner();
}


// ─── STATUS BANNER ────────────────────────────────────────────────────────────

/**
 * Update the four summary cards (season, day, days left, gold) and progress bar.
 * Called whenever day/season/gold changes without a full re-render.
 */
function updateStatusBanner() {
  const seasonColourClasses = {
    Spring: "s-spring",
    Summer: "s-summer",
    Fall:   "s-fall",
    Winter: "s-winter",
  };

  const seasonEl = document.getElementById("m-season");
  seasonEl.textContent = STATE.season;
  seasonEl.className   = "bcard-val " + (seasonColourClasses[STATE.season] || "");

  document.getElementById("m-day").textContent  = STATE.day;
  document.getElementById("m-dl").textContent   = getDaysLeft() - 1;
  document.getElementById("m-gold").textContent = Number(STATE.gold).toLocaleString() + "g";

  const progressPercent = Math.round((STATE.day - 1) / 28 * 100);
  document.getElementById("s-prog").style.width = progressPercent + "%";
}


// ─── PLOT EDITOR ──────────────────────────────────────────────────────────────

/**
 * Render all plot editor rows from STATE.plots.
 * Each row lets the user edit: name, width, height, count, type, sprinkler, fertilizer.
 * The usable tile count is displayed below each row.
 * Also refreshes the plot summary tiles.
 */
function renderPlots() {
  const container = document.getElementById("plot-rows");
  container.innerHTML = "";

  const plotTypeOptions = {
    income: "Income (single crop)",
    giant:  "Giant crops",
    supply: "Supply / mill",
  };

  STATE.plots.forEach((plot, plotIndex) => {
    const plotItem = document.createElement("div");
    plotItem.className = "plot-item";

    // Build option HTML strings for the three dropdowns
    const typeOptionsHtml = Object.entries(plotTypeOptions)
      .map(([value, label]) =>
        `<option value="${value}"${plot.type === value ? " selected" : ""}>${label}</option>`
      ).join("");

    const sprinklerOptionsHtml = Object.entries(SPRINKLER_CONFIGS)
      .map(([value, cfg]) =>
        `<option value="${value}"${(plot.sprinkler || "inner") === value ? " selected" : ""}>${cfg.label}</option>`
      ).join("");

    const fertilizerOptionsHtml = Object.entries(FERTILIZER_CONFIGS)
      .map(([value, cfg]) =>
        `<option value="${value}"${(plot.boost || "none") === value ? " selected" : ""}>${cfg.label}</option>`
      ).join("");

    const usableTileCount = calcUsableTiles(plot);
    const grossTileCount  = plot.w * plot.h * plot.count;
    const fertilizerNote  = (plot.boost && plot.boost !== "none")
      ? ` · ${FERTILIZER_CONFIGS[plot.boost].label}` : "";

    plotItem.innerHTML = `
      <div class="plot-r1">
        <input class="pi" type="text" value="${plot.name}" placeholder="Name"
          onchange="STATE.plots[${plotIndex}].name = this.value">

        <input class="pi" type="number" value="${plot.w}" min="1" max="300"
          onchange="STATE.plots[${plotIndex}].w = +this.value || 1; renderPlots()">

        <input class="pi" type="number" value="${plot.h}" min="1" max="300"
          onchange="STATE.plots[${plotIndex}].h = +this.value || 1; renderPlots()">

        <input class="pi" type="number" value="${plot.count}" min="1" max="50"
          onchange="STATE.plots[${plotIndex}].count = +this.value || 1; renderPlots()">

        <select class="pis" onchange="STATE.plots[${plotIndex}].type = this.value; renderPlots()">
          ${typeOptionsHtml}
        </select>

        <select class="pis" onchange="STATE.plots[${plotIndex}].sprinkler = this.value; renderPlots()">
          ${sprinklerOptionsHtml}
        </select>

        <select class="pis" onchange="STATE.plots[${plotIndex}].boost = this.value; renderPlots()">
          ${fertilizerOptionsHtml}
        </select>

        <button class="plot-del" onclick="removePlot(${plotIndex})" aria-label="Remove plot">✕</button>
      </div>
      <div style="font-size:10px;color:var(--txt3);margin-top:3px">
        ${usableTileCount} usable / ${grossTileCount} gross tiles${fertilizerNote}
      </div>`;

    container.appendChild(plotItem);
  });

  refreshPlotSummary();
}

/**
 * Update the four summary tiles below the plot editor:
 *   Income tiles | Giant 3×3 blocks | Supply tiles | Winter hay needed
 */
function refreshPlotSummary() {
  updateStatusBanner();

  const incomeTiles    = getTotalIncomeTiles();
  const supplyTiles    = getTotalSupplyTiles();
  const giantBlocks    = getTotalGiantBlocks();
  const giantTiles     = getTotalGiantTiles();
  const winterHay      = calcWinterHayNeeded(STATE.animals);

  document.getElementById("plot-sum").innerHTML = `
    <div class="psc">
      <div class="psc-lbl">Income tiles</div>
      <div class="psc-val">${incomeTiles}</div>
    </div>
    <div class="psc">
      <div class="psc-lbl">Giant 3×3 blocks</div>
      <div class="psc-val">${giantBlocks} <span style="font-size:12px;font-weight:400">(${giantTiles}t)</span></div>
    </div>
    <div class="psc">
      <div class="psc-lbl">Supply tiles</div>
      <div class="psc-val">${supplyTiles}</div>
    </div>
    <div class="psc">
      <div class="psc-lbl">Winter hay needed</div>
      <div class="psc-val">${winterHay}</div>
    </div>`;
}


// ─── PLOT CRUD ────────────────────────────────────────────────────────────────

/** Add a new default plot to STATE and re-render the plot editor. */
function addPlot() {
  STATE.plots.push({
    name: "New plot",
    w: 5, h: 5, count: 1,
    type: "income",
    sprinkler: "inner",
    boost: "none",
  });
  renderPlots();
}

/**
 * Remove a plot by index from STATE and trigger a full seasonal re-render.
 * @param {number} plotIndex — index in STATE.plots
 */
function removePlot(plotIndex) {
  STATE.plots.splice(plotIndex, 1);
  renderPlots();
  renderAll();
}
