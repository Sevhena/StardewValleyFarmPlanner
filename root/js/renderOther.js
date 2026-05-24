/**
 * renderOther.js — Greenhouse, Artisan & Animals, and Seed Maker tab rendering
 * ──────────────────────────────────────────────────────────────────────────────
 * These three tabs are largely static reference panels that update based on
 * owned equipment and animals rather than dynamic seasonal calculations.
 *
 * Functions:
 *   renderGreenhouse() — greenhouse crops + fruit trees reference cards
 *   renderArtisan()    — active processing chains + forage pairings + full reference
 *   renderSeedMaker()  — priority-ranked seed maker recommendations
 *
 * Depends on: data.js, gameCalc.js, state.js
 */


// ─── GREENHOUSE ───────────────────────────────────────────────────────────────

/**
 * Render the Greenhouse tab.
 * Shows two sections:
 *   1. Greenhouse crops (GREENHOUSE_CROPS) — ranked permanent crops
 *   2. Fruit trees (FRUIT_TREES) — border planting guide
 *
 * Content is static (doesn't change with season/day) but re-renders on save
 * in case future logic ties into equipment (e.g. Keg owned → show wine value).
 */
function renderGreenhouse() {
  // ── Greenhouse crops: ranked cards with growth schedule and value metric
  document.getElementById("gh-content").innerHTML = GREENHOUSE_CROPS.map(crop => `
    <div class="gh-card">
      <h3>
        <span class="badge ${crop.badge}" style="margin-right:4px">#${crop.p}</span>
        ${crop.name}
      </h3>
      <div class="gh-row">
        <span class="gh-lbl">Growth</span>
        <span class="gh-val">${crop.grow}</span>
      </div>
      <div class="gh-row">
        <span class="gh-lbl">Value</span>
        <span class="gh-val">${crop.val}</span>
      </div>
      <div class="tip-box">${crop.note}</div>
    </div>`
  ).join("");

  // ── Fruit trees: border planting reference
  document.getElementById("tree-content").innerHTML = FRUIT_TREES.map(tree => `
    <div class="gh-card">
      <h3>
        <span class="badge ${tree.badge}" style="margin-right:4px">${tree.sell}</span>
        ${tree.name}
      </h3>
      <div class="tip-box">${tree.note}</div>
    </div>`
  ).join("");
}


// ─── ARTISAN & ANIMALS ────────────────────────────────────────────────────────

/**
 * Render the Artisan & Animals tab.
 * Three sections:
 *   1. Active chains  — only chains where player owns required equipment AND animals
 *   2. Forage pairings — current season's forage items that pair with owned equipment
 *   3. All chains reference — full ARTISAN_CHAINS table regardless of ownership
 */
