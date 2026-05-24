/**
 * plotLogic.js — Plot assignment and crop distribution logic
 * ──────────────────────────────────────────────────────────
 * Determines which crops go where across income, giant, and supply plots.
 * All functions here read from STATE and call helpers from gameCalc.js.
 *
 * Sections:
 *   expandIncomePlotInstances — flatten plot definitions → individual instances
 *   assignIncomePlots         — main assignment algorithm (flower / utility / profit)
 *   getUtilityPlotRotation    — builds the per-harvest crop rotation for the utility plot
 *   calcGiantPlotPlan         — decides what goes in giant plots (giant crop or fallback)
 *   calcSupplyPlotPlan        — decides feed vs. variety crops for supply plots
 *   manualAssignmentHelpers   — helpers for manual income plot assignment mode
 */


// ─── EXPAND INCOME PLOT INSTANCES ────────────────────────────────────────────

/**
 * Flatten income plot definitions into individual instances.
 * A plot with count=3 produces 3 separate instance objects, each representing
 * one physical plot that can be assigned a different crop.
 *
 * @returns {Array<{ plot, defIdx, instanceIdx, usableTiles }>}
 *   plot        — the plot definition object
 *   defIdx      — index of this definition in getIncomePlots()
 *   instanceIdx — which instance within this definition (0-based)
 *   usableTiles — tile count for ONE instance of this plot (count=1)
 */
function expandIncomePlotInstances() {
  const instances = [];
  getIncomePlots().forEach((plot, defIdx) => {
    for (let i = 0; i < (plot.count || 1); i++) {
      instances.push({
        plot,
        defIdx,
        instanceIdx: i,
        usableTiles: calcUsableTiles({ ...plot, count: 1 }),
      });
    }
  });
  return instances;
}


// ─── UTILITY PLOT ROTATION ────────────────────────────────────────────────────

/**
 * Build the crop rotation schedule for the utility plot.
 * Cycles through UTILITY_CROP_NAMES, planting each in sequence whenever the
 * previous crop finishes its final harvest. Regrow crops lock in for the rest
 * of the season once planted (no further rotation after that).
 *
 * @param {object[]} incomePoolCrops — filtered list of viable income crops (no flowers)
 * @param {string}   fertilizerKey  — fertilizer on the utility plot
 * @returns {Array<{ crop, plantDay, harvestDay, re }>}
 */
function getUtilityPlotRotation(incomePoolCrops, fertilizerKey) {
  // Build an ordered list of available utility crops (preserves UTILITY_CROP_NAMES order)
  const availableUtilityCrops = UTILITY_CROP_NAMES
    .map(name => incomePoolCrops.find(c => c.name === name))
    .filter(Boolean);

  if (!availableUtilityCrops.length) return [];

  const seasonEnd = 28;
  const plantingSlots = [];
  let currentDay = STATE.day;
  let utilityIndex = 0; // cycles through availableUtilityCrops

  while (currentDay <= seasonEnd) {
    let slotFilled = false;

    // Try each utility crop in order, starting from the current index
    for (let attempt = 0; attempt < availableUtilityCrops.length; attempt++) {
      const crop = availableUtilityCrops[(utilityIndex + attempt) % availableUtilityCrops.length];
      const adjustedGrow = applyFertilizerToGrowTime(crop.grow, fertilizerKey);

      if (crop.re) {
        // Regrow crop: plant once and it fills the rest of the season
        if (currentDay + adjustedGrow <= seasonEnd) {
          plantingSlots.push({ crop, plantDay: currentDay, harvestDay: currentDay + adjustedGrow, re: true });
          currentDay = seasonEnd + 1; // done — regrow fills remaining days
          slotFilled = true;
        }
      } else {
        // Single-harvest: plant, harvest, then try the next utility crop
        if (currentDay + adjustedGrow <= seasonEnd) {
          plantingSlots.push({ crop, plantDay: currentDay, harvestDay: currentDay + adjustedGrow, re: false });
          currentDay = currentDay + adjustedGrow;
          utilityIndex = (utilityIndex + attempt + 1) % availableUtilityCrops.length;
          slotFilled = true;
        }
      }

      if (slotFilled) break;
    }

    if (!slotFilled) break; // Nothing fits in the remaining days
  }

  return plantingSlots;
}


