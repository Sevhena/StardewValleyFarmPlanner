/**
 * data.js — Stardew Valley game data constants
 * ─────────────────────────────────────────────
 * All raw game data lives here. No logic, no state — pure reference tables.
 *
 * Sections:
 *   SEASONS           — ordered list of season names
 *   SPRINKLER_CONFIGS — tile-loss calculations per sprinkler type
 *   FERTILIZER_CONFIGS — growth speed multipliers per fertilizer tier
 *   FESTIVALS         — in-season event data (day, name, shopping tips)
 *   CROPS             — all plantable crops with growth/sell/re-grow data
 *   FORAGE            — season-specific wild items to collect
 *   GREENHOUSE_CROPS  — ranked permanent greenhouse crops
 *   FRUIT_TREES       — greenhouse border tree options
 *   ARTISAN_CHAINS    — processing machine → output chains, ranked by profit
 */


// ─── SEASONS ──────────────────────────────────────────────────────────────────

/** Ordered list of the four in-game seasons. Index used for season arithmetic. */
const SEASONS = ["Spring", "Summer", "Fall", "Winter"];


// ─── SPRINKLER CONFIGS ────────────────────────────────────────────────────────

/**
 * Sprinkler configurations.
 * Each entry describes how many tiles are consumed by the sprinkler itself
 * (not available for planting) across N plots of W×H each.
 *
 * lost(w, h, count) → number of tiles unavailable for crops
 *
 * "inner"   — one sprinkler sits in the center of each plot (e.g. 3×3 = 1 lost)
 * "basic"   — covers 4 adjacent tiles; roughly 1 sprinkler per 5 crop tiles
 * "quality" — covers 8 surrounding tiles; roughly 1 sprinkler per 9 crop tiles
 * "iridium" — covers 24 surrounding tiles; roughly 1 sprinkler per 25 crop tiles
 * "ir-pn"   — iridium + pressure nozzle; covers 48 tiles (7×7 minus corners)
 */
const SPRINKLER_CONFIGS = {
  none: { label: "No sprinkler", lost: (w, h, n) => 0 },
  basic: { label: "Basic sprinkler", lost: (w, h, n) => Math.ceil(w * h * n / 5) },
  quality: { label: "Quality sprinkler", tileCoverage: 9, lost: (w, h, n) => Math.ceil(w * h * n / 9) },
  iridium: { label: "Iridium sprinkler", tileCoverage: 25, lost: (w, h, n) => Math.ceil(w * h * n / 25) },
  "ir-pn": { label: "Iridium + Nozzle", tileCoverage: 49, lost: (w, h, n) => Math.ceil(w * h * n / 49) },
};


// ─── FERTILIZER CONFIGS ───────────────────────────────────────────────────────

/**
 * Growth speed fertilizer tiers.
 * mult — multiply base grow time by this value, then ceil.
 * E.g. a 12-day crop with Deluxe Speed-Gro → ceil(12 × 0.75) = 9 days.
 */
const FERTILIZER_CONFIGS = {
  none: { label: "No fertilizer", mult: 1 },
  speed: { label: "Speed-Gro (10% faster)", mult: 0.9 },
  deluxe: { label: "Deluxe Speed-Gro (25%)", mult: 0.75 },
  hyper: { label: "Hyper Speed-Gro (33%)", mult: 0.67 },
};


// ─── FESTIVALS ────────────────────────────────────────────────────────────────

/**
 * In-season festivals indexed by season name.
 * Properties:
 *   day    — which game day the festival falls on (shops close this day)
 *   name   — festival name
 *   note   — planning tip shown in the shopping list and schedule
 *   icon   — emoji for the schedule event row
 */
