/**
 * templates.js — Reusable HTML fragment builders
 * ────────────────────────────────────────────────
 * All HTML generation lives here. Render functions call these helpers
 * instead of embedding markup inline. This keeps render logic readable,
 * makes markup changes a single-file edit, and lets styles live in CSS.
 *
 * Naming convention:
 *   tpl*   — returns an HTML string
 *   Every function is pure: same inputs → same HTML output, no side effects.
 *
 * Sections:
 *   Shared primitives    — badges, tips, labels used everywhere
 *   Buy list fragments   — section headers, item rows, total row
 *   Schedule fragments   — day wrappers, event rows
 *   Forage fragments     — forage card grid
 *   Greenhouse fragments — gh-card, tree card
 *   Artisan fragments    — artisan chain card
 *   Seed Maker fragments — sm-card wrapper, sm-row
 *   Crop table fragments — tbody row
 */


// ═══════════════════════════════════════════════════════════════════════
// SHARED PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Coloured badge chip.
 * @param {string} text       — label text
 * @param {string} colorClass — bg-* CSS class (bg-green, bg-amber, bg-pink …)
 * @param {string} [extra]    — additional inline style or class string
 */
function tplBadge(text, colorClass, extra = "") {
    return `<span class="badge ${colorClass}"${extra ? ` style="${extra}"` : ""}>${text}</span>`;
}

/**
 * Advisory / tip box at the bottom of a card.
 * @param {string} html — inner HTML (may contain <strong> etc.)
 */
function tplTipBox(html) {
    return `<div class="tip-box">${html}</div>`;
}

/**
 * Warning box for upcoming festivals.
 * @param {string} icon — emoji
 * @param {string} name — festival name
 * @param {number} day
 * @param {string} note
 */
function tplFestivalBox(icon, name, day, note) {
    return `<div class="festival-box">${icon} <strong>Day ${day}: ${name}</strong> — ${note}</div>`;
}

/**
 * A small meta line (e.g. "3× 3×3, 1× 5×5") styled as tertiary text.
 * @param {string} text
 */
function tplMetaLine(text) {
    return `<div class="meta-line">${text}</div>`;
}

/**
 * A two-line label+value display (used inside buy-list items and cards).
 * @param {string} label
 * @param {string} value
 * @param {string} [valueClass] — optional extra CSS class on the value span
 */
function tplLabelValue(label, value, valueClass = "") {
    return `<div class="lv-row">
    <span class="lv-lbl">${label}</span>
    <span class="lv-val${valueClass ? " " + valueClass : ""}">${value}</span>
  </div>`;
}

/**
 * A small toggle button (used in buy-list section headers).
 * @param {string}  label     — button text
 * @param {string}  onclick   — onclick attribute string (already-escaped JS)
 * @param {boolean} isAlt     — true → amber "alt" style
 * @param {string}  [title]
 */
function tplToggleBtn(label, onclick, isAlt = false, title = "") {
    return `<button class="toggle-btn${isAlt ? " alt" : ""}"
    onclick="${onclick}"${title ? ` title="${title}"` : ""}>${label}</button>`;
}

/**
 * Section group header used inside the shopping list.
 * @param {string} leftHtml  — left-side label HTML
 * @param {string} rightHtml — right-side controls HTML (buttons, meta text)
 */
function tplBuyHeader(leftHtml, rightHtml = "") {
    return `<div class="bgh">
    <span>${leftHtml}</span>
    ${rightHtml ? `<span class="bgh-right">${rightHtml}</span>` : ""}
  </div>`;
}

/**
 * The grand-total cost row at the bottom of the shopping list.
 * @param {number} totalCost
 * @param {number} goldOnHand
 */
function tplBuyTotal(totalCost, goldOnHand) {
    const remaining = goldOnHand - totalCost;
    const colorClass = remaining >= 0 ? "afford" : "short";
    const suffix = remaining >= 0
        ? `(${remaining.toLocaleString()}g left)`
        : `(short ${Math.abs(remaining).toLocaleString()}g)`;
    return `<div class="buy-total">
    <span>Estimated seed cost</span>
    <span class="buy-total-val ${colorClass}">
      ${totalCost.toLocaleString()}g ${suffix}
    </span>
  </div>`;
}


// ═══════════════════════════════════════════════════════════════════════
// BUY LIST ITEM ROW
// ═══════════════════════════════════════════════════════════════════════

/**
 * A single seed-purchase row in the shopping list.
 *
 * @param {object} opts
 *   .titleHtml    — crop name + optional badge HTML (left col, top)
 *   .subtitleHtml — secondary line (e.g. "3× 3×3 · Deluxe Speed-Gro")
 *   .noteLine     — tertiary note line (harvests, g/day, crop note)
 *   .seedCount    — number of seeds (right col, top)
 *   .cost         — gold cost (right col, bottom)
 *   .canAfford    — true → green, false → red
 *   .highlight    — true → light blue highlight background (manual mode selected)
 *   .extraLeft    — additional HTML after the note line (e.g. +/- controls)
 */