// ─── ASSIGN INCOME PLOTS ──────────────────────────────────────────────────────

/**
 * Assign crops to all income plot instances using the following rules:
 *
 *  1. FLOWER SLOT  — the smallest single instance gets a flower crop.
 *                    The specific flower cycles via STATE.flowerAltIdx toggle.
 *  2. UTILITY SLOT — the second-smallest instance gets the utility rotation
 *                    (cycles through variety/bundle crops each harvest).
 *                    If no flowers are available, this becomes the smallest.
 *  3. PROFIT SLOTS — remaining instances are filled round-robin by effectiveGoldPerDay,
 *                    with the top crops getting slightly more plots ("bucket" spreading).
 *
 * @param {object[]} allViableCrops — from buildViableCropList()
 * @returns {{
 *   instances:   Array<{ plot, defIdx, instanceIdx, usableTiles }>,
 *   assignments: Array<object|null>,  // parallel to instances; null = unassigned
 *   flowerPool:  object[],
 *   flowerSlotIndex: number,          // instance index of the flower slot (-1 if none)
 *   utilitySlotIndex: number,         // instance index of the utility slot (-1 if none)
 * }}
 */
function assignIncomePlots(allViableCrops) {
  const instances = expandIncomePlotInstances();
  if (!instances.length) {
    return { instances: [], assignments: [], flowerPool: [], flowerSlotIndex: -1, utilitySlotIndex: -1 };
  }

  const incomeCrops = filterIncomePlotCrops(allViableCrops, STATE.equipment);
  const flowerPool = incomeCrops.filter(c => c.flower && isCropViableThisSeason(c, STATE.season, STATE.day));
  const nonFlowerCrops = incomeCrops.filter(c => !c.flower);

  if (!incomeCrops.length) {
    return { instances, assignments: instances.map(() => null), flowerPool, flowerSlotIndex: -1, utilitySlotIndex: -1 };
  }

  // Sort instance indices by tile count ascending (smallest gets special slots)
  const instancesSortedBySize = instances
    .map((inst, i) => ({ i, usableTiles: inst.usableTiles }))
    .sort((a, b) => a.usableTiles - b.usableTiles);

  let flowerSlotIndex = -1;
  let utilitySlotIndex = -1;

  if (flowerPool.length) {
    flowerSlotIndex = instancesSortedBySize[0].i;
    if (instancesSortedBySize.length > 1) {
      utilitySlotIndex = instancesSortedBySize[1].i;
    }
  } else {
    utilitySlotIndex = instancesSortedBySize[0].i;
  }

  const assignments = new Array(instances.length).fill(null);

  // ── Assign flower slot
  if (flowerSlotIndex !== -1 && flowerPool.length) {
    const selectedFlowerIdx = Math.min(STATE.flowerAltIdx || 0, flowerPool.length - 1);
    assignments[flowerSlotIndex] = flowerPool[selectedFlowerIdx];
  }

  // ── Assign first utility crop (the rotation is fully rendered by the schedule/buylist)
  if (utilitySlotIndex !== -1) {
    const fertilizerKey = instances[utilitySlotIndex].plot.boost || "none";
    const utilityRotation = getUtilityPlotRotation(nonFlowerCrops, fertilizerKey);
    assignments[utilitySlotIndex] = utilityRotation[0]?.crop ?? null;
  }

  // ── Assign profit crops round-robin to all remaining slots
  const reservedSlots = new Set([flowerSlotIndex, utilitySlotIndex].filter(i => i !== -1));
  const remainingSlotIndices = instances.map((_, i) => i).filter(i => !reservedSlots.has(i));

  const profitCrops = nonFlowerCrops
    .filter(c => !UTILITY_CROP_NAMES.includes(c.name))
    .sort((a, b) =>
      calcEffectiveGoldPerDay(b, STATE.season, STATE.day, STATE.equipment) -
      calcEffectiveGoldPerDay(a, STATE.season, STATE.day, STATE.equipment)
    );

  const slotCount = remainingSlotIndices.length;
  const cropCount = profitCrops.length;

  if (cropCount && slotCount) {
    /*
     * Bucket distribution: give the top N crops slightly more plots
     * before moving to the next tier. bucketWidth controls how many plots
     * each "tier" of crops gets before the algorithm advances.
     * This avoids just hammering the #1 crop into everything.
     */
    const BUCKET_WIDTH = 3;
    let profitPoolStart = -2; // negative start creates a brief warm-up
    let currentProfitIdx = profitPoolStart;
    let bucketEnd = profitPoolStart + BUCKET_WIDTH;
    let slotIdx = 0;

    while (true) {
      if (slotIdx >= slotCount) break;

      // If we've exhausted the profit pool, wrap round-robin
      if (currentProfitIdx === cropCount) {
        while (slotIdx < slotCount) {
          for (let i = 0; i < cropCount; i++) {
            assignments[remainingSlotIndices[slotIdx]] = profitCrops[i];
            slotIdx++;
            if (slotIdx >= slotCount) break;
          }
        }
        break;
      }

      // Advance bucket
      if (currentProfitIdx === bucketEnd) {
        profitPoolStart++;
        currentProfitIdx = profitPoolStart;
        bucketEnd = profitPoolStart + BUCKET_WIDTH;
      }

      // Skip negative warm-up phase
      if (currentProfitIdx < 0) { currentProfitIdx++; continue; }

      assignments[remainingSlotIndices[slotIdx]] = profitCrops[currentProfitIdx];
      slotIdx++;
      currentProfitIdx++;
    }
  }

  console.log("Instances:", instances);
  console.log("Plot assignments:", assignments);
  console.log("Income plot types: ", getIncomePlots())
  if (STATE.seasonChanged) {
    syncManualToAutoAssignments(instances, assignments);
    STATE.seasonChanged = false;
  }

  return { instances, assignments, flowerPool, flowerSlotIndex, utilitySlotIndex };
}

