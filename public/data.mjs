import { defaults } from "./model.mjs";

export const columns = ["timestamp_utc", "clean_dc_kw", "pm10_ug_m3", "pm25_ug_m3", "rain_mm", "wash_completed"];
const hour = 3600000;
const maxHours = 366 * 24 * 2;

function csvCells(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      cells.push(value.trim());
      value = "";
    } else value += ch;
  }
  if (quoted) throw new Error("A CSV field has an unclosed quote.");
  cells.push(value.trim());
  return cells;
}

export function importHourly(text) {
  if (text.length > 6 * 1024 * 1024) throw new Error("Use a CSV smaller than 6 MB.");
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r\n|\n|\r/);
  const header = csvCells(lines.shift() || "");
  const indices = columns.map(name => header.indexOf(name));
  const missing = columns.filter((_, i) => indices[i] < 0);
  if (missing.length) throw new Error("Missing columns — " + missing.join(", ") + ".");
  if (new Set(header).size !== header.length) throw new Error("Give every CSV column a unique name.");
  if (lines.length < 168 || lines.length > maxHours || lines.length % 24) {
    throw new Error("Supply 7 to 732 complete UTC days, with exactly 24 rows per day.");
  }
  let start;
  const rows = lines.map((line, i) => {
    const at = "Row " + (i + 2) + " — ";
    const cells = csvCells(line);
    if (cells.length !== header.length) throw new Error(at + "the number of columns changed.");
    const [stamp, ...values] = indices.map(index => cells[index]);
    const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):00(?::00(?:\.0{1,3})?)?(?:Z|\+00:00)$/.exec(stamp);
    if (!match) throw new Error(at + "use UTC whole hours such as 2025-01-01T00:00:00Z.");
    const time = Date.parse(match[1] + "T" + match[2] + ":00:00Z");
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 13) !== match[1] + "T" + match[2]) {
      throw new Error(at + "the timestamp is invalid.");
    }
    if (i === 0) {
      start = time;
      if (match[2] !== "00") throw new Error("The first row must start at 00:00 UTC.");
    }
    if (time !== start + i * hour) throw new Error(at + "hours must be continuous, in order and unique.");
    if (values.some(cell => !/^\+?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(cell))) {
      throw new Error(at + "power, particles, rain and wash flags must be nonnegative numbers.");
    }
    const nums = values.map(Number);
    if (nums.some(n => !Number.isFinite(n) || n > 1e9)) throw new Error(at + "a numeric reading is out of range.");
    if (nums[2] > nums[1]) throw new Error(at + "PM2.5 cannot exceed PM10.");
    if (nums[4] !== 0 && nums[4] !== 1) throw new Error(at + "wash_completed must be 0 or 1.");
    return nums;
  });
  return { start: new Date(start).toISOString(), rows };
}

export const settingBounds = {
  tariff: [0, 1000], washCost: [0, 1e9], voltage: [1, 3000], acLimit: [0.001, 1e8],
  horizon: [1, 90], tilt: [0, 90], inverterEfficiency: [1, 100], otherLoss: [0, 99],
  rainThreshold: [0.01, 1000], washRemoval: [0, 100], initialMass: [0, 10],
};

export function validateSettings(input) {
  const name = String(input.name || "").trim();
  if (!name || name.length > 60) throw new Error("Enter a farm name of 1–60 characters.");
  const settings = { ...defaults, name };
  for (const [key, [min, max]] of Object.entries(settingBounds)) {
    if (input[key] == null || String(input[key]).trim() === "") throw new Error("Complete every operating assumption.");
    const value = Number(input[key]);
    if (!Number.isFinite(value) || value < min || value > max) throw new Error("Check the allowed range for " + key + ".");
    settings[key] = value;
  }
  if (!Number.isInteger(settings.horizon)) throw new Error("The horizon must be a whole number of days.");
  return settings;
}

export function templateCsv(dataset) {
  const start = Date.parse(dataset.start);
  return [columns.join(","), ...dataset.rows.slice(0, 168).map((row, i) =>
    [new Date(start + i * hour).toISOString(), ...row.slice(0, 4), 0].join(",")
  )].join("\r\n") + "\r\n";
}

export function makeCsv(rows) {
  // The farm name is operator-entered text and may begin with spreadsheet syntax.
  return "\uFEFF" + rows.map(row => row.map(item => {
    let text = String(item ?? "");
    if (typeof item === "string" && /^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }).join(",")).join("\r\n") + "\r\n";
}
