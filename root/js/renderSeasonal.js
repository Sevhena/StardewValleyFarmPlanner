/**
 * renderSeasonal.js — Seasonal Farm tab rendering
 * ─────────────────────────────────────────────────
 * Renders everything inside the "Seasonal farm" tab panel.
 * All HTML fragment construction is delegated to templates.js.
 *
 * Functions:
 *   renderCropTable()  — ranked crop table (all viable crops for the season)
 *   renderBuyList()    — season-start shopping list (seeds + costs by plot type)
 *   renderSchedule()   — day-by-day planting/replant/switch/festival schedule
 *   renderForage()     — seasonal forage items grid
 *   renderAll()        — convenience wrapper that calls all four above
 *
 * Depends on: data.js, gameCalc.js, state.js, plotLogic.js, templates.js
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
    tbody.innerHTML = `<tr><td colspan="7">${tplEmpty("No crops can complete a full harvest with days remaining.")}</td></tr>`;
    return;
  }

  const maxEffectiveGpd = Math.max(
    ...viableCrops.map(c => calcEffectiveGoldPerDay(c)),
    1
  );

  tbody.innerHTML = viableCrops.map((crop, rankIndex) => {
    // Equipment warning
    const missingEquipment = crop.reqE && !ownsEquipment(crop.reqE);
    const equipWarning = missingEquipment
      ? `<div class="equip-warn">Needs ${crop.reqE}</div>` : "";

    // Growth time display
    const baseGrowDays = crop.grow;

    const growDisplay = `${baseGrowDays}d`

    const regrowDisplay = crop.re && crop.regrow
      ? `<span class="grow-regrow">+${crop.regrow}d regrow</span>` : "";

    // Gold/day display
    const effectiveGpd = calcEffectiveGoldPerDay(crop);
    const rawGpd = Math.round(calcRawGoldPerDay(crop));
    console.log(`Crop: ${crop.name}, Effective GPD: ${effectiveGpd}, Raw GPD: ${rawGpd}`);
    const isArtisanBoosted = effectiveGpd > rawGpd + 1;
    const gpdDisplay = isArtisanBoosted
      ? `<span class="gpd-artisan">${Math.round(effectiveGpd)}</span>
         <div class="gpd-raw-sub">${rawGpd} raw</div>`
      : rawGpd;

    const rankBarPercent = Math.round(Math.min(100, (effectiveGpd / maxEffectiveGpd) * 100));

    return tplCropTableRow({
      crop, rankIndex, growDisplay, regrowDisplay, gpdDisplay,
      rankBarPercent, dimmed: missingEquipment, equipWarning,
    });
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

  if (STATE.season === "Winter") {
    el.innerHTML = tplWinterBuyList();
    return;
  }

  let html = "";
  let runningTotalCost = 0;

  // ── Festival warnings
  const upcomingFestivals = (FESTIVALS[STATE.season] || [])
    .filter(f => f.day >= STATE.day && f.day <= STATE.day + 7);
  upcomingFestivals.forEach(f => {
    html += tplFestivalBox(f.icon, f.name, f.day, f.note);
  });

  // ── Season tips
  if (STATE.season === "Spring" && STATE.year === 1) {
    html += tplTipBox(`<strong>Year 1 Spring:</strong> Plant Parsnips day 1 for fast early gold.
      Egg Festival on day 13 → buy Strawberry seeds (100g each) — best spring crop.`);
  } else if (STATE.season === "Spring" && STATE.day <= 12) {
    html += tplTipBox(`<strong>Reminder:</strong> Egg Festival day 13 — budget for Strawberry seeds (100g each). Don't miss it.`);
  }

  // ── Assignment data
  const { instances: incInstances, assignments: plotAssignments, incomeCrops,
    flowerPool, nonFlowerCrops, flowerSlotIndex, utilitySlotIndex } = assignIncomePlots(allViableCrops);
  const giantPlan = calcGiantPlotPlan(allViableCrops);
  const supplyPlan = calcSupplyPlotPlan(allViableCrops);
  const reservedSlots = new Set([flowerSlotIndex, utilitySlotIndex].filter(i => i !== -1));

  // ─────────────────────────────────────────────────────────────────────
  // INCOME PLOTS
  // ─────────────────────────────────────────────────────────────────────
  const incomePlots = getIncomePlots();
  if (incomePlots.length > 0) {
    const totalIncomeTiles = getTotalIncomeTiles();
    const totalInstanceCount = incInstances.length;
    const isManualMode = STATE.incomeManual;

    const manualToggleBtn = tplToggleBtn(
      isManualMode ? "✏ Manual" : "⚙ Auto",
      "toggleIncomeManualMode(window.__lastCrops || [])",
      isManualMode,
      "Toggle manual crop assignment for profit plots"
    );

    html += tplBuyHeader(
      `Income plots — ${totalInstanceCount} individual plot${totalInstanceCount !== 1 ? "s" : ""} · ${totalIncomeTiles} tiles`,
      `<span class="bgh-mode">${isManualMode ? "manual assignment" : "round-robin · variety preserved"}</span>${manualToggleBtn}`
    );

    if (!incomeCrops.length) {
      html += `<div class="no-income-note">No viable income crops for the remaining days. Consider repurposing these plots for fast supply crops.</div>`;
    } else {
      // ── Flower slot
      if (flowerSlotIndex !== -1 && flowerPool.length) {
        const inst = incInstances[flowerSlotIndex];
        const flowerCrop = plotAssignments[flowerSlotIndex];
        if (flowerCrop) {
          const fertKey = inst.plot.boost || "none";
          const seedsNeeded = calcSeedsNeeded(flowerCrop, inst.usableTiles, fertKey);
          const tileCost = seedsNeeded * flowerCrop.cost;
          runningTotalCost += tileCost;
          const harvests = countHarvests(flowerCrop, fertKey);

          const nextFlowerIdx = ((STATE.flowerAltIdx || 0) + 1) % flowerPool.length;
          const cycleBtn = flowerPool.length > 1
            ? tplToggleBtn(
              `⇄ ${flowerPool[nextFlowerIdx].name}`,
              "toggleFlowerCrop(window.__lastCrops || [])",
              (STATE.flowerAltIdx || 0) > 0
            )
            : "";

          const altLine = flowerPool.length > 1
            ? `<div class="meta-line">Alt flowers: ${flowerPool.map(f => f.name).join(", ")}</div>` : "";

          html += tplFlowerItem({
            titleHtml: `${flowerCrop.name} ${tplBadge("flower", "bg-pink")} <span class="meta-line">(${inst.plot.w}×${inst.plot.h} plot)</span> ${cycleBtn}`,
            subtitleHtml: `For gifting, Bee House boost, bundles and recipes`,
            noteLine: `${harvests} harvest${harvests !== 1 ? "s" : ""} · ${flowerCrop.sell}g raw · ${flowerCrop.note.split(".")[0]}${altLine}`,
            seedCount: seedsNeeded,
            cost: tileCost,
            canAfford: STATE.gold >= tileCost,
          });
        }
      }

      // ── Utility slot
      if (utilitySlotIndex !== -1) {
        const inst = incInstances[utilitySlotIndex];
        const fertKey = inst.plot.boost || "none";
        const utilityRotation = getUtilityPlotRotation(nonFlowerCrops, fertKey);

        if (utilityRotation.length) {
          const seedsByUtilityCrop = {};
          const harvestsPerUtilityCrop = {};
          utilityRotation.forEach(({ crop }) => {
            if (!seedsByUtilityCrop[crop.name]) seedsByUtilityCrop[crop.name] = { crop, seeds: 0 };
            seedsByUtilityCrop[crop.name].seeds += inst.usableTiles;

            if (!harvestsPerUtilityCrop[crop.name]) harvestsPerUtilityCrop[crop.name] = 0;
            harvestsPerUtilityCrop[crop.name]++;
          });
          const utilityEntries = Object.values(seedsByUtilityCrop);
          const utilityTotalCost = utilityEntries.reduce((sum, e) => sum + e.seeds * e.crop.cost, 0);
          runningTotalCost += utilityTotalCost;



          const detailLines = utilityEntries.map(e =>
            `<div class="util-detail-line">→ ${e.crop.name}: ${harvestsPerUtilityCrop[e.crop.name]} harvests · ${e.seeds} seeds · ${e.crop.cost}g each · ${e.crop.note.split(".")[0]}</div>`
          ).join("");

          html += tplUtilityItem({
            titleHtml: `Utility plot ${tplBadge("utility", "bg-teal")} ${tplBadge("variety", "bg-green")} <span class="meta-line">(${inst.plot.w}×${inst.plot.h} plot · rotates each harvest)</span>`,
            subtitleHtml: detailLines,
            noteLine: "",
            cropCount: utilityEntries.length,
            cost: utilityTotalCost,
            canAfford: STATE.gold >= utilityTotalCost,
          });
        }
      }

      // ── Profit crops (auto or manual)
      if (isManualMode) {
        const { html: profitHtml, cost: profitCost } = _renderManualIncomeProfitRows(allViableCrops, incInstances, reservedSlots);
        html += profitHtml;
        runningTotalCost += profitCost;
      } else {
        html += _renderAutoProfitRows(allViableCrops, incInstances, plotAssignments, reservedSlots);
        runningTotalCost += _calcAutoProfitCost(incInstances, plotAssignments, reservedSlots);
      }
    }
  } else {
    html += `<div class="no-income-note">No income plots defined. Add some in the plot editor to get tailored crop recommendations for them.</div>`;
  }

  // ─────────────────────────────────────────────────────────────────────
  // GIANT PLOTS
  // ─────────────────────────────────────────────────────────────────────
  const giantPlots = getGiantPlots();
  if (giantPlots.length > 0) {
    const { mode, giantCrop, allGiantCrops, fillCrop, giantBlocks, leftoverTiles, totalGiantTiles } = giantPlan;

    const hasManyGiantCrops = allGiantCrops && allGiantCrops.length > 1;
    const nextGiantIdx = ((STATE.giantCropAltIdx || 0) + 1) % (allGiantCrops?.length || 1);
    const cycleGiantBtn = hasManyGiantCrops
      ? tplToggleBtn(
        `⇄ Switch (${allGiantCrops[nextGiantIdx]?.name || ""})`,
        "toggleGiantCrop(window.__lastCrops || [])",
        (STATE.giantCropAltIdx || 0) > 0
      )
      : "";

    if (mode === "giant" && giantCrop) {
      const giantSeedsNeeded = giantBlocks > 0 ? giantBlocks * 9 : totalGiantTiles;
      const giantSeedCost = giantSeedsNeeded * giantCrop.cost;
      runningTotalCost += giantSeedCost;

      if (giantBlocks === 0) {
        html += '<span class="bgh-warn">⚠ no time for giants</span>'
      }

      html += tplBuyHeader(
        giantBlocks > 0 ? `Giant plots — ${giantBlocks} block${giantBlocks !== 1 ? "s" : ""} × 9 + ${leftoverTiles} fill` : "Giant plots — No blocks available for giant crops",
        cycleGiantBtn
      );

      html += tplBuyItem({
        titleHtml: `${giantCrop.name} ${tplBadge("giant crop", "bg-amber")}`,
        subtitleHtml: `${giantBlocks > 0 ? `${giantBlocks} block${giantBlocks !== 1 ? "s" : ""} of 3×3 = ` : ""}${giantSeedsNeeded} seeds · leave nothing adjacent to 3×3 groups`,
        noteLine: giantBlocks > 0 ? `~10% giant-form chance/night once mature · ~2× yield on formation · ${giantCrop.note.split(".")[0]}` : "no chance of giant-form crops · need better plot layout",
        seedCount: giantSeedsNeeded,
        cost: giantSeedCost,
        canAfford: STATE.gold >= giantSeedCost,
      });

      if (leftoverTiles > 0 && fillCrop) {
        const fillSeeds = calcSeedsNeeded(fillCrop, leftoverTiles, "none");
        const fillCost = fillSeeds * fillCrop.cost;
        runningTotalCost += fillCost;
        html += tplBuyItem({
          titleHtml: `${fillCrop.name} <span class="fill-note">(${leftoverTiles} fill tiles)</span>`,
          noteLine: "Fill tiles outside giant blocks — best income crop",
          seedCount: fillSeeds,
          cost: fillCost,
          canAfford: STATE.gold >= fillCost,
        });
      }

    } else {
      html += tplBuyHeader(
        `Giant plots — ${totalGiantTiles} tiles`,
        `<span class="bgh-warn">⚠ no time for giants</span>`
      );
      html += `<div class="no-giant-note">Not enough days for giant crops. Planting best income crops instead.</div>`;

      if (fillCrop) {
        const fallbackSeeds = calcSeedsNeeded(fillCrop, totalGiantTiles, "none");
        const fallbackCost = fallbackSeeds * fillCrop.cost;
        runningTotalCost += fallbackCost;
        const harvests = countHarvests(fillCrop, "none");
        html += tplBuyItem({
          titleHtml: fillCrop.name,
          subtitleHtml: `${totalGiantTiles} tiles · ${harvests} harvest${harvests !== 1 ? "s" : ""}`,
          noteLine: fillCrop.note.split(".")[0],
          seedCount: fallbackSeeds,
          cost: fallbackCost,
          canAfford: STATE.gold >= fallbackCost,
        });
      }
    }
  } else {
    html += `<div class="no-giant-note">No giant crop plots defined. Add some in the plot editor to get tailored crop recommendations for them.</div>`;
  }

  // ─────────────────────────────────────────────────────────────────────
  // SUPPLY PLOTS
  // ─────────────────────────────────────────────────────────────────────
  const supplyPlotDefs = getSupplyPlots();
  if (supplyPlotDefs.length > 0) {
    const { feedPlan, feedTilesTotal, fillTiles, fillCrop: supplyFillCrop,
      winterHayNeeded, allSupplyCrops, hasHayCrops, varietyCrops, totalSupplyTiles } = supplyPlan;
    const isFeedMode = STATE.supplyPlotMode !== "variety";
    const modeLabel = isFeedMode ? "🌾 Feed mode" : "🌿 Variety mode";

    const supplyToggleBtn = allSupplyCrops.length
      ? tplToggleBtn(
        isFeedMode ? "⇄ already stocked →" : "⇄ need hay →",
        "toggleSupplyMode(window.__lastCrops || [])",
        !isFeedMode
      )
      : "";

    html += tplBuyHeader(
      `Supply plots — ${totalSupplyTiles} tiles · ${modeLabel}`,
      supplyToggleBtn
    );

    if (!allSupplyCrops.length) {
      html += `<div class="no-supply-note">No supply crops this season. Using best income crops as fallback.</div>`;
      const fallback = filterIncomePlotCrops(allViableCrops, STATE.equipment)[0];
      if (fallback) {
        const fSeeds = calcSeedsNeeded(fallback, totalSupplyTiles, "none");
        const fCost = fSeeds * fallback.cost;
        runningTotalCost += fCost;
        const fHarvests = countHarvests(fallback, "none");
        html += tplBuyItem({
          titleHtml: `${fallback.name} <span class="fallback-note">(fallback)</span>`,
          subtitleHtml: `${totalSupplyTiles} tiles · ${fHarvests} harvest${fHarvests !== 1 ? "s" : ""}`,
          seedCount: fSeeds,
          cost: fCost,
          canAfford: STATE.gold >= fCost,
        });
      }

    } else if (isFeedMode) {
      if (feedPlan.length && feedTilesTotal > 0) {
        const fertKey = supplyPlotDefs[0]?.boost || "none";
        feedPlan.forEach(({ crop, tiles }) => {
          const fHarvests = countHarvests(crop, fertKey);
          const fSeeds = calcSeedsNeeded(crop, tiles, fertKey);
          const fCost = fSeeds * crop.cost;
          runningTotalCost += fCost;
          html += tplBuyItem({
            titleHtml: `${crop.name} ${tplBadge("hay/feed", "bg-teal")}`,
            subtitleHtml: `${tiles} tiles · Mill → animal feed · ~${tiles * fHarvests} of ${winterHayNeeded} hay`,
            noteLine: crop.note.split(".")[0],
            seedCount: fSeeds,
            cost: fCost,
            canAfford: STATE.gold >= fCost,
          });
        });
      } else if (!hasHayCrops) {
        html += `<div class="no-hay-warn">⚠ No feed crops available this season — stock hay before winter or enable Mill.</div>`;
      } else {
        html += `<div class="hay-ok-note">✓ Hay estimation shows current season can cover needs — review alternate plan.</div>`;
      }

      if (fillTiles > 0 && supplyFillCrop) {
        const fertKey = supplyPlotDefs[0]?.boost || "none";
        const fSeeds = calcSeedsNeeded(supplyFillCrop, fillTiles, fertKey);
        const fCost = fSeeds * supplyFillCrop.cost;
        runningTotalCost += fCost;
        html += tplBuyItem({
          titleHtml: `${supplyFillCrop.name} <span class="fill-note">(${fillTiles} remaining tiles)</span>`,
          subtitleHtml: supplyFillCrop.note.split(".")[0],
          seedCount: fSeeds,
          cost: fCost,
          canAfford: STATE.gold >= fCost,
        });
      }

    } else {
      // Variety mode
      html += `<div class="hay-stocked-note">Hay stocked — all supply tiles going to variety crops.</div>`;
      const varietyList = varietyCrops.length ? varietyCrops : allSupplyCrops;
      const tilesEach = Math.floor(totalSupplyTiles / varietyList.length);
      const tileRem = totalSupplyTiles % varietyList.length;
      const fertKey = supplyPlotDefs[0]?.boost || "none";

      varietyList.forEach((vc, i) => {
        const tiles = tilesEach + (i < tileRem ? 1 : 0);
        if (!tiles) return;
        const vSeeds = calcSeedsNeeded(vc, tiles, fertKey);
        const vCost = vSeeds * vc.cost;
        const vHarvests = countHarvests(vc, fertKey);
        runningTotalCost += vCost;
        html += tplBuyItem({
          titleHtml: `${vc.name} ${tplBadge("variety", "bg-green")}`,
          subtitleHtml: `${tiles} tiles · ${vHarvests} harvest${vHarvests !== 1 ? "s" : ""} · ${vc.note.split(".")[0]}`,
          seedCount: vSeeds,
          cost: vCost,
          canAfford: STATE.gold >= vCost,
        });
      });
    }
  } else {
    html += `<div class="no-supply-note">No supply plots defined. Add some in the plot editor to get tailored crop recommendations for them.</div>`;
  }

  // ── Empty state
  if (!incomePlots.length && !giantPlots.length && !supplyPlotDefs.length) {
    el.innerHTML = tplEmpty("Add farm plots above to generate your shopping list.");
    return;
  }

  // ── Grand total
  html += tplBuyTotal(runningTotalCost, STATE.gold);
  el.innerHTML = html;
}


// ── Private helpers ────────────────────────────────────────────────────────────

/**
 * Render auto-assigned profit plot rows (grouped by crop name).
 * Returns HTML string only.
 */