function syncManualToAutoAssignments(instances, autoAssignments) {
  const manualAssignments = {};
  const instN = instances.length;

  for (let i = 0; i < instN; i++) {
    const inst = instances[i];
    const autoCrop = autoAssignments[i];

    if (manualAssignments[autoCrop?.name]) {
      if (manualAssignments[autoCrop.name][inst.defIdx]) {
        manualAssignments[autoCrop.name][inst.defIdx]++;
      } else {
        manualAssignments[autoCrop.name][inst.defIdx] = 1;
      }
    } else {
      manualAssignments[autoCrop.name] = { [inst.defIdx]: 1 };
    }
  }

  console.log("Syncing manual assignments to auto:", manualAssignments);
  STATE.incomeAssignments = manualAssignments;
}


// ─── GIANT PLOT PLAN ──────────────────────────────────────────────────────────

/**
 * Decide what to plant in giant plots.
 * If giant crops have enough days to grow, use them.
 * Otherwise fall back to the best income crop for those tiles.
 *
 * @param {object[]} allViableCrops — from buildViableCropList()
 * @returns {{
 *   mode:          "giant" | "income",
 *   giantCrop:     object|null,   // selected giant crop (if mode === "giant")
 *   allGiantCrops: object[],      // all viable giant crops (for toggle)
 *   fillCrop:      object|null,   // best income crop for leftover tiles
 *   giantBlocks:   number,        // number of 3×3 blocks
 *   leftoverTiles: number,        // tiles not covered by full 3×3 blocks
 *   totalGiantTiles: number,
 * }}
 */