function tplBuyItem({ titleHtml, subtitleHtml = "", noteLine = "", seedCount, cost,
    canAfford, highlight = false, extraLeft = "" }) {
    const costClass = canAfford ? "afford" : "short";
    return `<div class="bi${highlight ? " bi-hl" : ""}">
    <div class="bi-left">
      <div class="bi-title">${titleHtml}</div>
      ${subtitleHtml ? `<div class="bi-sub">${subtitleHtml}</div>` : ""}
      ${noteLine ? `<div class="bi-note">${noteLine}</div>` : ""}
      ${extraLeft}
    </div>
    <div class="bi-right">
      <div class="bi-seeds">${seedCount} seeds</div>
      <div class="bi-cost ${costClass}">${cost.toLocaleString()}g${canAfford ? " ✓" : ""}</div>
    </div>
  </div>`;
}

/**
 * Flower-slot item row (has a soft purple background).
 * Thin wrapper over tplBuyItem with the flower styling applied.
 */
function tplFlowerItem(opts) {
    return `<div class="bi bi-flower">
    <div class="bi-left">
      <div class="bi-title">${opts.titleHtml}</div>
      ${opts.subtitleHtml ? `<div class="bi-sub">${opts.subtitleHtml}</div>` : ""}
      ${opts.noteLine ? `<div class="bi-note">${opts.noteLine}</div>` : ""}
    </div>
    <div class="bi-right">
      <div class="bi-seeds">${opts.seedCount} seeds</div>
      <div class="bi-cost ${opts.canAfford ? "afford" : "short"}">${opts.cost.toLocaleString()}g${opts.canAfford ? " ✓" : ""}</div>
    </div>
  </div>`;
}

/**
 * Utility-plot item row (soft green background).
 * Thin wrapper over tplBuyItem.
 */
function tplUtilityItem(opts) {
    return `<div class="bi bi-utility">
    <div class="bi-left">
      <div class="bi-title">${opts.titleHtml}</div>
      ${opts.subtitleHtml ? `<div class="bi-sub">${opts.subtitleHtml}</div>` : ""}
      ${opts.noteLine ? `<div class="bi-note">${opts.noteLine}</div>` : ""}
      ${opts.extraLeft || ""}
    </div>
    <div class="bi-right">
      <div class="bi-seeds">${opts.cropCount} crop${opts.cropCount !== 1 ? "s" : ""}</div>
      <div class="bi-cost ${opts.canAfford ? "afford" : "short"}">${opts.cost.toLocaleString()}g${opts.canAfford ? " ✓" : ""}</div>
    </div>
  </div>`;
}

/**
 * 
 * @param {string} item 
 * @returns 
 */
function tplUtilityRotationItem(item) {
    return `<div class="util-rotation-label">${item}</div>`
}

/**
 * Unassigned-plots warning banner (manual mode).
 * @param {number} count
 */
function tplUnassignedWarning(count) {
    return `<div class="warn-banner">
    ⚠ ${count} plot${count !== 1 ? "s" : ""} unassigned — will be left empty.
  </div>`;
}

/**
 * Manual-mode +/− control row for a single plot definition.
 * @param {string} plotName
 * @param {number} w, h        — plot dimensions
 * @param {number} assigned    — currently assigned count
 * @param {number} total       — total instances of this def
 * @param {string} cropName    — for the onclick handlers
 * @param {number} defIdx
 */
function tplManualControl({ plotName, w, h, assigned, total, cropName, defIdx }) {
    const canAdd = assigned < total;
    const canRemove = assigned > 0;
    return `<div class="mc-row">
    <span class="mc-label">${plotName} (${w}×${h}) <span class="mc-count">${assigned}/${total}</span></span>
    <button onclick="adjustIncomeAssignment('${cropName}','${defIdx}',-1,window.__lastCrops||[])"
      class="mc-btn${canRemove ? "" : " mc-btn-dis"}" ${canRemove ? "" : "disabled"}>−</button>
    <button onclick="adjustIncomeAssignment('${cropName}','${defIdx}',1,window.__lastCrops||[])"
      class="mc-btn${canAdd ? "" : " mc-btn-dis"}" ${canAdd ? "" : "disabled"}>+</button>
  </div>`;
}


// ═══════════════════════════════════════════════════════════════════════
// SCHEDULE FRAGMENTS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Day-wrapper block in the schedule.
 * @param {number}  day
 * @param {number}  currentDay — STATE.day (for "today" / "past" labels)
 * @param {string}  eventsHtml — pre-built event rows HTML
 */