const FESTIVALS = {
  Spring: [
    {
      day: 13, name: "Egg Festival", icon: "🥚",
      note: "Pierre sells Strawberry Seeds (100g each) — buy as many as you can afford. Best spring regrow crop.",
    },
    {
      day: 24, name: "Flower Dance", icon: "🌸",
      note: "Social event. No shopping. Focus on gifting to raise friendship before this.",
    },
  ],
  Summer: [
    {
      day: 11, name: "Luau", icon: "🌺",
      note: "Bring a high-quality item for the potluck — gold/iridium produce or artisan goods.",
    },
    {
      day: 28, name: "Dance of the Moonlight Jellies", icon: "🪼",
      note: "Evening event — no farm action. Plan harvest/processing the day before.",
    },
  ],
  Fall: [
    {
      day: 16, name: "Spirit's Eve", icon: "🎃",
      note: "Maze event at night. Stock up on energy food beforehand.",
    },
    {
      day: 27, name: "Festival of Ice (Winter Star prep)", icon: "❄️",
      note: "Buy supplies before Winter — shops close on festival days.",
    },
  ],
  Winter: [
    {
      day: 8, name: "Festival of Ice", icon: "🧊",
      note: "Ice fishing contest. No farming possible. Pre-process artisan goods.",
    },
    {
      day: 25, name: "Feast of the Winter Star", icon: "🎁",
      note: "Gift exchange — check your secret gifting target's preferences early.",
    },
  ],
};


// ─── CROPS ────────────────────────────────────────────────────────────────────

/**
 * All plantable crops.
 *
 * Field reference:
 *   name     — display name
 *   seasons  — array of seasons the crop grows in
 *   cost     — seed price in gold (0 = not purchasable from shop)
 *   sell     — base sell price of one crop in gold
 *   grow     — days until first harvest
 *   re       — true if crop regrows after initial harvest
 *   regrow   — days between regrow harvests (only when re: true)
 *   perH     — items produced per harvest (default 1)
 *   src      — where to obtain seeds if not from Pierre (e.g. "Oasis", "Egg Festival")
 *   reqE     — required equipment to reach best value (e.g. "Keg" for Hops)
 *   altNote  — short note for raw value without the required equipment
 *   giant    — true if this crop can form a 3×3 giant crop
 *   supply   — true if primarily grown for animal feed / mill processing
 *   flower   — true if this is a flower crop (Bee House boost, gifting)
 *   special  — true if obtained from special/rare sources (Travelling Cart, etc.)
 *   festival — true if seeds are sold at a festival stall
 *   smP      — Seed Maker priority override: "urgent" | "high" | "medium"
 *   note     — general planning note shown in the crop table
 */