function calcGiantPlotPlan(allViableCrops) {
  const viableGiantCrops = allViableCrops.filter(c =>
    c.giant &&
    isCropViableThisSeason(c, STATE.season, STATE.day) &&
    cropEquipmentRequirementMet(c, STATE.equipment)
  );
  const incomeCrops = filterIncomePlotCrops(allViableCrops, STATE.equipment);
  const giantBlocks = getTotalGiantBlocks();
  const totalGiantTiles = getTotalGiantTiles();

  if (!giantBlocks || !viableGiantCrops.length) {
    // No giant blocks or no viable giant crops → use best income crop as fallback
    return {
      mode: "income",
      giantCrop: null, allGiantCrops: viableGiantCrops,
      fillCrop: incomeCrops[0] ?? null,
      giantBlocks: 0, leftoverTiles: totalGiantTiles, totalGiantTiles,
    };
  }

  // Clamp alt index to valid range
  const selectedIdx = Math.min(STATE.giantCropAltIdx || 0, viableGiantCrops.length - 1);
  const selectedGiantCrop = viableGiantCrops[selectedIdx];
  const leftoverTiles = totalGiantTiles - giantBlocks * 9;

  return {
    mode: "giant",
    giantCrop: selectedGiantCrop,
    allGiantCrops: viableGiantCrops,
    fillCrop: incomeCrops[0] ?? null,
    giantBlocks, leftoverTiles, totalGiantTiles,
  };
}


// ─── SUPPLY PLOT PLAN ─────────────────────────────────────────────────────────

/**
 * Decide what to plant in supply plots.
 * Two modes controlled by STATE.supplyPlotMode:
 *   "feed"    → prioritise wheat/amaranth for hay, fill remainder with other supply
 *   "variety" → spread tiles evenly across all available supply crops
 *
 * @param {object[]} allViableCrops — from buildViableCropList()
 * @returns {{
 *   feedPlan:        Array<{ crop, tiles }>,   // hay/feed crop allocations
 *   feedTilesTotal:  number,
 *   fillTiles:       number,                   // tiles after feed allocation
 *   fillCrop:        object|null,              // best non-feed supply crop
 *   winterHayNeeded: number,
 *   allSupplyCrops:  object[],                 // all viable supply crops this season
 *   hasHayCrops:     boolean,
 *   varietyCrops:    object[],                 // non-hay supply crops
 *   totalSupplyTiles: number,
 * }}
 */
function calcSupplyPlotPlan(allViableCrops) {
  const allSupplyCrops = allViableCrops.filter(c =>
    c.supply &&
    isCropViableThisSeason(c, STATE.season, STATE.day) &&
    cropEquipmentRequirementMet(c, STATE.equipment)
  );
  const hayCrops = allSupplyCrops.filter(c => c.name === "Wheat" || c.name === "Amaranth");
  const otherSupply = allSupplyCrops.filter(c => c.name !== "Wheat" && c.name !== "Amaranth");
  const winterHayNeeded = calcWinterHayNeeded(STATE.animals);
  const totalSupplyTiles = getTotalSupplyTiles();
  const firstSupplyPlot = getSupplyPlots()[0];

  let feedPlan = [];
  let feedTilesTotal = 0;

  if (hayCrops.length && winterHayNeeded > 0) {
    const fertilizerKey = firstSupplyPlot?.boost || "none";
    const viableHayCrops = hayCrops.filter(c =>
      countHarvests(c, STATE.season, STATE.day, fertilizerKey) > 0
    );

    if (viableHayCrops.length) {
      // Estimate how many tiles we need total to cover the hay requirement
      const avgHarvestsPerTile = viableHayCrops.reduce(
        (sum, c) => sum + countHarvests(c, STATE.season, STATE.day, fertilizerKey), 0
      ) / viableHayCrops.length;

      const totalFeedTilesNeeded = Math.min(
        totalSupplyTiles,
        Math.ceil(winterHayNeeded / Math.max(1, avgHarvestsPerTile))
      );
      const tilesEach = Math.floor(totalFeedTilesNeeded / viableHayCrops.length);
      const remainder = totalFeedTilesNeeded % viableHayCrops.length;

      viableHayCrops.forEach((crop, i) => {
        const tiles = Math.min(totalSupplyTiles, tilesEach + (i < remainder ? 1 : 0));
        if (tiles > 0) {
          feedPlan.push({ crop, tiles });
          feedTilesTotal += tiles;
        }
      });
    }
  }

  const fillTiles = Math.max(0, totalSupplyTiles - feedTilesTotal);
  const fillCrop = otherSupply[0] ?? null;

  return {
    feedPlan,
    feedTilesTotal,
    fillTiles,
    fillCrop,
    winterHayNeeded,
    allSupplyCrops,
    hasHayCrops: hayCrops.length > 0,
    varietyCrops: otherSupply.length ? otherSupply : [...allSupplyCrops],
    totalSupplyTiles,
  };
}


