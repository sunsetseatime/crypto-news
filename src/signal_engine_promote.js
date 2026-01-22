const fs = require("fs");
const path = require("path");
const readline = require("readline");

const ROOT_DIR = path.join(__dirname, "..");
const CONFIG_PATH = path.join(ROOT_DIR, "config", "signal_engine_projects.json");
const SUGGESTIONS_PATH = path.join(
  ROOT_DIR,
  "reports",
  "signal_engine",
  "signal_engine_candidate_suggestions.json"
);

function readJsonFile(filePath, fallbackValue) {
  try {
    if (!fs.existsSync(filePath)) return fallbackValue;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallbackValue;
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function normalizeId(value) {
  return String(value || "").trim().toLowerCase();
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || "").trim());
    });
  });
}

function findSuggestionById(suggestions, id) {
  const niches = suggestions?.niches || {};
  for (const [nicheKey, list] of Object.entries(niches)) {
    const match = (Array.isArray(list) ? list : []).find(
      (item) => normalizeId(item?.id) === normalizeId(id)
    );
    if (match) {
      return { nicheKey, candidate: match };
    }
  }
  return null;
}

function listTrackedByNiche(config, nicheKey) {
  const candidates = Array.isArray(config?.candidates) ? config.candidates : [];
  return candidates.filter((c) => String(c.niche || "").trim() === nicheKey);
}

async function listSuggestions() {
  const suggestions = readJsonFile(SUGGESTIONS_PATH, null);
  if (!suggestions) {
    console.log("No suggestions file found. Run: node src/signal_engine.js");
    return;
  }
  console.log("Signal Engine Candidate Suggestions:");
  for (const [nicheKey, list] of Object.entries(suggestions.niches || {})) {
    console.log(`\n${nicheKey}:`);
    for (const item of list || []) {
      console.log(`- ${item.id} (${item.symbol || "?"}) score=${item.score} coverage=${item.coverageScore}/7`);
    }
  }
}

async function promoteCandidate(id) {
  if (!id) {
    console.log("Usage: node src/signal_engine_promote.js promote <coingecko-id>");
    return;
  }

  const suggestions = readJsonFile(SUGGESTIONS_PATH, null);
  if (!suggestions) {
    console.log("No suggestions file found. Run: node src/signal_engine.js");
    return;
  }

  const found = findSuggestionById(suggestions, id);
  if (!found) {
    console.log(`Candidate not found in suggestions: ${id}`);
    return;
  }

  const config = readJsonFile(CONFIG_PATH, null);
  if (!config) {
    console.log("Missing config/signal_engine_projects.json");
    return;
  }

  const { nicheKey, candidate } = found;
  const trackedIds = new Set(
    (Array.isArray(config?.candidates) ? config.candidates : [])
      .map((c) => normalizeId(c?.coin_gecko_id))
      .filter(Boolean)
  );
  if (trackedIds.has(normalizeId(candidate.id))) {
    console.log("That candidate is already tracked in signal_engine_projects.json.");
    return;
  }
  const tracked = listTrackedByNiche(config, nicheKey);
  if (tracked.length === 0) {
    console.log(`No tracked candidates found for niche: ${nicheKey}`);
    return;
  }

  console.log(`\nPromote candidate: ${candidate.name || candidate.id} (${candidate.symbol || "?"})`);
  console.log(`Niche: ${nicheKey}`);
  console.log("\nChoose which tracked project to replace:");
  tracked.forEach((item, idx) => {
    console.log(`  ${idx + 1}) ${item.coin_gecko_id} (${item.symbol || "?"})`);
  });

  const choice = await prompt("Enter number (or press Enter to cancel): ");
  const index = Number(choice);
  if (!Number.isFinite(index) || index < 1 || index > tracked.length) {
    console.log("Canceled.");
    return;
  }

  const confirm = await prompt(
    `Type YES to replace ${tracked[index - 1].coin_gecko_id} with ${candidate.id}: `
  );
  if (confirm.toLowerCase() !== "yes") {
    console.log("Canceled.");
    return;
  }

  const candidates = Array.isArray(config.candidates) ? config.candidates : [];
  const targetId = tracked[index - 1].coin_gecko_id;
  const targetIdx = candidates.findIndex(
    (c) => normalizeId(c?.coin_gecko_id) === normalizeId(targetId)
  );
  if (targetIdx === -1) {
    console.log("Could not locate target in config.");
    return;
  }

  candidates[targetIdx] = {
    coin_gecko_id: candidate.id,
    symbol: candidate.symbol || "",
    name: candidate.name || candidate.id,
    niche: nicheKey === "picks_and_shovels" ? "picks_shovels" : nicheKey,
    defillama_slug: null,
    manual: {
      emissions_usd_30d: null,
    },
  };

  config.candidates = candidates;
  writeJsonFile(CONFIG_PATH, config);
  console.log(`Updated ${CONFIG_PATH}`);
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === "help") {
    console.log("Usage:");
    console.log("  node src/signal_engine_promote.js list");
    console.log("  node src/signal_engine_promote.js promote <coingecko-id>");
    return;
  }

  if (cmd === "list") {
    await listSuggestions();
    return;
  }

  if (cmd === "promote") {
    await promoteCandidate(args[1]);
    return;
  }

  console.log(`Unknown command: ${cmd}`);
}

main().catch((err) => {
  console.error(`Signal Engine promote failed: ${err.message}`);
  process.exit(1);
});