const CROPS = [
  // ── SPRING CROPS ──────────────────────────────────────────────────────────
  {
    name: "Parsnip", seasons: ["Spring"], cost: 20, sell: 35, grow: 4, re: false,
    note: "Fast 4-day filler. Great day-1 crop.",
  },
  {
    name: "Carrot", seasons: ["Spring"], cost: 0, sell: 35, grow: 3, re: false,
    smP: "urgent",
    note: "Cannot be bought, only found. Feed to horse for a speed boost. Used in remixed Spring Crops Bundle.",
  },
  {
    name: "Garlic", seasons: ["Spring"], cost: 40, sell: 60, grow: 4, re: false,
    note: "4-day cycle — multiple rounds possible.",
  },
  {
    name: "Potato", seasons: ["Spring"], cost: 50, sell: 80, grow: 6, re: false,
    note: "~25% double yield chance.",
  },
  {
    name: "Kale", seasons: ["Spring"], cost: 70, sell: 110, grow: 6, re: false,
    note: "Solid early gold, no equipment needed.",
  },
  {
    name: "Cauliflower", seasons: ["Spring"], cost: 80, sell: 175, grow: 12, re: false,
    giant: true,
    note: "Giant crop — plant in 3×3 blocks.",
  },
  {
    name: "Green Bean", seasons: ["Spring"], cost: 60, sell: 40, grow: 10, regrow: 3, re: true,
    note: "One purchase, regrows all season. Bundle item.",
  },
  {
    name: "Tulip", seasons: ["Spring"], cost: 20, sell: 30, grow: 6, re: false,
    flower: true,
    note: "Low value — Bee House boost or gifting.",
  },
  {
    name: "Strawberry", seasons: ["Spring"], cost: 100, sell: 120, grow: 8, regrow: 4, re: true,
    src: "Egg Festival day 13", festival: true, smP: "high",
    note: "Best spring regrow. Seed Maker priority.",
  },
  {
    name: "Blue Jazz", seasons: ["Spring"], cost: 50, sell: 50, grow: 7, re: false,
    flower: true,
    note: "Bundle item. Low sell value — best used for Bee House boost or gifting.",
  },
  {
    name: "Rhubarb", seasons: ["Spring"], cost: 100, sell: 220, grow: 13, re: false,
    src: "Oasis",
    note: "High single-harvest. Keg → Juice 330g.",
  },
  {
    name: "Coffee Bean", seasons: ["Spring", "Summer"], cost: 0, sell: 15, grow: 10, regrow: 2, re: true,
    special: true, perH: 4, src: "Travelling Cart", smP: "high",
    note: "4 beans/harvest, multi-season. Coffee = +1 speed.",
  },
  {
    name: "Rice", seasons: ["Spring"], cost: 40, sell: 100, grow: 6, re: false,
    supply: true, reqE: "Mill",
    note: "Mill → rice flour. Faster near water.",
  },

  // ── SUMMER CROPS ──────────────────────────────────────────────────────────
  {
    name: "Summer Spangle", seasons: ["Summer"], cost: 50, sell: 90, grow: 8, re: false,
    flower: true,
    note: "Bee House boost crop. Decent raw sell. Good gifting item.",
  },
  {
    name: "Poppy", seasons: ["Summer"], cost: 100, sell: 140, grow: 7, re: false,
    flower: true,
    note: "High raw value for a flower. Bee House boost. Cooking ingredient — Oil of Garlic.",
  },
  {
    name: "Hops", seasons: ["Summer"], cost: 60, sell: 25, grow: 11, regrow: 1, re: true,
    reqE: "Keg", altNote: "Only 25g raw — not worth it without a Keg",
    note: "Daily regrow. Keg → Pale Ale 300g.",
  },
  {
    name: "Blueberry", seasons: ["Summer"], cost: 80, sell: 50, grow: 13, regrow: 4, re: true,
    perH: 3, smP: "medium",
    note: "3 berries/harvest. Jar → Jam 160g each.",
  },
  {
    name: "Tomato", seasons: ["Summer"], cost: 50, sell: 60, grow: 11, regrow: 4, re: true,
    note: "Steady regrow. Jar → Jam 170g.",
  },
  {
    name: "Hot Pepper", seasons: ["Summer"], cost: 40, sell: 40, grow: 5, regrow: 3, re: true,
    note: "Fast start then every 3 days. Good pickled. Cooking ingredient.",
  },
  {
    name: "Summer Squash", seasons: ["Summer"], cost: 0, sell: 20, grow: 6, regrow: 3, re: true,
    smP: "urgent",
    note: "Cannot be bought, only found.",
  },
  {
    name: "Radish", seasons: ["Summer"], cost: 40, sell: 90, grow: 6, re: false,
    note: "Used for dyes and cooking.",
  },
  {
    name: "Melon", seasons: ["Summer"], cost: 80, sell: 250, grow: 12, re: false,
    giant: true,
    note: "Giant crop — 3×3. Keg → Juice 500g.",
  },
  {
    name: "Red Cabbage", seasons: ["Summer"], cost: 100, sell: 260, grow: 9, re: false,
    src: "Pierre yr2+",
    note: "High value. Keg → Juice 396g.",
  },
  {
    name: "Starfruit", seasons: ["Summer"], cost: 400, sell: 750, grow: 13, re: false,
    src: "Oasis", special: true, reqE: "Keg", smP: "urgent",
    altNote: "Sells 750g raw — but Keg wine (2250g) is the whole point",
    note: "Best Keg crop: Wine 2250g. Seed Maker top priority.",
  },

  // ── MULTI-SEASON CROPS ────────────────────────────────────────────────────
  {
    name: "Wheat", seasons: ["Summer", "Fall"], cost: 10, sell: 25, grow: 4, re: false,
    supply: true, reqE: "Mill",
    note: "Mill → flour + animal feed. Bridges Summer→Fall.",
  },
  {
    name: "Sunflower", seasons: ["Summer", "Fall"], cost: 200, sell: 80, grow: 8, re: false,
    supply: true, reqE: "Oil Maker", altNote: "Sells raw 80g without Oil Maker",
    note: "Oil seeds → Oil Maker. Self-seeding yr2+.",
  },
  {
    name: "Corn", seasons: ["Summer", "Fall"], cost: 150, sell: 50, grow: 14, regrow: 4, re: true,
    supply: true, reqE: "Oil Maker",
    note: "Multi-season regrow. Plant summer, keep into fall.",
  },

  // ── FALL CROPS ────────────────────────────────────────────────────────────
  {
    name: "Bok Choy", seasons: ["Fall"], cost: 50, sell: 80, grow: 4, re: false,
    note: "Very fast 4-day cycle — multiple harvests.",
  },
  {
    name: "Broccoli", seasons: ["Fall"], cost: 0, sell: 40, grow: 8, regrow: 4, re: true,
    smP: "urgent",
    note: "Cannot be bought, only found.",
  },
  {
    name: "Beet", seasons: ["Fall"], cost: 20, sell: 100, grow: 6, re: false,
    src: "Oasis", reqE: "Mill",
    note: "Mill → sugar. Fast and cheap. Jar → Pickled Beet.",
  },
  {
    name: "Amaranth", seasons: ["Fall"], cost: 70, sell: 150, grow: 7, re: false,
    supply: true,
    note: "Mill → animal feed AND 150g raw. Best dual-purpose supply.",
  },
  {
    name: "Eggplant", seasons: ["Fall"], cost: 20, sell: 60, grow: 5, regrow: 5, re: true,
    note: "Cheap regrow — one purchase lasts all fall. Bundle item.",
  },
  {
    name: "Yam", seasons: ["Fall"], cost: 60, sell: 160, grow: 10, re: false,
    note: "Bundle crop. Keg → Juice 300g.",
  },
  {
    name: "Grape", seasons: ["Fall"], cost: 60, sell: 80, grow: 10, regrow: 3, re: true,
    note: "Regrows every 3 days. Keg → Wine 240g.",
  },
  {
    name: "Pumpkin", seasons: ["Fall"], cost: 100, sell: 320, grow: 13, re: false,
    giant: true,
    note: "Giant crop — 3×3. Keg → Juice 360g.",
  },
  {
    name: "Cranberry", seasons: ["Fall"], cost: 240, sell: 75, grow: 7, regrow: 5, re: true,
    perH: 2, smP: "medium",
    note: "2 berries/harvest. Jar → Jelly 225g.",
  },
  {
    name: "Artichoke", seasons: ["Fall"], cost: 30, sell: 160, grow: 8, regrow: 7, re: true,
    src: "Pierre yr2+",
    note: "Regrows every 7 days. Keg → Juice 285g.",
  },
  {
    name: "Sweet Gem Berry", seasons: ["Fall"], cost: 1000, sell: 3000, grow: 24, re: false,
    src: "Rare Seed / Travelling Cart", special: true, smP: "high",
    note: "Day 1 only (24d grow). 3000g — or give to Old Master Cannoli.",
  },
];