// ─── MANUAL ASSIGNMENT HELPERS ────────────────────────────────────────────────

/**
 * Calculate per-plot-definition availability for manual mode.
 * Returns how many instances are still free to assign (total minus already-assigned).
 *
 * @param {Set<number>}  reservedSlots  — instance indices reserved for flower/utility
 * @param {object[]}     incInstances   — from expandIncomePlotInstances()
 * @returns {{ total: object, available: object }}  — maps of { defIdx → count }
 */
function calcManualSlotAvailability(reservedSlots, incInstances) {
  // Total non-reserved instances per definition
  const total = {};
  incInstances.forEach((inst, idx) => {
    if (reservedSlots.has(idx)) return;
    const k = inst.defIdx;
    total[k] = (total[k] || 0) + 1;
  });

  // Already-assigned counts per definition across all manual crops
  const assigned = {};
  const manualAssignments = STATE.incomeAssignments || {};
  Object.values(manualAssignments).forEach(defMap => {
    Object.entries(defMap).forEach(([dk, cnt]) => {
      const k = Number(dk);
      assigned[k] = (assigned[k] || 0) + cnt;
    });
  });

  // Available = total - assigned (clamped ≥ 0)
  const available = {};
  Object.keys(total).forEach(k => {
    available[k] = Math.max(0, total[k] - (assigned[Number(k)] || 0));
  });

  return { total, available };
}

/**
 * Expand manual assignments into a flat list of { inst, idx, crop } objects.
 * Used by the schedule generator in manual mode.
 *
 * Instances with no manual assignment get crop: null.
 *
 * @param {Set<number>}  reservedSlots  — instance indices for flower/utility
 * @param {object[]}     incInstances   — from expandIncomePlotInstances()
 * @param {object[]}     allViableCrops — for crop lookup
 * @returns {Array<{ inst, idx, crop }>}
 */
