/**
 * gameCalc.js — Pure calculation helpers
 * ────────────────────────────────────────
 * All functions here are stateless: they take explicit arguments and return
 * values with no side effects. They read from data.js constants but never
 * from the app state (state.js).
 *
 * Sections:
 *   Growth & yield math
 *   Plot tile counts
 *   Hay / winter feed estimation
 *   Artisan value boosting
 *   Crop viability checks
 *   Viable crop list builder
 */


// ─── GROWTH & YIELD MATH ─────────────────────────────────────────────────────

/**
 * Apply a fertilizer growth-speed multiplier to a base grow time.
 * The result is always at least 1 day.
 *
 * @param {number} baseGrowDays  — crop's unmodified grow time in days
 * @param {string} fertilizerKey — key into FERTILIZER_CONFIGS (default "none")
 * @returns {number} adjusted grow time in days
 */
function applyFertilizerToGrowTime(baseGrowDays, fertilizerKey = "none") {
  const mult = FERTILIZER_CONFIGS[fertilizerKey]?.mult ?? 1;
  return mult === 1 ? baseGrowDays : Math.max(1, Math.ceil(baseGrowDays * mult));
}

/**
 * Calculate the total available days for a crop, accounting for
 * multi-season crops that span the season boundary.
 *
 * For single-season crops this is simply the days left in the current season.
 * For multi-season crops we add 28 days for each subsequent season in which
 * the crop also grows (e.g. Wheat in Summer+Fall adds 28 fall days).
 *
 * @param {object} crop      — crop data object from CROPS
 * @param {string} season    — current season name
 * @param {number} currentDay — current game day (1–28)
 * @returns {number} total days available for this crop
 */
function getDaysAvailableForCrop(crop, season = STATE.season, currentDay = STATE.day) {
  const daysLeftThisSeason = 28 - currentDay + 1;
  if (crop.seasons.length === 1) return daysLeftThisSeason;

  const currentSeasonIndex = SEASONS.indexOf(season);
  let totalDays = daysLeftThisSeason;
  for (let offset = 1; offset < crop.seasons.length; offset++) {
    const nextIndex = currentSeasonIndex + offset;
    if (nextIndex < 4 && crop.seasons.includes(SEASONS[nextIndex])) {
      totalDays += 28;
    } else {
      break;
    }
  }
  return totalDays;
}

/**
 * Count the number of harvests a crop achieves given available days.
 * Accounts for both single-harvest and regrow crops.
 *
 * @param {object} crop          — crop data object
 * @param {string} season        — current season name
 * @param {number} currentDay    — current game day (1–28)
 * @param {string} fertilizerKey — fertilizer tier key
 * @returns {number} number of harvests (0 if the crop can't complete even one cycle)
 */
function countHarvests(crop, fertilizerKey = "none", season = STATE.season, currentDay = STATE.day) {
  const totalDays = getDaysAvailableForCrop(crop, season, currentDay);
  const adjustedGrow = applyFertilizerToGrowTime(crop.grow, fertilizerKey);

  if (!crop.re) {
    // Single-harvest crop: how many full grow cycles fit?
    return totalDays >= adjustedGrow ? Math.floor(totalDays / adjustedGrow) : 0;
  }

  // Regrow crop: 1 initial grow + N regrow cycles
  if (totalDays < adjustedGrow) return 0;
  const daysAfterFirstHarvest = totalDays - adjustedGrow;
  return Math.max(0, Math.floor(daysAfterFirstHarvest / (crop.regrow || 1)) + 1);
}

/**
 * Calculate raw gold earned per day for a crop (before artisan processing).
 * Accounts for seed costs, harvest count, items per harvest, and grow time.
 *
 * @param {object} crop          — crop data object
 * @param {string} fertilizerKey — fertilizer tier key
 * @param {string} season        — current season name
 * @param {number} currentDay    — current game day (1–28)
 * @returns {number} gold per day (0 if no harvests possible)
 */
function calcRawGoldPerDay(crop, fertilizerKey = "none", season = STATE.season, currentDay = STATE.day) {
  console.log("Calculating raw gold/day for crop:", crop.name, "with fertilizer:", fertilizerKey);
  console.log("Season:", season, "Current day:", currentDay);
  const totalDays = getDaysAvailableForCrop(crop, season, currentDay);
  const harvests = countHarvests(crop, fertilizerKey, season, currentDay);
  if (!harvests || !totalDays) return 0;

  const itemsPerHarvest = crop.perH || 1;
  // Regrow crops: only one seed purchase. Single-harvest: buy seeds each cycle.
  const totalSeedCost = crop.re ? crop.cost : harvests * crop.cost;
  const totalRevenue = harvests * itemsPerHarvest * crop.sell;

  return (totalRevenue - totalSeedCost) / totalDays;
}

/**
 * Calculate gold per day boosted by artisan processing (Keg or Preserves Jar).
 * Fruits use Keg → Wine (sell × 3). Vegetables use Preserves Jar (sell × 2 + 50).
 * Falls back to raw gold/day if the relevant equipment isn't active.
 *
 * @param {object}   crop          — crop data object
 * @param {string}   season        — current season name
 * @param {number}   currentDay    — current game day (1–28)
 * @param {string[]} ownedEquipment — list of owned equipment names
 * @returns {number} effective (artisan-boosted if applicable) gold per day
 */