function tplScheduleDay(day, currentDay, eventsHtml) {
    const isPast = day < currentDay;
    const isToday = day === currentDay;
    const suffix = isToday ? " ← today" : isPast ? " (past)" : "";
    return `<div class="sday${isPast ? " sday-past" : ""}">
    <div class="sday-lbl">Day ${day}${suffix}</div>
    ${eventsHtml}
  </div>`;
}

/**
 * Single schedule event row.
 * @param {object} opts
 *   .icon        — emoji
 *   .typeLabel   — "Plant" | "Replant" | "Switch crop →" | "Harvest" | "Event"
 *   .typeClass   — CSS class for the label colour ("sevt-plant"|"sevt-harvest"|"sevt-switch"|"sevt-festival")
 *   .cropName
 *   .plotsLabel  — pre-built "(N) PlotName, …" string (may be empty)
 *   .note        — optional note line
 *   .isFestival
 */
function tplScheduleEvent({ icon, typeLabel, typeClass, cropName, plotsLabel = "", note = "", isFestival = false }) {
    const nameAndPlots = `<strong class="${typeClass}">${typeLabel} ${cropName}</strong>`
        + (plotsLabel ? ` <span class="sevt-plots">${plotsLabel}</span>` : "");
    return `<div class="sevt${isFestival ? " sevt-festival-row" : ""}">
    <span class="sevt-icon">${icon}</span>
    <div>
      ${nameAndPlots}
      ${note ? `<div class="sevt-note">${note}</div>` : ""}
    </div>
  </div>`;
}


// ═══════════════════════════════════════════════════════════════════════
// FORAGE FRAGMENTS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Single forage item card.
 * @param {object} item    — forage data object from FORAGE[season]
 * @param {boolean} artisanOwned — whether the item's artisan equipment is owned
 */
function tplForageCard(item, artisanOwned) {
    const artisanBadge = (item.artisan && artisanOwned)
        ? tplBadge(item.artisan, "bg-purple", "font-size:9px;margin-left:3px")
        : "";
    const specialLine = item.special
        ? `<div class="fcrd-special">⚠ ${item.special}</div>` : "";
    return `<div class="fcrd">
    <div class="fcrd-name">${item.name}${artisanBadge}</div>
    <div class="fcrd-sell">${item.sell}g raw</div>
    <div class="fcrd-note">${item.note}</div>
    ${specialLine}
  </div>`;
}


// ═══════════════════════════════════════════════════════════════════════
// GREENHOUSE FRAGMENTS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Greenhouse crop card.
 * @param {object} crop — entry from GREENHOUSE_CROPS
 */