function renderArtisan() {
  const ownedEquipment = STATE.equipment || [];
  const animals        = STATE.animals   || {};

  // Partition chains into active / locked-by-equipment / locked-by-animal
  const activeChains         = ARTISAN_CHAINS.filter(chain =>
    (!chain.req.equip  || ownedEquipment.includes(chain.req.equip)) &&
    (!chain.req.animal || (animals[chain.req.animal] || 0) > 0)
  );
  const lockedByEquipment    = ARTISAN_CHAINS.filter(chain =>
    !activeChains.includes(chain) &&
    chain.req.equip &&
    !ownedEquipment.includes(chain.req.equip)
  );
  const lockedByAnimal       = ARTISAN_CHAINS.filter(chain =>
    !activeChains.includes(chain) &&
    !lockedByEquipment.includes(chain)
  );

  // ── Active chains section
  let activeHtml = "";
  if (!activeChains.length) {
    activeHtml = `<div style="color:var(--txt3)">No active chains — add equipment and animals in setup.</div>`;
  } else {
    activeHtml = `<div class="two-grid">` +
      activeChains.map(chain => _buildArtisanCard(chain)).join("") +
      `</div>`;

    if (lockedByEquipment.length) {
      activeHtml += `<div style="margin-top:8px;font-size:12px;color:var(--txt3)">
        <strong>Unlock with equipment:</strong>
        ${lockedByEquipment.map(c => `${c.name} (needs ${c.req.equip})`).join(", ")}
      </div>`;
    }
    if (lockedByAnimal.length) {
      activeHtml += `<div style="margin-top:4px;font-size:12px;color:var(--txt3)">
        <strong>Unlock with animals:</strong>
        ${lockedByAnimal.map(c => `${c.name} (needs ${c.req.animal})`).join(", ")}
      </div>`;
    }
  }
  document.getElementById("art-active").innerHTML = activeHtml;

  // ── Seasonal forage → artisan pairings
  const foragePairings = (FORAGE[STATE.season] || [])
    .filter(item => item.artisan && ownsEquipment(item.artisan));

  const forageArtisanEl = document.getElementById("forage-artisan");
  if (!foragePairings.length) {
    const fallbackMsg = STATE.season === "Winter"
      ? "Winter forage (Snow Yam, Winter Root, Crystal Fruit) pairs with Kegs and Preserves Jars — enable them in setup."
      : "No forage-artisan pairings with current equipment this season.";
    forageArtisanEl.innerHTML = `<div style="font-size:12px;color:var(--txt3)">${fallbackMsg}</div>`;
  } else {
    let forageHtml = "";
    if (STATE.season === "Winter") {
      forageHtml += `<div class="tip-box" style="margin-bottom:10px">
        <strong>Winter priority:</strong> No outdoor crops — forage is your primary artisan input.
        Keep Kegs and Jars running on winter forage.
      </div>`;
    }
    forageHtml += `<div style="font-size:12px;color:var(--txt2);margin-bottom:8px">
      These ${STATE.season} forage items pair with your equipment:
    </div>
    <div class="forage-grid">
      ${foragePairings.map(item => `
        <div class="fcrd">
          <div class="fcrd-name">
            ${item.name} → <span class="badge bg-purple" style="font-size:9px">${item.artisan}</span>
          </div>
          <div class="fcrd-sell">${item.sell}g raw</div>
          <div class="fcrd-note">${item.note}</div>
        </div>`
      ).join("")}
    </div>`;
    forageArtisanEl.innerHTML = forageHtml;
  }

  // ── Full reference (all chains regardless of ownership)
  document.getElementById("art-content").innerHTML =
    ARTISAN_CHAINS.map(chain => _buildArtisanCard(chain)).join("");
}

/**
 * Build a single artisan chain gh-card HTML string.
 * Used in both the active section and the full reference section.
 *
 * @param {object} chain — entry from ARTISAN_CHAINS
 * @returns {string} HTML
 */
function _buildArtisanCard(chain) {
  return `<div class="gh-card">
    <h3>
      ${chain.icon}
      <span class="badge ${chain.badge}" style="font-size:9px">#${chain.p}</span>
      ${chain.name}
    </h3>
    <div class="gh-row">
      <span class="gh-lbl">Machine</span>
      <span class="gh-val" style="font-size:11px">${chain.machine}</span>
    </div>
    <div class="gh-row">
      <span class="gh-lbl">Input</span>
      <span class="gh-val" style="font-size:11px">${chain.raw}</span>
    </div>
    <div class="gh-row">
      <span class="gh-lbl">Output</span>
      <span class="gh-val" style="font-size:11px;color:#27500A">${chain.out}</span>
    </div>
    <div class="tip-box">${chain.note}</div>
  </div>`;
}


// ─── SEED MAKER ───────────────────────────────────────────────────────────────

/**
 * Render the Seed Maker tab.
 * Ranks all crops by how much the Seed Maker saves you in seed costs,
 * with extra weight given to upcoming-season crops and special-source crops.
 *
 * Priority tiers (displayed as pill labels):
 *   urgent (4) — expensive AND special source → massive savings
 *   high   (3) — high cost AND needed next season
 *   medium (2) — decent value in an upcoming season
 *   low    (1) — useful in an upcoming season (shown but lower priority)
 *
 * Only shows results if Seed Maker is toggled on in equipment.
 */