function calcEffectiveGoldPerDay(crop, fertilizerKey = "none", season = STATE.season, currentDay = STATE.day, ownedEquipment = STATE.equipment || []) {
  const isFruit = FRUIT_CROP_NAMES.has(crop.name);

  if (ownedEquipment.includes("Keg") && isFruit) {
    const wineValue = crop.sell * 3;
    const harvests = Math.max(1, countHarvests(crop, fertilizerKey, season, currentDay));
    const totalDays = Math.max(1, getDaysAvailableForCrop(crop, season, currentDay));
    const seedCost = crop.re ? crop.cost : harvests * crop.cost;
    return ((harvests * (crop.perH || 1) * wineValue) - seedCost) / totalDays;
  }

  if (ownedEquipment.includes("Preserves Jar") && !isFruit) {
    const pickledValue = crop.sell * 2 + 50;
    const harvests = Math.max(1, countHarvests(crop, fertilizerKey, season, currentDay));
    const totalDays = Math.max(1, getDaysAvailableForCrop(crop, season, currentDay));
    const seedCost = crop.re ? crop.cost : harvests * crop.cost;
    return ((harvests * (crop.perH || 1) * pickledValue) - seedCost) / totalDays;
  }

  return calcRawGoldPerDay(crop, fertilizerKey, season, currentDay);
}

/**
 * Calculate the latest day a crop can be planted and still yield at least
 * one harvest before the season ends. Used for the "Plant by" column.
 *
 * @param {object} crop       — crop data object
 * @param {number} currentDay — current game day (1–28)
 * @returns {number} latest safe planting day
 */
function calcLastPlantableDay(crop, currentDay) {
  const isMultiSeason = crop.seasons.length > 1;
  // Regrow crops can be planted up to their final harvest window
  if (crop.re) {
    return Math.min(currentDay, isMultiSeason ? 28 : Math.max(1, 28 - crop.grow));
  }
  return Math.min(currentDay, isMultiSeason ? 28 : Math.max(1, 28 - crop.grow + 1));
}

/**
 * Calculate how many seeds to purchase for a given number of tiles.
 * Regrow crops only need seeds once per tile (one purchase covers all regrow harvests).
 * Single-harvest crops need seeds × harvest count.
 *
 * @param {object} crop          — crop data object
 * @param {number} tiles         — number of tiles to plant
 * @param {string} fertilizerKey — fertilizer tier key
 * @param {string} season        — current season name
 * @param {number} currentDay    — current game day (1–28)
 * @returns {number} total seeds to buy
 */
function calcSeedsNeeded(crop, tiles, fertilizerKey, season = STATE.season, currentDay = STATE.day) {
  if (crop.re) return tiles; // One purchase covers all regrow harvests
  return tiles * Math.max(1, countHarvests(crop, fertilizerKey, season, currentDay));
}


// ─── PLOT TILE COUNTS ─────────────────────────────────────────────────────────

/**
 * Calculate the number of usable (plantable) tiles in a single plot definition,
 * after subtracting tiles consumed by sprinklers.
 *
 * @param {object} plot — plot definition { w, h, count, sprinkler }
 * @returns {number} total usable tiles across all instances of this plot
 */
function calcUsableTiles(plot) {
  const sprinklerConfig = SPRINKLER_CONFIGS[plot.sprinkler || "inner"];
  const grossTiles = plot.w * plot.h * plot.count;
  return Math.max(0, grossTiles - sprinklerConfig.lost(plot.w, plot.h, plot.count));
}

/**
 * Calculate the number of 3×3 giant-crop blocks that fit in a plot definition.
 * One block requires 9 contiguous tiles (a 3×3 square).
 *
 * @param {object} plot — plot definition { w, h, count }
 * @returns {number} number of 3×3 blocks across all instances
 */