// ─── FORAGE ───────────────────────────────────────────────────────────────────

/**
 * Season-specific wild items to collect.
 *
 * Field reference:
 *   name    — item name
 *   sell    — base sell price in gold
 *   note    — where to find it and best processing route
 *   artisan — equipment key if an artisan machine significantly boosts value
 *   special — time-limited availability note (e.g. "Days 8–11 bushes only")
 */
const FORAGE = {
  Spring: [
    { name: "Wild Horseradish", sell: 50, note: "Common in fields and paths." },
    { name: "Daffodil", sell: 30, note: "Everywhere — good for gifting." },
    { name: "Leek", sell: 60, note: "Forested areas. Gather with Gatherer perk." },
    { name: "Dandelion", sell: 40, note: "Very common. Gifting item." },
    {
      name: "Spring Onion", sell: 8,
      note: "Cindersap Forest south. Up to 400g with Botanist+Gatherer.",
    },
    {
      name: "Salmonberry", sell: 5,
      note: "Bushes days 15–18 ONLY. Good for energy food.",
      special: "Days 15–18 bushes only",
    },
  ],
  Summer: [
    {
      name: "Fiddlehead Fern", sell: 90,
      note: "Secret Woods only — rare. Keg → Juice 270g.", artisan: "Keg",
    },
    {
      name: "Red Mushroom", sell: 75,
      note: "Forest and mines. Keg → Juice 225g.", artisan: "Keg",
    },
    {
      name: "Spice Berry", sell: 80,
      note: "Common in summer. Jar → Jelly 210g.", artisan: "Preserves Jar",
    },
    {
      name: "Grape", sell: 80,
      note: "Found wild in summer — also fall crop. Keg → Wine 240g.", artisan: "Keg",
    },
    { name: "Sweet Pea", sell: 50, note: "Common in summer fields. Good gifting item." },
  ],
  Fall: [
    {
      name: "Blackberry", sell: 20,
      note: "Bushes days 8–11 ONLY — harvest all you can.", special: "Days 8–11 bushes only",
    },
    {
      name: "Chanterelle", sell: 160,
      note: "Secret Woods — high value. Jar → Pickled 370g.", artisan: "Preserves Jar",
    },
    {
      name: "Common Mushroom", sell: 90,
      note: "Forest floor. Keg → Juice 270g.", artisan: "Keg",
    },
    {
      name: "Wild Plum", sell: 80,
      note: "Common in fall. Jar → Jelly 210g.", artisan: "Preserves Jar",
    },
    { name: "Hazelnut", sell: 90, note: "Trees and stumps — common." },
    { name: "Holly", sell: 80, note: "Bundle item. Sell raw." },
  ],
  Winter: [
    {
      name: "Crystal Fruit", sell: 150,
      note: "Rare — very valuable. Keg → Juice 450g.", artisan: "Keg",
    },
    { name: "Holly", sell: 80, note: "Found in winter as well." },
    {
      name: "Snow Yam", sell: 100,
      note: "Dig with hoe. Bundle item. Jar → Pickled 250g.", artisan: "Preserves Jar",
    },
    {
      name: "Winter Root", sell: 70,
      note: "Dig with hoe. Jar → Pickled 190g.", artisan: "Preserves Jar",
    },
    { name: "Crocus", sell: 60, note: "Common winter forage. Good gifting item." },
    { name: "Nautilus Shell", sell: 120, note: "Beach in winter. Donate to museum too." },
    { name: "Nautilus Fossil", sell: 80, note: "Dig with hoe. Donate to museum first." },
  ],
};