function renderSeedMaker() {
  const hasSeedMaker = ownsEquipment("Seed Maker");

  document.getElementById("sm-intro").textContent = hasSeedMaker
    ? "The Seed Maker converts crops into seeds (avg ~2 per crop). Prioritize expensive or special-source crops to save gold."
    : "Enable Seed Maker in equipment to see recommendations.";

  const contentEl = document.getElementById("sm-content");
  if (!hasSeedMaker) {
    contentEl.innerHTML = "";
    return;
  }

  // Build the upcoming 3 seasons list (wraps around from Winter → Spring)
  const currentSeasonIndex = SEASONS.indexOf(STATE.season);
  const upcomingSeasons = [];
  for (let offset = 1; offset <= 3; offset++) {
    const nextIndex = (currentSeasonIndex + offset) % 4;
    if (nextIndex !== currentSeasonIndex) upcomingSeasons.push(SEASONS[nextIndex]);
  }

  // Score every crop for Seed Maker priority
  const rankedCrops = CROPS.map(crop => {
    const isNeededUpcoming = upcomingSeasons.some(s => crop.seasons.includes(s));
    const isExpensive      = crop.cost >= 100;
    const isSpecialSource  = !!crop.src;
    const smPriorityHint   = crop.smP;

    let priorityScore = 0;
    let priorityClass = "pp-low";
    let priorityReason = "";

    if (smPriorityHint === "urgent" || (isExpensive && isSpecialSource)) {
      priorityScore  = 4;
      priorityClass  = "pp-urgent";
      priorityReason = "Expensive + special source — huge savings from Seed Maker.";
    } else if (smPriorityHint === "high" || (isExpensive && isNeededUpcoming)) {
      priorityScore  = 3;
      priorityClass  = "pp-high";
      priorityReason = "High value, needed in upcoming season.";
    } else if (smPriorityHint === "medium" || (isNeededUpcoming && crop.cost >= 60)) {
      priorityScore  = 2;
      priorityClass  = "pp-medium";
      priorityReason = "Good value in upcoming season.";
    } else if (isNeededUpcoming) {
      priorityScore  = 1;
      priorityClass  = "pp-low";
      priorityReason = "Useful in upcoming season.";
    }

    // Which upcoming season is this crop next needed in?
    const nextNeededSeason = upcomingSeasons.find(s => crop.seasons.includes(s));

    return { ...crop, _score: priorityScore, _class: priorityClass, _reason: priorityReason, _nextSeason: nextNeededSeason };
  })
    .filter(c => c._score > 0)
    .sort((a, b) => b._score - a._score || a.name.localeCompare(b.name));

  const topPriorityCrops    = rankedCrops.filter(c => c._score >= 3);
  const goodToProcessCrops  = rankedCrops.filter(c => c._score < 3);

  let html = "";

  // ── Top priority tier
  if (topPriorityCrops.length) {
    html += `<div class="sm-card">
      <div style="font-size:13px;font-weight:700;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
        <span class="ppill pp-urgent">★ Top Priority</span>
        <span style="font-size:11px;color:var(--txt3);font-weight:400">process these first</span>
      </div>`;
    html += topPriorityCrops.map(crop => _buildSeedMakerRow(crop)).join("");
    html += `</div>`;
  }

  // ── Good to process tier
  if (goodToProcessCrops.length) {
    html += `<div class="sm-card">
      <div style="font-size:13px;font-weight:700;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
        <span class="ppill pp-medium">Good to process</span>
        <span style="font-size:11px;color:var(--txt3);font-weight:400">when you have spare crops</span>
      </div>`;
    html += goodToProcessCrops.map(crop => _buildSeedMakerRow(crop)).join("");
    html += `</div>`;
  }

  // ── How it works explainer
  html += `<div class="tip-box">
    <strong>How it works:</strong> Put any crop in → get 1–3 seeds back (avg ~2).
    Starfruit (400g/seed) or Sweet Gem Berry (1000g/seed) compound quickly.
    For regrow crops like Strawberry, process a handful at end of season to build stock for next year.
  </div>`;

  contentEl.innerHTML = html;
}

/**
 * Build a single seed maker recommendation row.
 *
 * @param {object} crop — crop with computed _score, _class, _reason, _nextSeason fields
 * @returns {string} HTML
 */
function _buildSeedMakerRow(crop) {
  const priorityLabel = crop._score >= 4 ? "urgent"
    : crop._score === 3 ? "high"
    : crop._score === 2 ? "medium"
    : "low";

  return `<div class="sm-row">
    <div>
      <div style="font-weight:700">${crop.name}</div>
      <div style="color:var(--txt2);font-size:11px">${crop._reason}</div>
      <div style="color:var(--txt3);font-size:11px">
        Season: ${crop.seasons.join("+")}
        ${crop._nextSeason ? ` · Next: ${crop._nextSeason}` : ""}
        ${crop.src ? ` · ${crop.src}` : ""}
      </div>
    </div>
    <div style="text-align:right">
      <span class="ppill ${crop._class}">${priorityLabel}</span>
      <div style="font-size:11px;color:var(--txt3);margin-top:3px">${crop.cost}g/seed</div>
    </div>
  </div>`;
}