function calcGiantCropBlocks(plot) {
  console.log("calcGiantCropBlocks called with plot:", plot);
  const sprinkler = plot.sprinkler || undefined;
  console.log("sprinkler:", sprinkler);
  if (!sprinkler || sprinkler === "none") {
    const result = Math.floor(plot.w / 3) * Math.floor(plot.h / 3) * plot.count;
    console.log("No sprinkler case, returning:", result);
    return result;
  }

  const sprklRootCov = Math.floor(Math.sqrt(SPRINKLER_CONFIGS[sprinkler].tileCoverage));
  const tilesBtwnSprkl = sprklRootCov - 1;
  console.log("sprklRootCov:", sprklRootCov, "tilesBtwnSprkl:", tilesBtwnSprkl);

  if (tilesBtwnSprkl < 3) {
    console.log("tilesBtwnSprkl < 3, returning 0");
    return 0; // Sprinkler coverage overlaps too much, no 3×3 blocks fit
  }

  const availableBlockSpaceAlongWidth = Math.floor(plot.w / sprklRootCov) - 1;
  const availableBlockSpaceAlongHeight = Math.floor(plot.h / sprklRootCov) - 1;
  console.log("availableBlockSpaceAlongWidth:", availableBlockSpaceAlongWidth, "availableBlockSpaceAlongHeight:", availableBlockSpaceAlongHeight);

  if (availableBlockSpaceAlongWidth <= 0 || availableBlockSpaceAlongHeight <= 0) {
    console.log("Not enough block space, returning 0");
    return 0; // Not enough space for even one block after accounting for sprinkler coverage
  }

  const crossSectionBlocks = availableBlockSpaceAlongWidth * availableBlockSpaceAlongHeight;
  const blocksAlongHeight = availableBlockSpaceAlongWidth * Math.floor(plot.h / 3);
  const blocksAlongWidth = availableBlockSpaceAlongHeight * Math.floor(plot.w / 3);
  console.log("crossSectionBlocks:", crossSectionBlocks, "blocksAlongHeight:", blocksAlongHeight, "blocksAlongWidth:", blocksAlongWidth);

  const result = blocksAlongHeight + blocksAlongWidth - crossSectionBlocks * plot.count;
  console.log("Final result:", result);
  return result;
}


// ─── HAY / WINTER FEED ESTIMATION ────────────────────────────────────────────

/**
 * Estimate the total hay needed to feed all animals through a 28-day winter.
 * Different animal types consume different amounts per day.
 *
 * Consumption rates (hay per day):
 *   Chicken, Duck, Rabbit, Pig, Ostrich, Dino → 1.0
 *   Cow, Goat, Sheep → 1.5
 *
 * @param {object} animals — map of { animalType: count }
 * @returns {number} total hay bales needed for winter (ceil)
 */
function calcWinterHayNeeded(animals) {
  const dailyConsumptionRates = {
    chicken: 1, duck: 1, rabbit: 1,
    cow: 1.5, goat: 1.5, sheep: 1.5,
    pig: 1, ostrich: 1, dino: 1,
  };
  const totalDailyConsumption = Object.entries(dailyConsumptionRates)
    .reduce((sum, [type, rate]) => sum + (animals[type] || 0) * rate, 0);

  return Math.ceil(totalDailyConsumption * 28);
}


// ─── CROP VIABILITY CHECKS ────────────────────────────────────────────────────

/**
 * Check whether a crop is viable this season: must grow in the current season
 * AND have enough days remaining for at least one full harvest.
 *
 * @param {object} crop       — crop data object
 * @param {string} season     — current season name
 * @param {number} currentDay — current game day (1–28)
 * @returns {boolean}
 */
function isCropViableThisSeason(crop, season = STATE.season, currentDay = STATE.day) {
  return crop.seasons.includes(season) &&
    getDaysAvailableForCrop(crop) >= crop.grow;
}

/**
 * Check whether a crop's required equipment is owned.
 * Crops with no equipment requirement always return true.
 *
 * @param {object}   crop          — crop data object
 * @param {string[]} ownedEquipment — list of owned equipment names
 * @returns {boolean}
 */
function cropEquipmentRequirementMet(crop, ownedEquipment = STATE.equipment || []) {
  if (!crop.reqE) return true;
  return ownedEquipment.includes(crop.reqE);
}


// ─── VIABLE CROP LIST BUILDER ─────────────────────────────────────────────────

/**
 * Build the list of viable crops for the current season, deduplicated,
 * and sorted by raw gold/day descending.
 * Attaches computed fields prefixed with _ for use in rendering.
 *
 * @param {string}   season        — current season name
 * @param {number}   currentDay    — current game day (1–28)
 * @param {string[]} ownedEquipment — owned equipment for equipment-check dimming
 * @returns {object[]} sorted array of crop objects with _harvests, _goldPerDay, _lastPlantDay
 */
function buildViableCropList(season = STATE.season, currentDay = STATE.day, ownedEquipment = STATE.equipment || []) {
  const seen = new Set();
  return CROPS
    .filter(crop => isCropViableThisSeason(crop, season, currentDay))
    .map(crop => ({
      ...crop,
      _harvests: countHarvests(crop, "none"),
      _goldPerDay: calcRawGoldPerDay(crop, season, currentDay, "none"),
      _lastPlantDay: calcLastPlantableDay(crop, currentDay),
    }))
    .sort((a, b) => b._goldPerDay - a._goldPerDay)
    .filter(crop => {
      if (seen.has(crop.name)) return false;
      seen.add(crop.name);
      return true;
    });
}

/**
 * Filter a crop list down to crops eligible for income plots:
 * excludes supply crops, giant-only crops, and special/rare-source crops.
 * Festival crops (like Strawberry) ARE included since they are purchasable.
 *
 * @param {object[]} allViableCrops — output of buildViableCropList()
 * @param {string[]} ownedEquipment  — for equipment requirement check
 * @returns {object[]}
 */
function filterIncomePlotCrops(allViableCrops, ownedEquipment = STATE.equipment || []) {
  return allViableCrops.filter(crop =>
    !crop.supply &&
    !crop.giant &&
    cropEquipmentRequirementMet(crop, ownedEquipment) &&
    !crop.special
  );
}