function tplGreenhouseCard(crop) {
    return `<div class="gh-card">
    <h3>${tplBadge(`#${crop.p}`, crop.badge, "margin-right:4px")} ${crop.name}</h3>
    ${tplLabelValue("Growth", crop.grow)}
    ${tplLabelValue("Value", crop.val)}
    ${tplTipBox(crop.note)}
  </div>`;
}

/**
 * Fruit tree card.
 * @param {object} tree — entry from FRUIT_TREES
 */
function tplTreeCard(tree) {
    return `<div class="gh-card">
    <h3>${tplBadge(tree.sell, tree.badge, "margin-right:4px")} ${tree.name}</h3>
    ${tplTipBox(tree.note)}
  </div>`;
}


// ═══════════════════════════════════════════════════════════════════════
// ARTISAN CHAIN CARD
// ═══════════════════════════════════════════════════════════════════════

/**
 * Artisan chain gh-card.
 * @param {object} chain — entry from ARTISAN_CHAINS
 */
function tplArtisanCard(chain) {
    return `<div class="gh-card">
    <h3>
      ${chain.icon}
      ${tplBadge(`#${chain.p}`, chain.badge, "font-size:9px")}
      ${chain.name}
    </h3>
    ${tplLabelValue("Machine", chain.machine)}
    ${tplLabelValue("Input", chain.raw)}
    ${tplLabelValue("Output", chain.out, "lv-output")}
    ${tplTipBox(chain.note)}
  </div>`;
}


// ═══════════════════════════════════════════════════════════════════════
// SEED MAKER FRAGMENTS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Seed Maker priority tier card wrapper.
 * @param {string} pillClass  — ppill CSS class
 * @param {string} pillLabel  — tier label (e.g. "★ Top Priority")
 * @param {string} subLabel   — right-side descriptor (e.g. "process these first")
 * @param {string} rowsHtml   — pre-built sm-row HTML
 */
function tplSeedMakerCard(pillClass, pillLabel, subLabel, rowsHtml) {
    return `<div class="sm-card">
    <div class="sm-card-hd">
      <span class="ppill ${pillClass}">${pillLabel}</span>
      <span class="sm-card-sub">${subLabel}</span>
    </div>
    ${rowsHtml}
  </div>`;
}

/**
 * Single seed maker recommendation row.
 * @param {object} crop — crop with computed _score, _class, _reason, _nextSeason
 */
function tplSeedMakerRow(crop) {
    const priorityLabel = crop._score >= 4 ? "urgent"
        : crop._score === 3 ? "high"
            : crop._score === 2 ? "medium"
                : "low";
    const seasonLine = [
        `Season: ${crop.seasons.join("+")}`,
        crop._nextSeason ? `Next: ${crop._nextSeason}` : "",
        crop.src ? crop.src : "",
    ].filter(Boolean).join(" · ");

    return `<div class="sm-row">
    <div class="sm-row-left">
      <div class="sm-row-name">${crop.name}</div>
      <div class="sm-row-reason">${crop._reason}</div>
      <div class="sm-row-meta">${seasonLine}</div>
    </div>
    <div class="sm-row-right">
      ${tplBadge(priorityLabel, crop._class)}
      <div class="sm-row-cost">${crop.cost}g/seed</div>
    </div>
  </div>`;
}


// ═══════════════════════════════════════════════════════════════════════
// CROP TABLE ROW
// ═══════════════════════════════════════════════════════════════════════

/**
 * A single <tr> in the ranked crop table.
 *
 * @param {object} opts
 *   .crop             — crop object with computed _* fields
 *   .rankIndex        — position in sorted list (0 = best)
 *   .growDisplay      — HTML string for grow time (may include fertilized arrow)
 *   .regrowDisplay    — HTML string for regrow line (or "")
 *   .gpdDisplay       — HTML string for g/day column
 *   .rankBarPercent   — 0–100 fill width for rank bar
 *   .dimmed           — true if equipment requirement not met
 *   .equipWarning     — HTML string for missing-equipment note (or "")
 */
function tplCropTableRow({ crop, rankIndex, growDisplay, regrowDisplay, gpdDisplay,
    rankBarPercent, dimmed, equipWarning }) {
    let rankLabel = "";
    if (rankIndex === 0) rankLabel = `<span class="rank-best">★ Best</span>`;
    else if (rankIndex < 3) rankLabel = `<span class="rank-top3">▲ Top 3</span>`;

    const harvestBadge = crop.re ? tplBadge("regrows", "bg-pink") : tplBadge("single", "bg-gray");
    const giantBadge = crop.giant ? tplBadge("giant", "bg-amber") : "";
    const supplyBadge = crop.supply ? tplBadge("supply", "bg-teal") : "";
    const multiSnBadge = crop.seasons.length > 1 ? tplBadge("multi", "bg-purple") : "";
    const srcLine = crop.src ? `<div class="crop-src">${crop.src}</div>` : "";

    return `<tr${dimmed ? ` class="row-dimmed"` : ""}>
    <td>
      <div class="crop-name">${crop.name}</div>
      <div class="crop-badges">${[harvestBadge, giantBadge, supplyBadge, multiSnBadge].filter(Boolean).join(" ")}</div>
      ${srcLine}
      ${equipWarning}
    </td>
    <td class="td-sec">${crop.seasons.join("+")}</td>
    <td>Day ${crop._lastPlantDay}</td>
    <td>${growDisplay}${regrowDisplay}</td>
    <td>${crop._harvests}×</td>
    <td>
      ${gpdDisplay}
      <div class="rank-bar"><div class="rank-fill" style="width:${rankBarPercent}%"></div></div>
    </td>
    <td class="td-sec">${crop.note} ${rankLabel}</td>
  </tr>`;
}


// ═══════════════════════════════════════════════════════════════════════
// EMPTY / FALLBACK STATES
// ═══════════════════════════════════════════════════════════════════════

/** Standard "nothing to show" placeholder. */
function tplEmpty(msg) {
    return `<div class="empty-state">${msg}</div>`;
}

/** Winter no-planting notice for buy list. */
function tplWinterBuyList() {
    return `<div class="winter-note">
    No outdoor planting in winter. Focus on:<br>
    • Artisan goods — keep kegs, jars, and presses running<br>
    • Forage — hoe for Snow Yam and Winter Root<br>
    • Greenhouse harvests and fruit trees<br>
    • Animal care and friendship building
  </div>`;
}

/** Winter no-planting notice for schedule. */
function tplWinterSchedule() {
    return `<div class="winter-note">
    No outdoor crops in winter.<br>
    • Tend greenhouse &amp; fruit trees<br>
    • Process artisan goods<br>
    • Forage with hoe (Snow Yam, Winter Root)<br>
    • Build animal friendship
  </div>`;
}