// ─── GREENHOUSE CROPS ─────────────────────────────────────────────────────────

/**
 * Recommended permanent greenhouse crops, ranked by value per tile.
 *
 * Field reference:
 *   name  — crop name
 *   grow  — growth / regrow description (display string)
 *   val   — value metric (display string, e.g. "576g/tile/wk")
 *   badge — CSS badge class for the rank chip
 *   p     — priority rank (1 = best)
 *   note  — strategy note
 */
const GREENHOUSE_CROPS = [
  {
    name: "Ancient Fruit", grow: "28d (regrows 7d)", val: "576g/tile/wk",
    badge: "bg-green", p: 1,
    note: "Greenhouse king. Regrows forever, zero replanting. Wine = 2310g. Cask → Iridium = 4950g.",
  },
  {
    name: "Starfruit", grow: "13d (replant)", val: "~461g/tile/wk",
    badge: "bg-amber", p: 2,
    note: "Higher per-harvest but needs replanting. Fill tiles after Ancient Fruit. Keg → 2250g.",
  },
  {
    name: "Tea Bush", grow: "20d (perennial)", val: "~100g/tile/season",
    badge: "bg-teal", p: 3,
    note: "Perennial — plant once forever. Good along edges. Brew into Green Tea (100g).",
  },
  {
    name: "Coffee Bean", grow: "10d (regrows 2d)", val: "Daily",
    badge: "bg-purple", p: 4,
    note: "4 beans per harvest. Coffee = +1 speed buff. Duplicate with Seed Maker.",
  },
];


// ─── FRUIT TREES ──────────────────────────────────────────────────────────────