function _renderAutoProfitRows(allViableCrops, incInstances, plotAssignments, reservedSlots) {
  const seedsByCrop = {};
  incInstances.forEach((inst, idx) => {
    if (reservedSlots.has(idx)) return;
    const crop = plotAssignments[idx];
    if (!crop) return;
    const fertKey = inst.plot.boost || "none";
    const seeds = calcSeedsNeeded(crop, inst.usableTiles, fertKey);
    if (!seedsByCrop[crop.name]) seedsByCrop[crop.name] = { crop, instances: [], totalSeeds: 0, totalCost: 0 };
    seedsByCrop[crop.name].instances.push(inst);
    seedsByCrop[crop.name].totalSeeds += seeds;
    seedsByCrop[crop.name].totalCost += seeds * crop.cost;
  });

  return Object.values(seedsByCrop)
    .sort((a, b) =>
      calcEffectiveGoldPerDay(b.crop) -
      calcEffectiveGoldPerDay(a.crop)
    )
    .map(({ crop, instances: insts, totalSeeds, totalCost }) => {
      const fertKey = insts[0].plot.boost || "none";
      const harvests = countHarvests(crop, fertKey);
      const effectiveGpd = Math.round(calcEffectiveGoldPerDay(crop));
      const rawGpd = Math.round(calcRawGoldPerDay(crop));
      const artisanBadge = effectiveGpd > rawGpd
        ? tplBadge(`→ artisan ~${effectiveGpd}g/day`, "bg-purple", "margin-left:3px") : "";
      const regrowBadge = crop.re ? tplBadge("buy once", "bg-pink", "margin-left:3px") : "";
      const boostNote = fertKey !== "none" ? ` · ${FERTILIZER_CONFIGS[fertKey].label}` : "";

      const sizeCounts = {};
      insts.forEach(({ plot }) => {
        const k = `${plot.w}×${plot.h}`;
        sizeCounts[k] = (sizeCounts[k] || 0) + 1;
      });
      const sizeLabel = Object.entries(sizeCounts).map(([k, v]) => `(${v}) ${k}`).join(", ");
      const plotCountNote = insts.length > 1
        ? ` <span class="plot-count-note">(${insts.length} plots)</span>` : "";

      return tplBuyItem({
        titleHtml: `${crop.name}${artisanBadge}${regrowBadge}${plotCountNote}`,
        subtitleHtml: `${sizeLabel}${boostNote}`,
        noteLine: `${harvests} harvest${harvests !== 1 ? "s" : ""} · ${rawGpd}g/day raw${crop.note ? ` · ${crop.note.split(".")[0]}` : ""}`,
        seedCount: totalSeeds,
        cost: totalCost,
        canAfford: STATE.gold >= totalCost,
      });
    }).join("");
}

