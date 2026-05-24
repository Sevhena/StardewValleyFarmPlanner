/**
 * renderSeasonal.js — Seasonal Farm tab rendering
 * ─────────────────────────────────────────────────
 * Renders everything inside the "Seasonal farm" tab panel:
 *   renderCropTable()  — ranked crop table (all viable crops for the season)
 *   renderBuyList()    — season-start shopping list (seeds + costs by plot type)
 *   renderSchedule()   — day-by-day planting/replant/switch/festival schedule
 *   renderForage()     — seasonal forage items grid
 *   renderAll()        — convenience wrapper that calls all four above
 *
 * Depends on: data.js, gameCalc.js, state.js, plotLogic.js
 */


// ─── CROP TABLE ───────────────────────────────────────────────────────────────

/**
 * Render the "All viable crops — ranked by gold/day" table.
 * Crops missing required equipment are dimmed. If any income plot has
 * a fertilizer active, growth times show base → fertilized.
 *
 * @param {object[]} viableCrops — from buildViableCropList()
 */
function renderCropTable(viableCrops) {
  const tbody = document.getElementById("plan-body");

  if (!viableCrops.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:var(--txt3);padding:12px 0">
      No crops can complete a full harvest with days remaining.</td></tr>`;
    return;
  }

  // Detect active fertilizer from income plots (use first one found)
  const activeFertilizers = getIncomePlots()
    .map(p => p.boost || "none")
    .filter(b => b !== "none");
  const activeFertilizerKey = activeFertilizers.length ? activeFertilizers[0] : "none";

  // Scale the rank bar relative to the highest effective g/day
  const maxEffectiveGpd = Math.max(
    ...viableCrops.map(c => calcEffectiveGoldPerDay(c, STATE.season, STATE.day, STATE.equipment)),
    1
  );

  // Inject fertilizer caption if any income plots have a speed boost
  if (activeFertilizerKey !== "none") {
    const existingCaption = tbody.previousElementSibling;
    if (!existingCaption || existingCaption.tagName !== "CAPTION") {
      tbody.insertAdjacentHTML("beforebegin",
        `<caption style="font-size:10px;color:var(--txt3);text-align:left;padding:0 0 4px;caption-side:top">
          Growth times show base → fertilized (${FERTILIZER_CONFIGS[activeFertilizerKey].label} detected on income plots)
        </caption>`
      );
    }
  }

  tbody.innerHTML = viableCrops.map((crop, rankIndex) => {
    // Rank label for top entries
    let rankLabel = "";
    if (rankIndex === 0) rankLabel = `<span style="color:#BA7517;font-weight:700">★ Best</span>`;
    else if (rankIndex < 3) rankLabel = `<span style="color:var(--green)">▲ Top 3</span>`;

    // Type/trait badges
    const harvestTypeBadge = crop.re ? `<span class="badge bg-pink">regrows</span>` : `<span class="badge bg-gray">single</span>`;
    const giantBadge = crop.giant ? `<span class="badge bg-amber">giant</span>` : "";
    const supplyBadge = crop.supply ? `<span class="badge bg-teal">supply</span>` : "";
    const multiSeasonBadge = crop.seasons.length > 1 ? `<span class="badge bg-purple">multi</span>` : "";
    const badgesHtml = [harvestTypeBadge, giantBadge, supplyBadge, multiSeasonBadge].filter(Boolean).join(" ");

    // Equipment warning for dimmed crops
    const missingEquipment = crop.reqE && !ownsEquipment(crop.reqE);
    const equipWarning = missingEquipment
      ? `<div style="font-size:10px;color:var(--red)">Needs ${crop.reqE}</div>` : "";

    // Growth time display: show base → fertilized if fertilizer is active
    const baseGrowDays = crop.grow;
    const fertilizedGrowDays = activeFertilizerKey !== "none"
      ? applyFertilizerToGrowTime(crop.grow, activeFertilizerKey) : null;
    const growDisplay = (fertilizedGrowDays && fertilizedGrowDays !== baseGrowDays)
      ? `${baseGrowDays}d <span style="color:var(--green);font-size:10px">→${fertilizedGrowDays}d</span>`
      : `${baseGrowDays}d`;
    const regrowDisplay = crop.re && crop.regrow
      ? `<div style="font-size:10px;color:var(--txt3)">+${crop.regrow}d regrow</div>` : "";

    // Gold/day: show artisan-boosted value in green if higher than raw
    const effectiveGpd = calcEffectiveGoldPerDay(crop, STATE.season, STATE.day, STATE.equipment);
    const rawGpd = Math.round(calcRawGoldPerDay(crop, STATE.season, STATE.day, "none"));
    const isArtisanBoosted = effectiveGpd > calcRawGoldPerDay(crop, STATE.season, STATE.day, "none") + 1;
    const gpdDisplay = isArtisanBoosted
      ? `<span style="color:#27500A;font-weight:700">${Math.round(effectiveGpd)}</span>
         <div style="font-size:9px;color:var(--txt3)">${rawGpd} raw</div>`
      : rawGpd;

    // Rank bar fill (% of best crop)
    const rankBarPercent = Math.round(Math.min(100, (effectiveGpd / maxEffectiveGpd) * 100));

    return `<tr${missingEquipment ? ` style="opacity:.45"` : ""}>
      <td>
        <div style="font-weight:600">${crop.name}</div>
        <div style="display:flex;gap:2px;flex-wrap:wrap;margin-top:2px">${badgesHtml}</div>
        ${crop.src ? `<div style="font-size:10px;color:var(--txt3)">${crop.src}</div>` : ""}
        ${equipWarning}
      </td>
      <td style="font-size:11px;color:var(--txt2)">${crop.seasons.join("+")}</td>
      <td>Day ${crop._lastPlantDay}</td>
      <td style="font-size:12px">${growDisplay}${regrowDisplay}</td>
      <td>${crop._harvests}×</td>
      <td>
        ${gpdDisplay}
        <div class="rank-bar"><div class="rank-fill" style="width:${rankBarPercent}%"></div></div>
      </td>
      <td style="font-size:11px;color:var(--txt2)">${crop.note} ${rankLabel}</td>
    </tr>`;
  }).join("");
}


// ─── BUY LIST ─────────────────────────────────────────────────────────────────

/**
 * Render the season-start shopping list.
 * Groups purchases by plot type: Income → Giant → Supply.
 * Tracks running total and shows affordability (green ✓ / red shortfall).
 *
 * @param {object[]} allViableCrops — from buildViableCropList()
 */
function renderBuyList(allViableCrops) {
  const el = document.getElementById("buy-list");

  // Winter: no outdoor planting
  if (STATE.season === "Winter") {
    el.innerHTML = `<div style="color:var(--txt2);font-size:12px;line-height:1.6">
      No outdoor planting in winter. Focus on:<br>
      • Artisan goods — keep kegs, jars, and presses running<br>
      • Forage — hoe for Snow Yam and Winter Root<br>
      • Greenhouse harvests and fruit trees<br>
      • Animal care and friendship building
    </div>`;
    return;
  }

  let html = "";
  let runningTotalCost = 0;

  // ── Festival warnings (upcoming festivals within 7 days)
  const upcomingFestivals = (FESTIVALS[STATE.season] || [])
    .filter(f => f.day >= STATE.day && f.day <= STATE.day + 7);
  upcomingFestivals.forEach(f => {
    html += `<div class="festival-box">${f.icon} <strong>Day ${f.day}: ${f.name}</strong> — ${f.note}</div>`;
  });

  // ── Season tips
  if (STATE.season === "Spring" && STATE.year === 1) {
    html += `<div class="tip-box" style="margin-bottom:10px">
      <strong>Year 1 Spring:</strong> Plant Parsnips day 1 for fast early gold.
      Egg Festival on day 13 → buy Strawberry seeds (100g each) — best spring crop.
    </div>`;
  } else if (STATE.season === "Spring" && STATE.day <= 12) {
    html += `<div class="tip-box" style="margin-bottom:10px">
      <strong>Reminder:</strong> Egg Festival day 13 — budget for Strawberry seeds (100g each). Don't miss it.
    </div>`;
  }

  // ── Get assignment data
  const { instances: incInstances, assignments: plotAssignments,
    flowerPool, flowerSlotIndex, utilitySlotIndex } = assignIncomePlots(allViableCrops);
  const giantPlan = calcGiantPlotPlan(allViableCrops);
  const supplyPlan = calcSupplyPlotPlan(allViableCrops);
  const incomeCrops = filterIncomePlotCrops(allViableCrops, STATE.equipment);
  const nonFlowerCrops = incomeCrops.filter(c => !c.flower);
  const reservedSlots = new Set([flowerSlotIndex, utilitySlotIndex].filter(i => i !== -1));

  // ─────────────────────────────────────────────────────────────────────────
  // INCOME PLOTS
  // ─────────────────────────────────────────────────────────────────────────
  const incomePlots = getIncomePlots();
  if (incomePlots.length > 0) {
    const totalIncomeTiles = getTotalIncomeTiles();
    const totalInstanceCount = incInstances.length;
    const isManualMode = STATE.incomeManual;

    const manualToggleBtn = `<button class="toggle-btn${isManualMode ? " alt" : ""}"
      onclick="toggleIncomeManualMode(window.__lastCrops || [])"
      title="Toggle manual crop assignment for profit plots">
      ${isManualMode ? "✏ Manual" : "⚙ Auto"}
    </button>`;

    html += `<div class="bgh">
      <span>Income plots — ${totalInstanceCount} individual plot${totalInstanceCount !== 1 ? "s" : ""} · ${totalIncomeTiles} tiles</span>
      <span style="display:flex;align-items:center;gap:6px">
        <span style="font-size:10px;color:var(--txt3)">${isManualMode ? "manual assignment" : "round-robin · variety preserved"}</span>
        ${manualToggleBtn}
      </span>
    </div>`;

    if (!incomeCrops.length) {
      html += `<div style="font-size:12px;color:var(--txt3);padding:6px 0">
        No viable income crops for the remaining days. Consider repurposing these plots for fast supply crops.
      </div>`;
    } else {

      // Helper: summarise which plot sizes are represented in a list of instances
      function buildPlotSizeLabel(instanceList) {
        const counts = {};
        instanceList.forEach(({ plot }) => {
          const key = `${plot.w}×${plot.h}`;
          counts[key] = (counts[key] || 0) + 1;
        });
        return Object.entries(counts).map(([k, v]) => `${v}× ${k}`).join(", ");
      }

      // ── Flower slot
      if (flowerSlotIndex !== -1 && flowerPool.length) {
        const inst = incInstances[flowerSlotIndex];
        const flowerCrop = plotAssignments[flowerSlotIndex];
        if (flowerCrop) {
          const fertKey = inst.plot.boost || "none";
          const seedsNeeded = calcSeedsNeeded(flowerCrop, inst.usableTiles, fertKey, STATE.season, STATE.day);
          const tileCost = seedsNeeded * flowerCrop.cost;
          runningTotalCost += tileCost;
          const canAfford = STATE.gold >= tileCost;
          const harvests = countHarvests(flowerCrop, STATE.season, STATE.day, fertKey);

          const nextFlowerIdx = ((STATE.flowerAltIdx || 0) + 1) % flowerPool.length;
          const cycleFlowerBtn = flowerPool.length > 1
            ? `<button class="toggle-btn${(STATE.flowerAltIdx || 0) > 0 ? " alt" : ""}"
                onclick="toggleFlowerCrop(window.__lastCrops || [])">⇄ ${flowerPool[nextFlowerIdx].name}</button>`
            : "";

          html += `<div class="bi" style="background:#F9F6FF;border-radius:6px;padding:6px 8px;margin-bottom:2px">
            <div style="flex:1">
              <div style="font-weight:700">
                ${flowerCrop.name} <span class="badge bg-pink">flower</span>
                <span style="font-size:10px;color:var(--txt3)">(${inst.plot.w}×${inst.plot.h} plot)</span>
                ${flowerPool.length > 1 ? cycleFlowerBtn : ""}
              </div>
              <div style="color:var(--txt2);font-size:12px">For gifting, Bee House boost, bundles and recipes</div>
              <div style="font-size:11px;color:var(--txt3)">
                ${harvests} harvest${harvests !== 1 ? "s" : ""} · ${flowerCrop.sell}g raw · ${flowerCrop.note.split(".")[0]}
              </div>
              ${flowerPool.length > 1
              ? `<div style="font-size:10px;color:var(--txt3);margin-top:2px">Alt flowers: ${flowerPool.map(f => f.name).join(", ")}</div>`
              : ""}
            </div>
            <div style="text-align:right;white-space:nowrap">
              <div style="font-size:13px;font-weight:700">${seedsNeeded} seeds</div>
              <div style="font-size:12px;color:${canAfford ? "#27500A" : "#A32D2D"}">${tileCost.toLocaleString()}g${canAfford ? " ✓" : ""}</div>
            </div>
          </div>`;
        }
      }

      // ── Utility slot
      if (utilitySlotIndex !== -1) {
        const inst = incInstances[utilitySlotIndex];
        const fertKey = inst.plot.boost || "none";
        const utilityRotation = getUtilityPlotRotation(nonFlowerCrops, fertKey);

        if (utilityRotation.length) {
          // Aggregate seed cost per crop across all rotation slots
          const seedsByUtilityCrop = {};
          utilityRotation.forEach(({ crop }) => {
            if (!seedsByUtilityCrop[crop.name]) seedsByUtilityCrop[crop.name] = { crop, seeds: 0 };
            seedsByUtilityCrop[crop.name].seeds += inst.usableTiles;
          });
          const utilityEntries = Object.values(seedsByUtilityCrop);
          const utilityTotalCost = utilityEntries.reduce((sum, e) => sum + e.seeds * e.crop.cost, 0);
          runningTotalCost += utilityTotalCost;
          const canAfford = STATE.gold >= utilityTotalCost;

          const cropRotationLabel = utilityRotation
            .map((slot, i) => `${i + 1}. ${slot.crop.name} (day ${slot.plantDay}→${slot.harvestDay})`)
            .join(" · ");

          html += `<div class="bi" style="background:#EAF3DE;border-radius:6px;padding:6px 8px;margin-bottom:2px">
            <div style="flex:1">
              <div style="font-weight:700">
                Utility plot <span class="badge bg-teal">utility</span> <span class="badge bg-green" style="margin-left:3px">variety</span>
                <span style="font-size:10px;color:var(--txt3)">(${inst.plot.w}×${inst.plot.h} plot · rotates each harvest)</span>
              </div>
              <div style="font-size:11px;color:var(--txt3);line-height:1.6">${cropRotationLabel}</div>
              ${utilityEntries.map(e => {
            const h = countHarvests(e.crop, STATE.season, STATE.day, fertKey);
            return `<div style="font-size:11px;color:var(--txt3)">→ ${e.crop.name}: ${e.seeds} seeds · ${e.crop.cost}g each · ${e.crop.note.split(".")[0]}</div>`;
          }).join("")}
            </div>
            <div style="text-align:right;white-space:nowrap">
              <div style="font-size:13px;font-weight:700">${utilityEntries.length} crop${utilityEntries.length !== 1 ? "s" : ""}</div>
              <div style="font-size:12px;color:${canAfford ? "#27500A" : "#A32D2D"}">${utilityTotalCost.toLocaleString()}g${canAfford ? " ✓" : ""}</div>
            </div>
          </div>`;
        }
      }

      // ── Profit crops (auto or manual)
      if (isManualMode) {
        html += _renderManualIncomeProfitRows(allViableCrops, incInstances, reservedSlots, runningTotalCost);
        // Note: _renderManualIncomeProfitRows mutates runningTotalCost by reference isn't
        // possible in JS — we recalculate total at the end instead.
        // Re-sum from manual assignments for the total line.
        const profitCostFromManual = _calcManualProfitCost(allViableCrops, incInstances, reservedSlots);
        runningTotalCost += profitCostFromManual;
      } else {
        html += _renderAutoProfitRows(allViableCrops, incInstances, plotAssignments, reservedSlots);
        // Sum up auto-assigned costs
        const profitCostFromAuto = _calcAutoProfitCost(incInstances, plotAssignments, reservedSlots);
        runningTotalCost += profitCostFromAuto;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GIANT PLOTS
  // ─────────────────────────────────────────────────────────────────────────
  const giantPlots = getGiantPlots();
  if (giantPlots.length > 0) {
    const { mode, giantCrop, allGiantCrops, fillCrop, giantBlocks, leftoverTiles, totalGiantTiles } = giantPlan;

    const hasManyGiantCrops = allGiantCrops && allGiantCrops.length > 1;
    const nextGiantIdx = ((STATE.giantCropAltIdx || 0) + 1) % (allGiantCrops?.length || 1);
    const cycleGiantBtn = hasManyGiantCrops
      ? `<button class="toggle-btn${(STATE.giantCropAltIdx || 0) > 0 ? " alt" : ""}"
          onclick="toggleGiantCrop(window.__lastCrops || [])">⇄ Switch (${allGiantCrops[nextGiantIdx]?.name || ""})</button>`
      : "";

    if (mode === "giant" && giantCrop) {
      const giantSeedsNeeded = giantBlocks * 9;
      const giantSeedCost = giantSeedsNeeded * giantCrop.cost;
      runningTotalCost += giantSeedCost;

      html += `<div class="bgh" style="margin-top:8px">
        <span>Giant plots — ${giantBlocks} block${giantBlocks !== 1 ? "s" : ""} × 9 + ${leftoverTiles} fill</span>
        ${cycleGiantBtn}
      </div>
      <div class="bi">
        <div style="flex:1">
          <div style="font-weight:700">${giantCrop.name} <span class="badge bg-amber">giant crop</span></div>
          <div style="color:var(--txt2);font-size:12px">
            ${giantBlocks} block${giantBlocks !== 1 ? "s" : ""} of 3×3 = ${giantSeedsNeeded} seeds · leave nothing adjacent to 3×3 groups
          </div>
          <div style="font-size:11px;color:var(--txt3)">
            ~10% giant-form chance/night once mature · ~2× yield on formation · ${giantCrop.note.split(".")[0]}
          </div>
        </div>
        <div style="text-align:right;white-space:nowrap">
          <div style="font-size:13px;font-weight:700">${giantSeedsNeeded} seeds</div>
          <div style="font-size:12px">${giantSeedCost.toLocaleString()}g</div>
        </div>
      </div>`;

      // Fill tiles (leftover space outside 3×3 blocks)
      if (leftoverTiles > 0 && fillCrop) {
        const fillSeeds = calcSeedsNeeded(fillCrop, leftoverTiles, "none", STATE.season, STATE.day);
        const fillCost = fillSeeds * fillCrop.cost;
        runningTotalCost += fillCost;
        html += `<div class="bi">
          <div style="flex:1">
            <div style="font-weight:700">${fillCrop.name}
              <span style="font-size:10px;font-weight:400;color:var(--txt3)">(${leftoverTiles} fill tiles)</span>
            </div>
            <div style="font-size:11px;color:var(--txt3)">Fill tiles outside giant blocks — best income crop</div>
          </div>
          <div style="text-align:right;white-space:nowrap">
            <div style="font-size:13px;font-weight:700">${fillSeeds} seeds</div>
            <div style="font-size:12px">${fillCost.toLocaleString()}g</div>
          </div>
        </div>`;
      }

    } else {
      // Not enough days for giant crops — fall back to best income crop
      html += `<div class="bgh" style="margin-top:8px">
        <span>Giant plots — ${totalGiantTiles} tiles</span>
        <span style="font-size:10px;color:#BA7517">⚠ no time for giants</span>
      </div>
      <div style="font-size:12px;color:var(--txt2);padding:4px 0 6px">
        Not enough days for giant crops. Planting best income crops instead.
      </div>`;

      if (fillCrop) {
        const fallbackSeeds = calcSeedsNeeded(fillCrop, totalGiantTiles, "none", STATE.season, STATE.day);
        const fallbackCost = fallbackSeeds * fillCrop.cost;
        runningTotalCost += fallbackCost;
        const harvests = countHarvests(fillCrop, STATE.season, STATE.day, "none");
        html += `<div class="bi">
          <div style="flex:1">
            <div style="font-weight:700">${fillCrop.name}</div>
            <div style="color:var(--txt2);font-size:12px">${totalGiantTiles} tiles · ${harvests} harvest${harvests !== 1 ? "s" : ""}</div>
            <div style="font-size:11px;color:var(--txt3)">${fillCrop.note.split(".")[0]}</div>
          </div>
          <div style="text-align:right;white-space:nowrap">
            <div style="font-size:13px;font-weight:700">${fallbackSeeds} seeds</div>
            <div style="font-size:12px">${fallbackCost.toLocaleString()}g</div>
          </div>
        </div>`;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUPPLY PLOTS
  // ─────────────────────────────────────────────────────────────────────────
  const supplyPlotDefs = getSupplyPlots();
  if (supplyPlotDefs.length > 0) {
    const { feedPlan, feedTilesTotal, fillTiles, fillCrop: supplyFillCrop,
      winterHayNeeded, allSupplyCrops, hasHayCrops, varietyCrops, totalSupplyTiles } = supplyPlan;
    const isFeedMode = STATE.supplyPlotMode !== "variety";
    const modeLabel = isFeedMode ? "🌾 Feed mode" : "🌿 Variety mode";

    const supplyToggleBtn = allSupplyCrops.length
      ? `<button class="toggle-btn${!isFeedMode ? " alt" : ""}"
          onclick="toggleSupplyMode(window.__lastCrops || [])">
          ${isFeedMode ? "⇄ already stocked →" : "⇄ need hay →"}
        </button>`
      : "";

    html += `<div class="bgh" style="margin-top:8px">
      <span>Supply plots — ${totalSupplyTiles} tiles · ${modeLabel}</span>
      ${supplyToggleBtn}
    </div>`;

    if (!allSupplyCrops.length) {
      // No supply crops this season — use fallback income crop
      html += `<div style="font-size:12px;color:var(--txt2);padding:4px 0 6px">
        No supply crops this season. Using best income crops as fallback.
      </div>`;
      const fallback = filterIncomePlotCrops(allViableCrops, STATE.equipment)[0];
      if (fallback) {
        const fSeeds = calcSeedsNeeded(fallback, totalSupplyTiles, "none", STATE.season, STATE.day);
        const fCost = fSeeds * fallback.cost;
        runningTotalCost += fCost;
        const fHarvests = countHarvests(fallback, STATE.season, STATE.day, "none");
        html += `<div class="bi">
          <div style="flex:1">
            <div style="font-weight:700">${fallback.name} <span style="font-size:10px;font-weight:400;color:var(--txt3)">(fallback)</span></div>
            <div style="color:var(--txt2);font-size:12px">${totalSupplyTiles} tiles · ${fHarvests} harvest${fHarvests !== 1 ? "s" : ""}</div>
          </div>
          <div style="text-align:right;white-space:nowrap">
            <div style="font-size:13px;font-weight:700">${fSeeds} seeds</div>
            <div style="font-size:12px">${fCost.toLocaleString()}g</div>
          </div>
        </div>`;
      }

    } else if (isFeedMode) {
      // Feed-first mode
      if (feedPlan.length && feedTilesTotal > 0) {
        const firstSupplyPlot = supplyPlotDefs[0];
        const fertKey = firstSupplyPlot?.boost || "none";

        feedPlan.forEach(({ crop, tiles }) => {
          const fHarvests = countHarvests(crop, STATE.season, STATE.day, fertKey);
          const fSeeds = calcSeedsNeeded(crop, tiles, fertKey, STATE.season, STATE.day);
          const fCost = fSeeds * crop.cost;
          runningTotalCost += fCost;

          html += `<div class="bi">
            <div style="flex:1">
              <div style="font-weight:700">${crop.name} <span class="badge bg-teal">hay/feed</span></div>
              <div style="color:var(--txt2);font-size:12px">
                ${tiles} tiles · Mill → animal feed · ~${tiles * fHarvests} of ${winterHayNeeded} hay
              </div>
              <div style="font-size:11px;color:var(--txt3)">${crop.note.split(".")[0]}</div>
            </div>
            <div style="text-align:right;white-space:nowrap">
              <div style="font-size:13px;font-weight:700">${fSeeds} seeds</div>
              <div style="font-size:12px">${fCost.toLocaleString()}g</div>
            </div>
          </div>`;
        });
      } else if (!hasHayCrops) {
        html += `<div style="font-size:11px;color:var(--txt3);padding:3px 0">
          ⚠ No feed crops available this season — stock hay before winter or enable Mill.
        </div>`;
      } else {
        html += `<div style="font-size:11px;color:var(--green);padding:3px 0">
          ✓ Hay estimation shows current season can cover needs — review alternate plan.
        </div>`;
      }

      // Fill tiles with best non-hay supply crop
      if (fillTiles > 0 && supplyFillCrop) {
        const firstSupplyPlot = supplyPlotDefs[0];
        const fertKey = firstSupplyPlot?.boost || "none";
        const fSeeds = calcSeedsNeeded(supplyFillCrop, fillTiles, fertKey, STATE.season, STATE.day);
        const fCost = fSeeds * supplyFillCrop.cost;
        runningTotalCost += fCost;
        html += `<div class="bi">
          <div style="flex:1">
            <div style="font-weight:700">${supplyFillCrop.name}
              <span style="font-size:10px;font-weight:400;color:var(--txt3)">(${fillTiles} remaining tiles)</span>
            </div>
            <div style="color:var(--txt2);font-size:12px">${supplyFillCrop.note.split(".")[0]}</div>
          </div>
          <div style="text-align:right;white-space:nowrap">
            <div style="font-size:13px;font-weight:700">${fSeeds} seeds</div>
            <div style="font-size:12px">${fCost.toLocaleString()}g</div>
          </div>
        </div>`;
      }

    } else {
      // Variety mode — spread tiles evenly across all supply crops
      html += `<div style="font-size:11px;color:var(--amber);padding:3px 0 5px">
        Hay stocked — all supply tiles going to variety crops.
      </div>`;
      const varietyList = varietyCrops.length ? varietyCrops : allSupplyCrops;
      const tilesEach = Math.floor(totalSupplyTiles / varietyList.length);
      const tileRemainder = totalSupplyTiles % varietyList.length;
      const firstSupplyPlot = supplyPlotDefs[0];
      const fertKey = firstSupplyPlot?.boost || "none";

      varietyList.forEach((vc, i) => {
        const tiles = tilesEach + (i < tileRemainder ? 1 : 0);
        if (!tiles) return;
        const vSeeds = calcSeedsNeeded(vc, tiles, fertKey, STATE.season, STATE.day);
        const vCost = vSeeds * vc.cost;
        const vHarvests = countHarvests(vc, STATE.season, STATE.day, fertKey);
        runningTotalCost += vCost;
        html += `<div class="bi">
          <div style="flex:1">
            <div style="font-weight:700">${vc.name} <span class="badge bg-green">variety</span></div>
            <div style="color:var(--txt2);font-size:12px">
              ${tiles} tiles · ${vHarvests} harvest${vHarvests !== 1 ? "s" : ""} · ${vc.note.split(".")[0]}
            </div>
          </div>
          <div style="text-align:right;white-space:nowrap">
            <div style="font-size:13px;font-weight:700">${vSeeds} seeds</div>
            <div style="font-size:12px">${vCost.toLocaleString()}g</div>
          </div>
        </div>`;
      });
    }
  }

  // ── Empty state
  if (!incomePlots.length && !giantPlots.length && !supplyPlotDefs.length) {
    el.innerHTML = `<div style="color:var(--txt3)">Add farm plots above to generate your shopping list.</div>`;
    return;
  }

  // ── Grand total
  const goldRemaining = STATE.gold - runningTotalCost;
  html += `<div class="buy-total">
    <span>Estimated seed cost</span>
    <span style="color:${goldRemaining >= 0 ? "#27500A" : "#A32D2D"}">
      ${runningTotalCost.toLocaleString()}g
      ${goldRemaining >= 0
      ? `(${goldRemaining.toLocaleString()}g left)`
      : `(short ${Math.abs(goldRemaining).toLocaleString()}g)`}
    </span>
  </div>`;

  el.innerHTML = html;
}

// ── Private helpers for the buy list profit rows ──────────────────────────────

/**
 * Render auto-assigned profit plot rows (grouped by crop name).
 * Returns HTML string only — does not modify runningTotalCost (caller does).
 */
function _renderAutoProfitRows(allViableCrops, incInstances, plotAssignments, reservedSlots) {
  // Group instances by their assigned crop name
  const seedsByCrop = {};
  incInstances.forEach((inst, idx) => {
    if (reservedSlots.has(idx)) return;
    const crop = plotAssignments[idx];
    if (!crop) return;
    const fertKey = inst.plot.boost || "none";
    const seeds = calcSeedsNeeded(crop, inst.usableTiles, fertKey, STATE.season, STATE.day);
    if (!seedsByCrop[crop.name]) seedsByCrop[crop.name] = { crop, instances: [], totalSeeds: 0, totalCost: 0 };
    seedsByCrop[crop.name].instances.push(inst);
    seedsByCrop[crop.name].totalSeeds += seeds;
    seedsByCrop[crop.name].totalCost += seeds * crop.cost;
  });

  return Object.values(seedsByCrop)
    .sort((a, b) =>
      calcEffectiveGoldPerDay(b.crop, STATE.season, STATE.day, STATE.equipment) -
      calcEffectiveGoldPerDay(a.crop, STATE.season, STATE.day, STATE.equipment)
    )
    .map(({ crop, instances: insts, totalSeeds, totalCost }) => {
      const fertKey = insts[0].plot.boost || "none";
      const harvests = countHarvests(crop, STATE.season, STATE.day, fertKey);
      const effectiveGpd = Math.round(calcEffectiveGoldPerDay(crop, STATE.season, STATE.day, STATE.equipment));
      const rawGpd = Math.round(calcRawGoldPerDay(crop, STATE.season, STATE.day, "none"));
      const artisanBadge = effectiveGpd > rawGpd
        ? `<span class="badge bg-purple" style="margin-left:3px">→ artisan ~${effectiveGpd}g/day</span>` : "";
      const regrowBadge = crop.re ? `<span class="badge bg-pink" style="margin-left:3px">buy once</span>` : "";
      const boostNote = fertKey !== "none" ? ` · ${FERTILIZER_CONFIGS[fertKey].label}` : "";
      const canAfford = STATE.gold >= totalCost;

      // Build size summary: e.g. "2× 3×3, 1× 5×5"
      const sizeCounts = {};
      insts.forEach(({ plot }) => {
        const k = `${plot.w}×${plot.h}`;
        sizeCounts[k] = (sizeCounts[k] || 0) + 1;
      });
      const sizeLabel = Object.entries(sizeCounts).map(([k, v]) => `${v}× ${k}`).join(", ");
      const plotCountNote = insts.length > 1
        ? ` <span style="font-size:10px;color:var(--txt3)">(${insts.length} plots)</span>` : "";

      return `<div class="bi">
        <div style="flex:1">
          <div style="font-weight:700">${crop.name}${artisanBadge}${regrowBadge}${plotCountNote}</div>
          <div style="color:var(--txt2);font-size:12px">${sizeLabel}${boostNote}</div>
          <div style="font-size:11px;color:var(--txt3)">
            ${harvests} harvest${harvests !== 1 ? "s" : ""} · ${rawGpd}g/day raw
            ${crop.note ? ` · ${crop.note.split(".")[0]}` : ""}
          </div>
        </div>
        <div style="text-align:right;white-space:nowrap">
          <div style="font-size:13px;font-weight:700">${totalSeeds} seeds</div>
          <div style="font-size:12px;color:${canAfford ? "#27500A" : "#A32D2D"}">${totalCost.toLocaleString()}g${canAfford ? " ✓" : ""}</div>
        </div>
      </div>`;
    }).join("");
}

/** Sum total cost of auto-assigned profit crops (for grand total). */
function _calcAutoProfitCost(incInstances, plotAssignments, reservedSlots) {
  let total = 0;
  incInstances.forEach((inst, idx) => {
    if (reservedSlots.has(idx)) return;
    const crop = plotAssignments[idx];
    if (!crop) return;
    const fertKey = inst.plot.boost || "none";
    const seeds = calcSeedsNeeded(crop, inst.usableTiles, fertKey, STATE.season, STATE.day);
    total += seeds * crop.cost;
  });
  return total;
}

/**
 * Render manual assignment profit rows (crop-centric with +/- controls per plot def).
 * Returns HTML string.
 */
function _renderManualIncomeProfitRows(allViableCrops, incInstances, reservedSlots) {
  const profitCrops = filterIncomePlotCrops(allViableCrops, STATE.equipment)
    .filter(c => !c.flower && !UTILITY_CROP_NAMES.includes(c.name))
    .sort((a, b) =>
      calcEffectiveGoldPerDay(b, STATE.season, STATE.day, STATE.equipment) -
      calcEffectiveGoldPerDay(a, STATE.season, STATE.day, STATE.equipment)
    );

  const { total: defTotal, available: defAvailable } = calcManualSlotAvailability(reservedSlots, incInstances);
  const manualAssignments = STATE.incomeAssignments || {};

  // Unassigned plot count warning
  const totalAssignedCount = Object.values(manualAssignments)
    .reduce((sum, defMap) => sum + Object.values(defMap).reduce((s, v) => s + v, 0), 0);
  const totalProfitSlots = incInstances.filter((_, i) => !reservedSlots.has(i)).length;
  const unassignedCount = totalProfitSlots - totalAssignedCount;

  let html = "";
  if (unassignedCount > 0) {
    html += `<div style="font-size:11px;color:var(--amber);padding:3px 0 5px">
      ⚠ ${unassignedCount} plot${unassignedCount !== 1 ? "s" : ""} unassigned — will be left empty.
    </div>`;
  }

  // Plot definitions available for profit assignment (non-reserved)
  const profitPlotDefs = getIncomePlots()
    .map((plot, defIdx) => ({ plot, defIdx }))
    .filter(({ defIdx }) => defTotal[defIdx] > 0);

  profitCrops.forEach(crop => {
    const cropAssignment = manualAssignments[crop.name] || {};
    const totalAssignedForCrop = Object.values(cropAssignment).reduce((s, v) => s + v, 0);

    // Skip crops with no assignments and no available slots to assign
    const hasAvailableSlots = profitPlotDefs.some(({ defIdx }) => defAvailable[defIdx] > 0);
    if (totalAssignedForCrop === 0 && !hasAvailableSlots) return;

    let seedsNeeded = 0, cropCost = 0;
    profitPlotDefs.forEach(({ plot, defIdx }) => {
      const cnt = cropAssignment[defIdx] || 0;
      if (!cnt) return;
      const fertKey = plot.boost || "none";
      const tilesPerInst = calcUsableTiles({ ...plot, count: 1 });
      const seedsPerInst = calcSeedsNeeded(crop, tilesPerInst, fertKey, STATE.season, STATE.day);
      seedsNeeded += seedsPerInst * cnt;
      cropCost += seedsPerInst * cnt * crop.cost;
    });

    const effectiveGpd = Math.round(calcEffectiveGoldPerDay(crop, STATE.season, STATE.day, STATE.equipment));
    const rawGpd = Math.round(calcRawGoldPerDay(crop, STATE.season, STATE.day, "none"));
    const artisanBadge = effectiveGpd > rawGpd
      ? `<span class="badge bg-purple" style="margin-left:3px">→ artisan ~${effectiveGpd}g/day</span>` : "";
    const regrowBadge = crop.re ? `<span class="badge bg-pink" style="margin-left:3px">buy once</span>` : "";

    // Per-def +/- controls
    const plotControlsHtml = profitPlotDefs.map(({ plot, defIdx }) => {
      const assignedCount = cropAssignment[defIdx] || 0;
      const availableCount = defAvailable[defIdx] || 0;
      const canAdd = availableCount > 0;
      const canRemove = assignedCount > 0;
      return `<div style="display:flex;align-items:center;gap:5px;padding:2px 0">
        <span style="font-size:11px;color:var(--txt2);flex:1">
          ${plot.name} (${plot.w}×${plot.h})
          <span style="color:var(--txt3)">${assignedCount}/${defTotal[defIdx] || 0}</span>
        </span>
        <button onclick="adjustIncomeAssignment('${crop.name}', '${defIdx}', -1, window.__lastCrops || [])"
          style="width:20px;height:20px;border-radius:4px;border:.5px solid var(--bd2);background:var(--bg);font-size:13px;line-height:1;cursor:pointer;color:${canRemove ? "var(--txt)" : "var(--bd2)"}"
          ${canRemove ? "" : "disabled"}>−</button>
        <button onclick="adjustIncomeAssignment('${crop.name}', '${defIdx}', 1, window.__lastCrops || [])"
          style="width:20px;height:20px;border-radius:4px;border:.5px solid var(--bd2);background:var(--bg);font-size:13px;line-height:1;cursor:pointer;color:${canAdd ? "var(--txt)" : "var(--bd2)"}"
          ${canAdd ? "" : "disabled"}>+</button>
      </div>`;
    }).join("");

    const isHighlighted = totalAssignedForCrop > 0;
    const harvests = countHarvests(crop, STATE.season, STATE.day, "none");

    const tileCost = seedsNeeded * crop.cost;
    const canAfford = STATE.gold >= tileCost;

    html += `<div class="bi" style="${isHighlighted ? "background:#F0F7FF;border-radius:6px;padding:5px 8px;" : ""}">
      <div style="flex:1">
        <div style="font-weight:700">
          ${crop.name}${artisanBadge}${regrowBadge}
          <span style="font-size:10px;font-weight:400;color:var(--txt3)">
            ${rawGpd}g/day raw · ${harvests} harvest${harvests !== 1 ? "s" : ""}
          </span>
        </div>
        <div style="margin-top:3px">${plotControlsHtml}</div>
      </div>
      <div style="text-align:right;white-space:nowrap;padding-left:8px;min-width:80px">
        <div style="font-size:13px;font-weight:700">${seedsNeeded} seeds</div>
        <div style="font-size:12px;color:${canAfford ? "#27500A" : "#A32D2D"}">${cropCost.toLocaleString()}g${canAfford ? " ✓" : ""}</div>
      </div>
    </div>`;
  });

  return html;
}

/** Sum total cost from manual assignments (for grand total). */
function _calcManualProfitCost(allViableCrops, incInstances, reservedSlots) {
  const profitCrops = filterIncomePlotCrops(allViableCrops, STATE.equipment)
    .filter(c => !c.flower && !UTILITY_CROP_NAMES.includes(c.name));
  const manualAssignments = STATE.incomeAssignments || {};
  const profitPlotDefs = getIncomePlots().map((plot, defIdx) => ({ plot, defIdx }));

  let total = 0;
  Object.entries(manualAssignments).forEach(([cropName, defMap]) => {
    const crop = profitCrops.find(c => c.name === cropName);
    if (!crop) return;
    Object.entries(defMap).forEach(([dk, count]) => {
      const defIdx = Number(dk);
      const plotDef = profitPlotDefs[defIdx];
      if (!plotDef) return;
      const fertKey = plotDef.plot.boost || "none";
      const tilesPerInst = calcUsableTiles({ ...plotDef.plot, count: 1 });
      const seedsPerInst = calcSeedsNeeded(crop, tilesPerInst, fertKey, STATE.season, STATE.day);
      total += seedsPerInst * count * crop.cost;
    });
  });
  return total;
}


// ─── PLANTING SCHEDULE ────────────────────────────────────────────────────────

/**
 * Generate and render the day-by-day planting schedule.
 * Events are grouped by day, and crop+type combinations across multiple plots
 * are merged into a single row with plot names listed.
 *
 * @param {object[]} allViableCrops — from buildViableCropList()
 */
function renderSchedule(allViableCrops) {
  const el = document.getElementById("schedule");

  if (STATE.season === "Winter") {
    el.innerHTML = `<div style="color:var(--txt2);font-size:12px;line-height:1.7">
      No outdoor crops in winter.<br>
      • Tend greenhouse &amp; fruit trees<br>
      • Process artisan goods<br>
      • Forage with hoe (Snow Yam, Winter Root)<br>
      • Build animal friendship
    </div>`;
    return;
  }

  const events = _generateScheduleEvents(allViableCrops);
  if (!events.length) {
    el.innerHTML = `<div style="color:var(--txt3)">Add plots above and save to generate your schedule.</div>`;
    return;
  }

  // Merge events with same (day, crop, type) — collect plot names
  const eventsByDay = {};
  events.forEach(event => {
    if (!eventsByDay[event.day]) eventsByDay[event.day] = [];
    const mergeKey = `${event.crop}::${event.type}`;
    const existing = eventsByDay[event.day].find(e => e._mergeKey === mergeKey);
    if (existing) {
      if (event.plot && event.plot !== "Event") existing.plots.push(event.plot);
    } else {
      eventsByDay[event.day].push({
        ...event,
        _mergeKey: mergeKey,
        plots: (event.plot && event.plot !== "Event") ? [event.plot] : [],
      });
    }
  });

  const eventTypeIcons = { plant: "🌱", replant: "🔄", switch: "🔀", harvest: "🌾", festival: "📅" };
  const eventTypeLabels = { plant: "Plant", replant: "Replant", switch: "Switch crop →", harvest: "Harvest", festival: "Event" };
  const eventTypeColors = { plant: "", replant: "", switch: "color:#633806;", harvest: "color:#27500A;", festival: "color:#534AB7;" };

  let html = "";
  Object.keys(eventsByDay)
    .sort((a, b) => +a - +b)
    .forEach(day => {
      const isPast = +day < STATE.day;
      const isToday = +day === STATE.day;
      html += `<div class="sday"${isPast ? ` style="opacity:.35"` : ""}>
        <div class="sday-lbl">Day ${day}${isToday ? " ← today" : isPast ? " (past)" : ""}</div>`;

      html += eventsByDay[day].map(event => {
        const isFestival = event.type === "festival";

        // Count how many times each plot name appears (e.g. 3× "3×3 plots")
        const plotCounts = {};
        event.plots.forEach(p => { plotCounts[p] = (plotCounts[p] || 0) + 1; });
        const plotsLabel = event.plots.length
          ? ` <span style="color:var(--txt2);font-size:11px">— ${Object.entries(plotCounts).map(([p, n]) => `(${n}) ${p}`).join(", ")}</span>`
          : "";

        return `<div class="sevt">
          <span class="sevt-icon">${event.icon || eventTypeIcons[event.type] || "📋"}</span>
          <div${isFestival ? ` style="background:#F3F0FA;border-radius:4px;padding:2px 6px"` : ""}>
            <strong style="${eventTypeColors[event.type] || ""}">
              ${eventTypeLabels[event.type] || event.type} ${event.crop}
            </strong>${plotsLabel}
            ${event.note ? `<div style="font-size:11px;color:var(--txt3)">${event.note}</div>` : ""}
          </div>
        </div>`;
      }).join("");

      html += "</div>";
    });

  el.innerHTML = html;
}

/**
 * Build the raw list of schedule events for the current season.
 * Returns unsorted events; renderSchedule() groups and sorts them.
 *
 * @param {object[]} allViableCrops
 * @returns {Array<{ day, crop, plot, type, note, icon? }>}
 */
function _generateScheduleEvents(allViableCrops) {
  const events = [];
  const seasonEnd = 28;

  const { instances: incInstances, assignments: plotAssignments,
    flowerSlotIndex, utilitySlotIndex } = assignIncomePlots(allViableCrops);
  const incomeCrops = filterIncomePlotCrops(allViableCrops, STATE.equipment);
  const nonFlowerCrops = incomeCrops.filter(c => !c.flower);
  const reservedSlots = new Set([flowerSlotIndex, utilitySlotIndex].filter(i => i !== -1));
  const giantPlan = calcGiantPlotPlan(allViableCrops);
  const supplyPlan = calcSupplyPlotPlan(allViableCrops);

  // ── Utility plot rotation events
  if (utilitySlotIndex !== -1) {
    const utilInst = incInstances[utilitySlotIndex];
    const fertKey = utilInst.plot.boost || "none";
    const rotation = getUtilityPlotRotation(nonFlowerCrops, fertKey);
    rotation.forEach((slot, slotIndex) => {
      events.push({
        day: slot.plantDay,
        crop: slot.crop.name,
        plot: utilInst.plot.name,
        type: slotIndex === 0 ? "plant" : "switch",
        note: slot.re
          ? `Utility · regrows every ${slot.crop.regrow}d — stays all season · ${slot.crop.note.split(".")[0]}`
          : `Utility · harvest day ${slot.harvestDay} · ${slot.crop.note.split(".")[0]}`,
      });
    });
  }

  // ── Income plot (profit + flower) events — auto or manual mode
  const scheduledInstances = STATE.incomeManual
    ? expandManualAssignments(reservedSlots, incInstances, allViableCrops)
    : incInstances.map((inst, idx) => ({
      inst, idx,
      crop: reservedSlots.has(idx) ? null : plotAssignments[idx],
    }));

  scheduledInstances.forEach(({ inst, idx, crop: assignedCrop }) => {
    if (!assignedCrop) return;
    const plot = inst.plot;
    const fertKey = plot.boost || "none";
    const adjustedGrow = applyFertilizerToGrowTime(assignedCrop.grow, fertKey);
    const isMultiSeason = assignedCrop.seasons.length > 1;

    if (assignedCrop.re) {
      // Regrow crop: single plant event
      if (STATE.day + adjustedGrow <= seasonEnd) {
        events.push({
          day: STATE.day, crop: assignedCrop.name, plot: plot.name, type: "plant",
          note: `Regrows every ${assignedCrop.regrow}d — one purchase, harvest all season`,
        });
      }
    } else {
      // Single-harvest: plant, then replant after each harvest
      let currentDay = STATE.day;
      let isFirstPlanting = true;
      let lastHarvestDay = null;

      while (true) {
        if (currentDay > seasonEnd) break;
        if (!isMultiSeason && currentDay + adjustedGrow > seasonEnd) break;

        const harvestDay = currentDay + adjustedGrow;
        events.push({
          day: currentDay, crop: assignedCrop.name, plot: plot.name,
          type: isFirstPlanting ? "plant" : "replant",
          note: `Harvest day ${harvestDay}`,
        });
        lastHarvestDay = harvestDay;
        currentDay = harvestDay;
        isFirstPlanting = false;
      }

      // After final harvest, suggest switching to a faster crop if time permits
      if (lastHarvestDay && lastHarvestDay < seasonEnd) {
        const remainingDays = seasonEnd - lastHarvestDay;
        const switchCandidate = incomeCrops
          .filter(c => c.name !== assignedCrop.name && cropEquipmentRequirementMet(c, STATE.equipment))
          .find(c => {
            const switchGrow = applyFertilizerToGrowTime(c.grow, fertKey);
            return remainingDays >= switchGrow;
          });

        if (switchCandidate) {
          const switchGrow = applyFertilizerToGrowTime(switchCandidate.grow, fertKey);
          const switchHarvests = switchCandidate.re
            ? Math.floor((remainingDays - switchGrow) / switchCandidate.regrow) + 1
            : Math.floor(remainingDays / switchGrow);
          const switchLabel = switchCandidate.re
            ? `Switch to ${switchCandidate.name} — regrows every ${switchCandidate.regrow}d (${switchHarvests} harvests remaining)`
            : `Switch to ${switchCandidate.name} — ${switchHarvests} cycle${switchHarvests !== 1 ? "s" : ""} before season end`;

          events.push({
            day: lastHarvestDay, crop: switchCandidate.name, plot: plot.name,
            type: "switch", note: switchLabel,
          });

          // Add replant events for the switch crop
          if (!switchCandidate.re) {
            let switchDay = lastHarvestDay + switchGrow;
            while (switchDay + switchGrow <= seasonEnd) {
              events.push({
                day: switchDay, crop: switchCandidate.name, plot: plot.name,
                type: "replant", note: `Harvest day ${switchDay + switchGrow}`,
              });
              switchDay += switchGrow;
            }
          }
        }
      }
    }
  });

  // ── Giant plot events
  getGiantPlots().forEach(plot => {
    const fertKey = plot.boost || "none";

    if (giantPlan.mode === "giant" && giantPlan.giantCrop) {
      const gc = giantPlan.giantCrop;
      const adjustedGrow = applyFertilizerToGrowTime(gc.grow, fertKey);
      if (STATE.day + adjustedGrow <= seasonEnd) {
        events.push({
          day: STATE.day, crop: gc.name, plot: plot.name, type: "plant",
          note: `Giant crop — plant in 3×3 blocks, nothing adjacent. Mature day ${STATE.day + adjustedGrow}. Giant forms: ~10%/night`,
        });
      }
    } else if (giantPlan.fillCrop) {
      const fc = giantPlan.fillCrop;
      const adjustedGrow = applyFertilizerToGrowTime(fc.grow, fertKey);
      if (fc.re) {
        if (STATE.day + adjustedGrow <= seasonEnd) {
          events.push({
            day: STATE.day, crop: fc.name, plot: plot.name, type: "plant",
            note: `Fallback — regrows every ${fc.regrow}d`,
          });
        }
      } else {
        let day = STATE.day;
        let first = true;
        while (day + adjustedGrow <= seasonEnd) {
          events.push({
            day, crop: fc.name, plot: plot.name,
            type: first ? "plant" : "replant",
            note: `Fallback — harvest day ${day + adjustedGrow}`,
          });
          day += adjustedGrow;
          first = false;
        }
      }
    }
  });

  // ── Supply plot events
  getSupplyPlots().forEach(plot => {
    const fertKey = plot.boost || "none";
    const isFeedMode = STATE.supplyPlotMode !== "variety";
    const { feedPlan, fillTiles, fillCrop, allSupplyCrops, varietyCrops } = supplyPlan;
    const incomeFallback = filterIncomePlotCrops(allViableCrops, STATE.equipment)[0];

    function emitCropEvents(crop, plotName, label) {
      const adjustedGrow = applyFertilizerToGrowTime(crop.grow, fertKey);
      if (crop.re) {
        if (STATE.day + adjustedGrow <= seasonEnd) {
          events.push({
            day: STATE.day, crop: crop.name, plot: plotName, type: "plant",
            note: `${label} — regrows every ${crop.regrow || "?"}d`,
          });
        }
      } else {
        let day = STATE.day;
        let first = true;
        while (day + adjustedGrow <= seasonEnd) {
          events.push({
            day, crop: crop.name, plot: plotName,
            type: first ? "plant" : "replant",
            note: `${label} — harvest day ${day + adjustedGrow}`,
          });
          day += adjustedGrow;
          first = false;
        }
      }
    }

    if (!allSupplyCrops.length) {
      if (incomeFallback) emitCropEvents(incomeFallback, plot.name, "Supply fallback");
      return;
    }

    if (isFeedMode) {
      feedPlan.forEach(({ crop }) => emitCropEvents(crop, plot.name, "Hay crop · Mill for animal feed"));
      if (fillTiles > 0 && fillCrop && fillCrop.name !== feedPlan[0]?.crop?.name) {
        emitCropEvents(fillCrop, plot.name, "Supply variety");
      }
    } else {
      const list = varietyCrops.length ? varietyCrops : allSupplyCrops;
      list.forEach(vc => emitCropEvents(vc, plot.name, "Variety supply"));
    }
  });

  // ── Festival events
  (FESTIVALS[STATE.season] || []).forEach(festival => {
    if (festival.day >= STATE.day) {
      events.push({
        day: festival.day, crop: festival.name,
        plot: "Event", type: "festival",
        note: festival.note, icon: festival.icon,
      });
    }
  });

  events.sort((a, b) => a.day - b.day || a.plot.localeCompare(b.plot));
  return events;
}


// ─── FORAGE ───────────────────────────────────────────────────────────────────

/**
 * Render the seasonal forage items grid.
 * Items with artisan pairings show a badge if that equipment is owned.
 * Time-limited items (e.g. Salmonberry bushes) show a special warning.
 */
function renderForage() {
  const items = FORAGE[STATE.season] || [];
  document.getElementById("forage-season-lbl").textContent = `${STATE.season} — what to look out for`;
  const el = document.getElementById("forage-content");

  if (!items.length) {
    el.innerHTML = `<div style="color:var(--txt3)">No forage this season.</div>`;
    return;
  }

  let prefixHtml = "";
  if (STATE.season === "Winter") {
    prefixHtml = `<div class="tip-box" style="margin-bottom:10px">
      <strong>Winter is forage season.</strong> No outdoor crops — bring a hoe for Snow Yam and Winter Root.
      Crystal Fruit is rare but very valuable. Process with Keg or Preserves Jar for best returns.
    </div>`;
  }

  const gridHtml = items.map(item => {
    const artisanBadge = (item.artisan && ownsEquipment(item.artisan))
      ? `<span class="badge bg-purple" style="font-size:9px;margin-left:3px">${item.artisan}</span>` : "";
    const specialWarning = item.special
      ? `<div style="font-size:10px;color:#633806;font-weight:600;margin-top:2px">⚠ ${item.special}</div>` : "";
    return `<div class="fcrd">
      <div class="fcrd-name">${item.name}${artisanBadge}</div>
      <div class="fcrd-sell">${item.sell}g raw</div>
      <div class="fcrd-note">${item.note}</div>
      ${specialWarning}
    </div>`;
  }).join("");

  el.innerHTML = prefixHtml + `<div class="forage-grid">${gridHtml}</div>`;
}


// ─── RENDER ALL (SEASONAL TAB) ────────────────────────────────────────────────

/**
 * Re-render everything in the Seasonal Farm tab.
 * Also stores the crop list on window.__lastCrops so inline onclick
 * toggle buttons (which can't use closures) can access the current crop set.
 */
function renderAll() {
  updateStatusBanner();
  const viableCrops = buildViableCropList(STATE.season, STATE.day, STATE.equipment);
  window.__lastCrops = viableCrops; // exposed for toggle button onclick handlers
  renderCropTable(viableCrops);
  renderBuyList(viableCrops);
  renderSchedule(viableCrops);
  renderForage();
}