/**
 * Greenhouse border fruit trees, ranked by daily sell value.
 *
 * Field reference:
 *   name  — tree name
 *   sell  — daily sell value (display string)
 *   badge — CSS badge class
 *   note  — strategy note
 */
const FRUIT_TREES = [
  { name: "Banana", sell: "150g/day", badge: "bg-amber", note: "Highest value. Island cooking ingredient." },
  { name: "Pomegranate", sell: "140g/day", badge: "bg-pink", note: "Year-round greenhouse producer." },
  { name: "Peach", sell: "140g/day", badge: "bg-coral", note: "Highest vanilla fruit tree value." },
  { name: "Mango", sell: "130g/day", badge: "bg-green", note: "High value — unlocked post-Island." },
  { name: "Apple", sell: "100g/day", badge: "bg-gray", note: "Reliable and cheap to start." },
  { name: "Cherry", sell: "80g/day", badge: "bg-blue", note: "Good early greenhouse option." },
];


// ─── ARTISAN CHAINS ───────────────────────────────────────────────────────────

/**
 * All artisan processing chains, ranked by profit potential.
 *
 * Field reference:
 *   name    — artisan product name
 *   req     — { equip?: string, animal?: string } requirements to unlock
 *   icon    — emoji displayed in the active-chains card
 *   badge   — CSS badge class for the rank chip
 *   machine — machine name + processing time (display string)
 *   raw     — input item + raw value (display string)
 *   out     — output item + sell price (display string)
 *   note    — strategy note
 *   p       — priority rank (1 = most profitable)
 */
