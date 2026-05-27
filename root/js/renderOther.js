/**
 * renderOther.js — Greenhouse, Artisan & Animals, and Seed Maker tab rendering
 * ──────────────────────────────────────────────────────────────────────────────
 * All HTML fragment construction is delegated to templates.js.
 *
 * Functions:
 *   renderGreenhouse() — greenhouse crops + fruit trees reference cards
 *   renderArtisan()    — active processing chains + forage pairings + full reference
 *   renderSeedMaker()  — priority-ranked seed maker recommendations
 *
 * Depends on: data.js, gameCalc.js, state.js, templates.js
 */


// ─── GREENHOUSE ───────────────────────────────────────────────────────────────

function renderGreenhouse() {
  document.getElementById("gh-content").innerHTML =
    GREENHOUSE_CROPS.map(crop => tplGreenhouseCard(crop)).join("");

  document.getElementById("tree-content").innerHTML =
    FRUIT_TREES.map(tree => tplTreeCard(tree)).join("");
}


// ─── ARTISAN & ANIMALS ────────────────────────────────────────────────────────

function renderArtisan() {
  const ownedEquipment = STATE.equipment || [];
  const animals = STATE.animals || {};

  const activeChains = ARTISAN_CHAINS.filter(chain =>
    (!chain.req.equip || ownedEquipment.includes(chain.req.equip)) &&
    (!chain.req.animal || (animals[chain.req.animal] || 0) > 0)
  );
  const lockedByEquipment = ARTISAN_CHAINS.filter(chain =>
    !activeChains.includes(chain) &&
    chain.req.equip &&
    !ownedEquipment.includes(chain.req.equip)
  );
  const lockedByAnimal = ARTISAN_CHAINS.filter(chain =>
    !activeChains.includes(chain) &&
    !lockedByEquipment.includes(chain)
  );

  // ── Active chains section
  let activeHtml = "";
  if (!activeChains.length) {
    activeHtml = tplEmpty("No active chains — add equipment and animals in setup.");
  } else {
    activeHtml = `<div class="two-grid">${activeChains.map(chain => tplArtisanCard(chain)).join("")}</div>`;

    if (lockedByEquipment.length) {
      activeHtml += `<div class="locked-list">
        <strong>Unlock with equipment:</strong>
        ${lockedByEquipment.map(c => `${c.name} (needs ${c.req.equip})`).join(", ")}
      </div>`;
    }
    if (lockedByAnimal.length) {
      activeHtml += `<div class="locked-list">
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
    forageArtisanEl.innerHTML = tplEmpty(fallbackMsg);
  } else {
    let forageHtml = "";
    if (STATE.season === "Winter") {
      forageHtml += tplTipBox(
        `<strong>Winter priority:</strong> No outdoor crops — forage is your primary artisan input.
        Keep Kegs and Jars running on winter forage.`
      );
    }
    forageHtml += `<div class="artisan-intro">These ${STATE.season} forage items pair with your equipment:</div>`;
    forageHtml += `<div class="forage-grid">${foragePairings.map(item => tplForageCard(item, true)).join("")}</div>`;
    forageArtisanEl.innerHTML = forageHtml;
  }

  // ── Full reference (all chains)
  document.getElementById("art-content").innerHTML =
    ARTISAN_CHAINS.map(chain => tplArtisanCard(chain)).join("");
}


// ─── SEED MAKER ───────────────────────────────────────────────────────────────

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

  // Build the upcoming 3 seasons list
  const currentSeasonIndex = SEASONS.indexOf(STATE.season);
  const upcomingSeasons = [];
  for (let offset = 1; offset <= 3; offset++) {
    const nextIndex = (currentSeasonIndex + offset) % 4;
    if (nextIndex !== currentSeasonIndex) upcomingSeasons.push(SEASONS[nextIndex]);
  }

  // Score every crop for Seed Maker priority
  const rankedCrops = CROPS.map(crop => {
    const isNeededUpcoming = upcomingSeasons.some(s => crop.seasons.includes(s));
    const isExpensive = crop.cost >= 100;
    const isSpecialSource = !!crop.src;
    const smPriorityHint = crop.smP;

    let priorityScore = 0;
    let priorityClass = "pp-low";
    let priorityReason = "";

    if (smPriorityHint === "urgent" || (isExpensive && isSpecialSource)) {
      priorityScore = 4;
      priorityClass = "pp-urgent";
      priorityReason = "Expensive / special source — huge savings from Seed Maker.";
    } else if (smPriorityHint === "high" || (isExpensive && isNeededUpcoming)) {
      priorityScore = 3;
      priorityClass = "pp-high";
      priorityReason = "High value, needed in upcoming season.";
    } else if (smPriorityHint === "medium" || (isNeededUpcoming && crop.cost >= 60)) {
      priorityScore = 2;
      priorityClass = "pp-medium";
      priorityReason = "Good value in upcoming season.";
    } else if (isNeededUpcoming) {
      priorityScore = 1;
      priorityClass = "pp-low";
      priorityReason = "Useful in upcoming season.";
    }

    const nextNeededSeason = upcomingSeasons.find(s => crop.seasons.includes(s));
    return { ...crop, _score: priorityScore, _class: priorityClass, _reason: priorityReason, _nextSeason: nextNeededSeason };
  })
    .filter(c => c._score > 0)
    .sort((a, b) => b._score - a._score || a.name.localeCompare(b.name));

  const topPriority = rankedCrops.filter(c => c._score >= 3);
  const goodToProcess = rankedCrops.filter(c => c._score < 3);

  let html = "";

  html += '<div class="two-grid">'

  if (topPriority.length) {
    html += tplSeedMakerCard(
      "pp-urgent",
      "★ Top Priority",
      "process these first",
      topPriority.map(c => tplSeedMakerRow(c)).join("")
    );
  }

  if (goodToProcess.length) {
    html += tplSeedMakerCard(
      "pp-medium",
      "Good to process",
      "when you have spare crops",
      goodToProcess.map(c => tplSeedMakerRow(c)).join("")
    );
  }

  html += '</div>';

  html += tplTipBox(
    `<strong>How it works:</strong> Put any crop in → get 1–3 seeds back (avg ~2).
    Starfruit (400g/seed) or Sweet Gem Berry (1000g/seed) compound quickly.
    For regrow crops like Strawberry, process a handful at end of season to build stock for next year.`
  );

  contentEl.innerHTML = html;
}