function expandManualAssignments(reservedSlots, incInstances, allViableCrops) {
  const profitCrops = filterIncomePlotCrops(allViableCrops, STATE.equipment)
    .filter(c => !c.flower && !UTILITY_CROP_NAMES.includes(c.name));

  const manualAssignments = STATE.incomeAssignments || {};

  // Build per-definition queues of available instance slots
  const queues = {}; // defIdx → [{ inst, idx }, ...]
  incInstances.forEach((inst, idx) => {
    if (reservedSlots.has(idx)) return;
    const k = inst.defIdx;
    if (!queues[k]) queues[k] = [];
    queues[k].push({ inst, idx });
  });

  const result = []; // [{ inst, idx, crop }]
  const usedCountPerDef = {};

  // First pass: fill in manual assignments
  Object.entries(manualAssignments).forEach(([cropName, defMap]) => {
    const crop = profitCrops.find(c => c.name === cropName);
    if (!crop) return;
    Object.entries(defMap).forEach(([dk, count]) => {
      const k = Number(dk);
      const queue = queues[k] || [];
      const alreadyUsed = usedCountPerDef[k] || 0;
      for (let i = 0; i < count && alreadyUsed + i < queue.length; i++) {
        result.push({ inst: queue[alreadyUsed + i].inst, idx: queue[alreadyUsed + i].idx, crop });
      }
      usedCountPerDef[k] = (usedCountPerDef[k] || 0) + count;
    });
  });

  // Second pass: unassigned instances get null crop
  incInstances.forEach((inst, idx) => {
    if (reservedSlots.has(idx)) return;
    const alreadyAssigned = result.some(r => r.idx === idx);
    if (!alreadyAssigned) result.push({ inst, idx, crop: null });
  });

  return result;
}

/**
 * Adjust a manual income assignment count.
 * delta = +1 adds one plot of that crop to that plot definition,
 * delta = -1 removes one.
 *
 * @param {string} cropName  — crop name
 * @param {number} defIdx    — plot definition index (numeric)
 * @param {number} delta     — +1 or -1
 */
function adjustIncomeAssignment(cropName, defIdx, delta, allCrops) {
  STATE.incomeAssignments = STATE.incomeAssignments || {};
  if (!STATE.incomeAssignments[cropName]) STATE.incomeAssignments[cropName] = {};

  const key = Number(defIdx);
  const current = STATE.incomeAssignments[cropName][key] || 0;
  const next = Math.max(0, current + delta);

  if (next === 0) {
    delete STATE.incomeAssignments[cropName][key];
  } else {
    STATE.incomeAssignments[cropName][key] = next;
  }

  if (!Object.keys(STATE.incomeAssignments[cropName]).length) {
    delete STATE.incomeAssignments[cropName];
  }

  console.log(STATE.incomeAssignments);

  saveState();
  renderBuyList(allCrops);
  renderSchedule(allCrops);
}


// ─── TOGGLE HANDLERS ──────────────────────────────────────────────────────────
// These are called by inline onclick handlers in the rendered HTML
// (toggle buttons can't use closures, so they reference window.__lastCrops)

/** Cycle to the next available giant crop and re-render. */
function toggleGiantCrop(allCrops) {
  const viableGiantCrops = allCrops.filter(c =>
    c.giant && isCropViableThisSeason(c, STATE.season, STATE.day)
  );
  STATE.giantCropAltIdx = ((STATE.giantCropAltIdx || 0) + 1) % Math.max(1, viableGiantCrops.length);
  saveState();
  renderBuyList(allCrops);
  renderSchedule(allCrops);
}

/** Toggle supply plots between feed mode and variety mode and re-render. */
function toggleSupplyMode(allCrops) {
  STATE.supplyPlotMode = STATE.supplyPlotMode === "feed" ? "variety" : "feed";
  saveState();
  renderBuyList(allCrops);
  renderSchedule(allCrops);
}

/** Cycle to the next available flower crop for the flower slot and re-render. */
function toggleFlowerCrop(allCrops) {
  const incomeCrops = filterIncomePlotCrops(allCrops, STATE.equipment);
  const flowerPool = incomeCrops.filter(c =>
    c.flower && isCropViableThisSeason(c, STATE.season, STATE.day)
  );
  STATE.flowerAltIdx = ((STATE.flowerAltIdx || 0) + 1) % Math.max(1, flowerPool.length);
  saveState();
  renderBuyList(allCrops);
  renderSchedule(allCrops);
}

/** Toggle manual vs. auto income plot assignment mode and re-render. */
function toggleIncomeManualMode(allCrops) {
  STATE.incomeManual = !STATE.incomeManual;
  saveState();
  renderBuyList(allCrops);
  renderSchedule(allCrops);
}