const ARTISAN_CHAINS = [
  {
    name: "Truffle Oil",
    req: { equip: "Oil Maker", animal: "pig" },
    icon: "🐷", badge: "bg-amber",
    machine: "Oil Maker", raw: "Truffle (500g)", out: "Truffle Oil (1065g)",
    note: "Highest animal product. Pigs forage non-winter non-rain. Never sell raw.", p: 1,
  },
  {
    name: "Starfruit Wine",
    req: { equip: "Keg" },
    icon: "🍷", badge: "bg-purple",
    machine: "Keg (7d)", raw: "Starfruit (750g)", out: "Wine (2250g)",
    note: "Best crop-to-wine. Stack kegs. Cask → Iridium = 6750g.", p: 2,
  },
  {
    name: "Ancient Fruit Wine",
    req: { equip: "Keg" },
    icon: "🍷", badge: "bg-green",
    machine: "Keg (7d)", raw: "Ancient Fruit (550g)", out: "Wine (1650g)",
    note: "Greenhouse steady income, zero seed cost. Cask → 4950g.", p: 3,
  },
  {
    name: "Pale Ale",
    req: { equip: "Keg" },
    icon: "🍺", badge: "bg-amber",
    machine: "Keg (2d)", raw: "Hops (25g)", out: "Pale Ale (300g)",
    note: "2-day turnaround. Hops regrow daily — very high throughput.", p: 4,
  },
  {
    name: "Cheese",
    req: { equip: "Cheese Press", animal: "cow" },
    icon: "🧀", badge: "bg-blue",
    machine: "Cheese Press", raw: "Milk / Large Milk", out: "230–345g",
    note: "Always process milk. High friendship = gold cheese automatically.", p: 5,
  },
  {
    name: "Goat Cheese",
    req: { equip: "Cheese Press", animal: "goat" },
    icon: "🧀", badge: "bg-blue",
    machine: "Cheese Press", raw: "Goat Milk", out: "Goat Cheese (400g)",
    note: "Significantly more than regular cheese.", p: 6,
  },
  {
    name: "Mayonnaise",
    req: { equip: "Mayonnaise Machine", animal: "chicken" },
    icon: "🥚", badge: "bg-gray",
    machine: "Mayo Machine", raw: "Egg / Large Egg", out: "Mayo 190g / Large 380g",
    note: "Always process eggs. Duck Mayo = 375g, Dino = 800g.", p: 7,
  },
  {
    name: "Duck Mayo",
    req: { equip: "Mayonnaise Machine", animal: "duck" },
    icon: "🦆", badge: "bg-teal",
    machine: "Mayo Machine", raw: "Duck Egg", out: "Duck Mayo (375g)",
    note: "Nearly double regular mayo. Keep friendship maxed.", p: 8,
  },
  {
    name: "Dino Mayo",
    req: { equip: "Mayonnaise Machine", animal: "dino" },
    icon: "🦕", badge: "bg-coral",
    machine: "Mayo Machine", raw: "Dinosaur Egg", out: "Dino Mayo (800g)",
    note: "Highest mayo value. Rare but very profitable.", p: 9,
  },
  {
    name: "Cloth",
    req: { equip: "Loom", animal: "sheep" },
    icon: "🐑", badge: "bg-teal",
    machine: "Loom (4h)", raw: "Wool", out: "Cloth (470g)",
    note: "Always in demand. High friendship = faster wool.", p: 10,
  },
  {
    name: "Cloth (Rabbit)",
    req: { equip: "Loom", animal: "rabbit" },
    icon: "🐇", badge: "bg-gray",
    machine: "Loom", raw: "Rabbit Wool", out: "Cloth (470g)",
    note: "Rabbits also produce wool alongside Rabbit's Foot.", p: 11,
  },
  {
    name: "Animal Feed",
    req: { equip: "Mill" },
    icon: "🌾", badge: "bg-coral",
    machine: "Mill", raw: "Wheat / Amaranth", out: "Animal Feed",
    note: "Free winter hay. Mill Wheat + Amaranth for best results.", p: 12,
  },
  {
    name: "Honey",
    req: { equip: "Bee House" },
    icon: "🍯", badge: "bg-amber",
    machine: "Bee House (4d)", raw: "Flowers nearby", out: "100–680g",
    note: "Fairy Rose Honey = 680g. Plant flowers adjacent. Inactive winter.", p: 13,
  },
  {
    name: "Aged products",
    req: { equip: "Cask" },
    icon: "🍶", badge: "bg-purple",
    machine: "Cask (varies)", raw: "Cheese / Wine", out: "Silver→Iridium quality",
    note: "Cellar only. Iridium Starfruit Wine = 6750g.", p: 14,
  },
  {
    name: "Dried fruit",
    req: { equip: "Dehydrator" },
    icon: "🍎", badge: "bg-pink",
    machine: "Dehydrator", raw: "Any fruit", out: "+~160% value",
    note: "Faster than kegs for fruit. Good secondary option.", p: 15,
  },
  {
    name: "Smoked fish",
    req: { equip: "Fish Smoker" },
    icon: "🐟", badge: "bg-blue",
    machine: "Fish Smoker", raw: "Fish", out: "2× sell price",
    note: "Doubles fish value. Great if you fish regularly.", p: 16,
  },
  {
    name: "Recycled goods",
    req: { equip: "Recycling Machine" },
    icon: "♻️", badge: "bg-gray",
    machine: "Recycling Machine", raw: "Trash / Junk", out: "Refined materials",
    note: "Converts crab pot trash into useful materials.", p: 17,
  },
  {
    name: "Slime products",
    req: { equip: "Slime Hutch" },
    icon: "💚", badge: "bg-green",
    machine: "Slime Hutch", raw: "Slimes", out: "Slime / Pearlescent",
    note: "Pearlescent Slime for Tiger Slime Girl quest.", p: 18,
  },
];

/**
 * Crops that qualify for the "utility plot" rotation.
 * These are grown primarily for bundles, cooking, gifting, or animal upkeep
 * rather than raw profit — the utility plot deliberately cycles through them
 * to maintain variety and cover non-profit needs.
 */
const UTILITY_CROP_NAMES = [
  "Carrot", "Yam", "Bok Choy", "Radish", "Tomato", "Garlic", "Parsnip",
];

/**
 * Crops considered "fruits" for the purpose of Keg → Wine artisan boosting.
 * These receive the wine multiplier (sell × 3) in effectiveGoldPerDay calculations.
 */
const FRUIT_CROP_NAMES = new Set([
  "Strawberry", "Blueberry", "Coffee Bean", "Grape", "Cranberry",
  "Melon", "Rhubarb", "Peach", "Pomegranate", "Banana", "Cherry", "Apple", "Mango",
]);