function _calcAutoProfitCost(incInstances, plotAssignments, reservedSlots) {
  let total = 0;
  incInstances.forEach((inst, idx) => {
    if (reservedSlots.has(idx)) return;
    const crop = plotAssignments[idx];
    if (!crop) return;
    const fertKey = inst.plot.boost || "none";
    total += calcSeedsNeeded(crop, inst.usableTiles, fertKey) * crop.cost;
  });
  return total;
}

/**
 * Render manual assignment profit rows.
 * Returns { html, cost } so the caller can accumulate the running total.
 */
function _renderManualIncomeProfitRows(allViableCrops, incInstances, reservedSlots) {
  const profitCrops = filterIncomePlotCrops(allViableCrops, STATE.equipment)
    .filter(c => !c.flower && !UTILITY_CROP_NAMES.includes(c.name))
    .sort((a, b) =>
      calcEffectiveGoldPerDay(b) -
      calcEffectiveGoldPerDay(a)
    );

  const { total: defTotal, available: defAvailable } = calcManualSlotAvailability(reservedSlots, incInstances);
  const manualAssignments = STATE.incomeAssignments || {};

  const totalAssignedCount = Object.values(manualAssignments)
    .reduce((sum, defMap) => sum + Object.values(defMap).reduce((s, v) => s + v, 0), 0);
  const totalProfitSlots = incInstances.filter((_, i) => !reservedSlots.has(i)).length;
  const unassignedCount = totalProfitSlots - totalAssignedCount;

  let html = "";
  let cost = 0;

  if (unassignedCount > 0) html += tplUnassignedWarning(unassignedCount);

  const profitPlotDefs = getIncomePlots()
    .map((plot, defIdx) => ({ plot, defIdx }))
    .filter(({ defIdx }) => defTotal[defIdx] > 0);

  profitCrops.forEach(crop => {
    const cropAssignment = manualAssignments[crop.name] || {};
    const totalAssignedForCrop = Object.values(cropAssignment).reduce((s, v) => s + v, 0);
    const hasAvailableSlots = profitPlotDefs.some(({ defIdx }) => defAvailable[defIdx] > 0);
    if (totalAssignedForCrop === 0 && !hasAvailableSlots) return;

    let seedsNeeded = 0;
    let cropCost = 0;
    profitPlotDefs.forEach(({ plot, defIdx }) => {
      const cnt = cropAssignment[defIdx] || 0;
      if (!cnt) return;
      const fertKey = plot.boost || "none";
      const tilesPerInst = calcUsableTiles({ ...plot, count: 1 });
      const seedsPerInst = calcSeedsNeeded(crop, tilesPerInst, fertKey);
      seedsNeeded += seedsPerInst * cnt;
      cropCost += seedsPerInst * cnt * crop.cost;
    });
    cost += cropCost;

    const effectiveGpd = Math.round(calcEffectiveGoldPerDay(crop));
    const rawGpd = Math.round(calcRawGoldPerDay(crop));
    const artisanBadge = effectiveGpd > rawGpd
      ? tplBadge(`→ artisan ~${effectiveGpd}g/day`, "bg-purple", "margin-left:3px") : "";
    const regrowBadge = crop.re ? tplBadge("buy once", "bg-pink", "margin-left:3px") : "";
    const harvests = countHarvests(crop, "none");

    const plotControlsHtml = profitPlotDefs.map(({ plot, defIdx }) => {
      const assigned = cropAssignment[defIdx] || 0;
      const available = defAvailable[defIdx] || 0;
      return tplManualControl({
        plotName: plot.name, w: plot.w, h: plot.h,
        assigned, total: defTotal[defIdx] || 0,
        cropName: crop.name, defIdx,
        canAdd: available > 0,
        canRemove: assigned > 0,
      });
    }).join("");

    html += tplBuyItem({
      titleHtml: `${crop.name}${artisanBadge}${regrowBadge} <span class="meta-line">${rawGpd}g/day raw · ${harvests} harvest${harvests !== 1 ? "s" : ""}</span>`,
      extraLeft: `<div style="margin-top:3px">${plotControlsHtml}</div>`,
      seedCount: seedsNeeded,
      cost: cropCost,
      canAfford: STATE.gold >= cropCost,
      highlight: totalAssignedForCrop > 0,
    });
  });

  return { html, cost };
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
    el.innerHTML = tplWinterSchedule();
    return;
  }

  const events = _generateScheduleEvents(allViableCrops);
  if (!events.length) {
    el.innerHTML = tplEmpty("Add plots above and save to generate your schedule.");
    return;
  }

  // Merge events with same (day, crop, type)
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
  const eventTypeClasses = { plant: "sevt-plant", replant: "sevt-replant", switch: "sevt-switch", harvest: "sevt-harvest", festival: "sevt-festival" };

  let html = "";
  Object.keys(eventsByDay)
    .sort((a, b) => +a - +b)
    .forEach(day => {
      const eventsHtml = eventsByDay[day].map(event => {
        const plotCounts = {};
        event.plots.forEach(p => { plotCounts[p] = (plotCounts[p] || 0) + 1; });
        const plotsLabel = event.plots.length
          ? `— ${Object.entries(plotCounts).map(([p, n]) => `(${n}) ${p}`).join(", ")}` : "";

        return tplScheduleEvent({
          icon: event.icon || eventTypeIcons[event.type] || "📋",
          typeLabel: eventTypeLabels[event.type] || event.type,
          typeClass: eventTypeClasses[event.type] || "",
          cropName: event.crop,
          plotsLabel,
          note: event.note || "",
          isFestival: event.type === "festival",
        });
      }).join("");

      html += tplScheduleDay(+day, STATE.day, eventsHtml);
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

  // ── Income plot events
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
      if (STATE.day + adjustedGrow <= seasonEnd) {
        events.push({
          day: STATE.day, crop: assignedCrop.name, plot: plot.name, type: "plant",
          note: `Regrows every ${assignedCrop.regrow}d — one purchase, harvest all season`,
        });
      }
    } else {
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

      if (lastHarvestDay && lastHarvestDay < seasonEnd) {
        const remainingDays = seasonEnd - lastHarvestDay;
        const switchCandidate = incomeCrops
          .filter(c => c.name !== assignedCrop.name && cropEquipmentRequirementMet(c))
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
      _emitSingleCropEvents(events, giantPlan.fillCrop, plot.name, "none", "Fallback");
    }
  });

  // ── Supply plot events
  getSupplyPlots().forEach(plot => {
    const fertKey = plot.boost || "none";
    const isFeedMode = STATE.supplyPlotMode !== "variety";
    const { feedPlan, fillTiles, fillCrop, allSupplyCrops, varietyCrops } = supplyPlan;
    const incomeFallback = filterIncomePlotCrops(allViableCrops, STATE.equipment)[0];

    if (!allSupplyCrops.length) {
      if (incomeFallback) _emitSingleCropEvents(events, incomeFallback, plot.name, fertKey, "Supply fallback");
      return;
    }

    if (isFeedMode) {
      feedPlan.forEach(({ crop }) => _emitSingleCropEvents(events, crop, plot.name, fertKey, "Hay crop · Mill for animal feed"));
      if (fillTiles > 0 && fillCrop && fillCrop.name !== feedPlan[0]?.crop?.name) {
        _emitSingleCropEvents(events, fillCrop, plot.name, fertKey, "Supply variety");
      }
    } else {
      const list = varietyCrops.length ? varietyCrops : allSupplyCrops;
      list.forEach(vc => _emitSingleCropEvents(events, vc, plot.name, fertKey, "Variety supply"));
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

/**
 * Emit plant/replant schedule events for a non-giant, non-regrow or regrow crop.
 * Extracted from _generateScheduleEvents to reduce repetition.
 */
function _emitSingleCropEvents(events, crop, plotName, fertKey, label) {
  const seasonEnd = 28;
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
    el.innerHTML = tplEmpty("No forage this season.");
    return;
  }

  let prefixHtml = "";
  if (STATE.season === "Winter") {
    prefixHtml = tplTipBox(
      `<strong class="forage-winter-tip">Winter is forage season.</strong> No outdoor crops — bring a hoe for Snow Yam and Winter Root.
      Crystal Fruit is rare but very valuable. Process with Keg or Preserves Jar for best returns.`
    );
  }

  const gridHtml = items.map(item =>
    tplForageCard(item, ownsEquipment(item.artisan))
  ).join("");

  el.innerHTML = prefixHtml + `<div class="forage-grid">${gridHtml}</div>`;
}


// ─── RENDER ALL ───────────────────────────────────────────────────────────────

/**
 * Re-render everything in the Seasonal Farm tab.
 * Also stores the crop list on window.__lastCrops so inline onclick
 * toggle buttons (which can't use closures) can access the current crop set.
 */
function renderAllSeasonal() {
  updateStatusBanner();
  const viableCrops = buildViableCropList(STATE.season, STATE.day, STATE.equipment);
  window.__lastCrops = viableCrops;
  renderCropTable(viableCrops);
  renderBuyList(viableCrops);
  renderSchedule(viableCrops);
  renderForage();
}