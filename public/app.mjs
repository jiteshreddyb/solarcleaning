import { defaults, replay, assess } from "./model.mjs";
import { importHourly, validateSettings, templateCsv, makeCsv } from "./data.mjs";
import { fillIcons, svgIcon } from "./icons.mjs";
import { drawForecast } from "./chart.mjs";

const $ = id => document.getElementById(id);
const all = selector => [...document.querySelectorAll(selector)];
const text = (id, value) => { $(id).textContent = value; };
const number = (n, decimals = 0) => n.toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const signed = (n, places = 0) => (n > 0 ? "+" : n < 0 ? "−" : "") + number(Math.abs(n), places);
const formatDate = date => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(date + "T00:00:00Z"));
const energyParts = kwh => kwh >= 1000 ? [number(kwh / 1000, 2), "MWh"] : [number(kwh, kwh < 10 ? 2 : 1), "kWh"];
const metric = (id, value, unit) => {
  const small = document.createElement("small");
  small.textContent = unit;
  $(id).replaceChildren(document.createTextNode(value), small);
};
const storageKey = "heliofield.workspace.v1";
const referenceDate = "2025-08-14";
const historyPageSize = 5;
let reference, archive, settings, day, rainDay = null, chartMode = "energy", page = 0;
let workspace = { source: "reference", profiles: { reference: { ...defaults } }, selected: {}, farm: null, filename: "" };
let draftSource, draftData, draftName, draftProfiles, fileSequence = 0, importing = false;
let toastTimer;
const form = $("settings-form");
fillIcons();

function toast(message) {
  text("toast", message);
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $("toast").hidden = true; }, 4200);
}

function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(workspace)); return true; }
  catch { toast("This session is active. Browser storage is full or unavailable."); return false; }
}

function readSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!saved || !["reference", "farm"].includes(saved.source)) return;
    const profiles = { reference: validateSettings(saved.profiles.reference) };
    if (saved.profiles.farm) profiles.farm = validateSettings(saved.profiles.farm);
    const farm = saved.farm;
    if (farm && (!Array.isArray(farm.rows) || farm.rows.length < 168 || farm.rows.length % 24 ||
        farm.rows.length > 17568 || !Number.isFinite(Date.parse(farm.start)) ||
        farm.rows.some(row => !Array.isArray(row) || row.length !== 5 || row.some(x => !Number.isFinite(x) || x < 0) ||
          row[2] > row[1] || ![0, 1].includes(row[4])))) return;
    if (saved.source === "farm" && (!farm || !profiles.farm)) return;
    workspace = { source: saved.source, profiles, selected: saved.selected || {}, farm, filename: String(saved.filename || "") };
  } catch { /* A new or expired workspace starts with the reference replay. */ }
}

function rebuild(preferredDate) {
  const source = workspace.source;
  settings = workspace.profiles[source];
  archive = replay(source === "reference" ? reference : workspace.farm, settings, source);
  const preferred = archive.dates.indexOf(preferredDate || workspace.selected[source]);
  const fallback = source === "reference" ? archive.dates.indexOf(referenceDate) : archive.maxDay;
  day = preferred >= archive.minDay && preferred <= archive.maxDay ? preferred : fallback;
  rainDay = null;
  page = 0;
  $("history-filter").value = "all";
  $("issue-date").min = archive.dates[archive.minDay];
  $("issue-date").max = archive.dates[archive.maxDay];
  $("rain-day").max = settings.horizon + 1;
  renderDay();
}

function currentRecord() { return archive.records[day]; }
function currentCase() { return assess(currentRecord(), settings, rainDay); }
function scenarioName() { return rainDay === null ? "Dry outlook" : "Effective rain at start of day " + rainDay; }

function renderDay() {
  const record = currentRecord();
  text("site-name", settings.name);
  text("site-size", workspace.source === "reference" ? "10 MWp DC" :
    (settings.acLimit >= 1000 ? number(settings.acLimit / 1000, 2) + " MW" : number(settings.acLimit, 1) + " kW") + " AC limit");
  $("site-source").lastElementChild.textContent = workspace.source === "reference" ? "Historical replay" :
    (day === archive.maxDay ? "Next issue from CSV" : "Imported history");
  const today = new Date().toISOString().slice(0, 10);
  const oldImport = workspace.source === "farm" && day === archive.maxDay && record.date < today;
  $("data-age").hidden = !oldImport;
  if (oldImport) text("data-age", "The last imported hour was " + formatDate(archive.dates[day - 1]) + " at 23:00 UTC. This projection uses historical inputs.");
  text("date-label", formatDate(record.date));
  $("issue-date").value = record.date;
  $("prev-date").disabled = day === archive.minDay;
  $("next-date").disabled = day === archive.maxDay;
  text("chart-issue", workspace.source === "reference" ? "Issued 04:00 GST · 00:00 UTC" : "Issued 00:00 UTC");
  text("chart-range", settings.horizon + "-day horizon");
  renderScenario();
  renderHistory();
}

function renderScenario() {
  const record = currentRecord(), result = currentCase();
  text("dispatch-title", result.clean ? "Clean the array." : "Hold the wash.");
  let explanation;
  if (rainDay !== null) {
    explanation = "Effective rain on day " + rainDay + " leaves " + result.dryDays + " dry " +
      (result.dryDays === 1 ? "day" : "days") + " to recover the wash cost. " +
      (result.clean ? "The wash still pays back." : "The wash does not pay back in this scenario.");
  } else if (result.clean) {
    explanation = "A wash pays back on day " + result.payback + " of the " + settings.horizon +
      "-day dry outlook at this farm’s electricity rate.";
  } else if (result.net === 0) {
    explanation = "Recovered electricity just covers the wash cost across the " + settings.horizon + "-day dry outlook.";
  } else {
    explanation = "The projected energy gain falls AED " + number(-result.net, -result.net < 1 ? 2 : 0) +
      " short of the wash cost over the " + settings.horizon + "-day dry outlook.";
  }
  text("dispatch-copy", explanation);
  metric("m-loss", number(100 * record.loss, 2), "%");
  metric("m-current", number(result.amps, result.amps > 100 ? 0 : 1), "A");
  metric("m-energy", ...energyParts(result.energy));
  metric("m-net", signed(result.net, Math.abs(result.net) < 1 ? 2 : 0), "AED");
  $("m-net").classList.toggle("positive", result.net > 0);
  $("m-net").classList.toggle("negative", result.net < 0);
  text("current-caption", "Reference load at " + number(settings.voltage) + " V DC");
  text("energy-caption", settings.horizon + "-day " + (rainDay === null ? "dry outlook" : "rain scenario"));
  const slider = $("rain-day");
  slider.value = rainDay ?? settings.horizon + 1;
  slider.style.setProperty("--pct", ((Number(slider.value) - 1) / settings.horizon * 100) + "%");
  text("rain-value", rainDay === null ? "No rain" : "Day " + rainDay);
  slider.setAttribute("aria-valuetext", scenarioName());
  text("payback-days", result.payback === null ? "Beyond " + settings.horizon + "-day horizon" : result.payback + (result.payback === 1 ? " day" : " days"));
  renderChart();
}

function renderChart() {
  if (archive) drawForecast($("chart"), currentRecord(), settings, currentCase(), rainDay, chartMode);
}

function changeDay(index, scrollTop = false) {
  if (!Number.isInteger(index) || index < archive.minDay || index > archive.maxDay) return;
  day = index;
  workspace.selected[workspace.source] = archive.dates[day];
  save();
  rainDay = null;
  page = 0;
  renderDay();
  text("announce", formatDate(currentRecord().date) + ". " + $("dispatch-title").textContent);
  if (scrollTop) $("overview").scrollIntoView({ block: "start" });
}

function historyRows() {
  let rows = archive.records.slice(archive.minDay, day + 1).reverse();
  if ($("history-filter").value === "clean") rows = rows.filter(record => record.dry.clean);
  return rows;
}

function renderHistory() {
  const rows = historyRows(), start = page * historyPageSize;
  const visible = rows.slice(start, start + historyPageSize);
  $("history-body").innerHTML = visible.map(record => {
    const state = record.dry.clean ? "wash" : "wait";
    const label = formatDate(record.date);
    return '<tr><td><button type="button" data-date="' + record.date + '">' + label + '</button></td>' +
      '<td><span class="pill ' + state + '">' + (record.dry.clean ? "Clean" : "Wait") + '</span></td>' +
      '<td>' + number(100 * record.loss, 2) + '%</td><td>' + energyParts(record.dry.energy).join(" ") + '</td>' +
      '<td class="' + (record.dry.clean ? "positive-text" : "") + '">' + signed(record.dry.net) + ' AED</td>' +
      '<td><button type="button" class="open-row" data-date="' + record.date + '" aria-label="Inspect ' + label + '">' + svgIcon("arrow-up-right") + '</button></td></tr>';
  }).join("") || '<tr><td colspan="6" class="empty">No wash signals through this decision date.</td></tr>';
  text("history-count", rows.length ? "Showing " + (start + 1) + "–" + (start + visible.length) + " of " + rows.length : "0 decisions");
  $("history-newer").disabled = page === 0;
  $("history-older").disabled = start + historyPageSize >= rows.length;
  $("export-history").disabled = rows.length === 0;
}

function download(filename, contents) {
  const url = URL.createObjectURL(new Blob([contents], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function exportHistory() {
  const rows = [["farm", "data_source", "decision_date_utc", "dry_recommendation", "soiling_loss_pct", "equivalent_current_gain_A", "operating_V", "forecast_recovered_AC_kWh", "net_AED", "horizon_days", "tariff_AED_kWh", "wash_cost_AED", "wash_in_record", "wash_basis"]];
  for (const r of historyRows()) rows.push([settings.name, workspace.source, r.date, r.dry.clean ? "CLEAN" : "WAIT",
    r.loss * 100, r.amps, settings.voltage, r.dry.energy, r.dry.net, settings.horizon, settings.tariff, settings.washCost,
    r.actualKwh === null ? "" : Number(r.washed), workspace.source === "reference" ? "simulated dry policy" : "imported wash log"]);
  download("heliofield-history-" + currentRecord().date + ".csv", makeCsv(rows));
}

function exportDecision() {
  const r = currentRecord(), result = currentCase();
  const head = ["farm", "source", "issue_utc", "rain_scenario", "recommendation", "horizon_days", "tariff_AED_kWh", "wash_cost_AED",
    "start_mass_g_m2", "start_soiling_loss_pct", "reference_clean_DC_kW", "DC_V", "DC_A_before", "DC_A_after", "recoverable_DC_A",
    "AC_limit_kW", "tilt_deg", "wash_mass_removed_pct", "inverter_efficiency_pct", "other_loss_pct", "rain_reset_mm_24h", "initial_mass_g_m2",
    "forecast_day", "cumulative_recovered_AC_kWh", "cumulative_gross_AED", "net_if_washed_AED"];
  const context = [settings.name, workspace.source, r.date + "T00:00:00Z", scenarioName(), result.clean ? "CLEAN" : "WAIT",
    settings.horizon, settings.tariff, settings.washCost, r.mass, r.loss * 100, r.referenceKw, settings.voltage, result.beforeAmps,
    result.afterAmps, result.amps, settings.acLimit, settings.tilt, settings.washRemoval, settings.inverterEfficiency, settings.otherLoss, settings.rainThreshold, settings.initialMass];
  const rows = r.cumulative.map((_, d) => {
    const kwh = r.cumulative[Math.min(d, result.dryDays)];
    return [...context, d, kwh, kwh * settings.tariff, kwh * settings.tariff - settings.washCost];
  });
  download("heliofield-decision-" + r.date + ".csv", makeCsv([head, ...rows]));
}

function populateDecision(focusKey) {
  const r = currentRecord(), s = currentCase();
  text("detail-context", settings.name + " · " + formatDate(r.date) + " at 00:00 UTC · " + scenarioName() + ".");
  const items = [
    ["soil", "Starting dust loading", number(r.mass, 3) + " g/m²" + (r.mass > 10 ? " · beyond validated mass range" : "")],
    ["", "Modeled transmission before wash", number((1 - r.loss) * 100, 2) + "%"],
    ["", "Deposited mass removed", number(settings.washRemoval, 1) + "%"],
    ["", "Reference clean DC load", number(r.referenceKw, 2) + " kW"],
    ["", "DC before → after at " + number(settings.voltage) + " V", number(s.beforeAmps, 1) + " → " + number(s.afterAmps, 1) + " A"],
    ["current", "Recoverable array-equivalent current", number(s.amps, 2) + " A"],
    ["energy", "Extra AC energy over " + settings.horizon + " days", number(s.energy, 2) + " kWh"],
    ["", "Energy needed to cover one wash", settings.tariff > 0 ? number(settings.washCost / settings.tariff, 2) + " kWh" : "Unavailable at zero tariff"],
    ["", "Electricity value", number(settings.tariff, 6) + " AED/kWh"],
    ["", "Gross recovered value", "AED " + number(s.gross, 2)],
    ["", "Full wash cost", "AED " + number(settings.washCost, 2)],
    ["net", "Net value of washing", signed(s.net, 2) + " AED"],
  ];
  const nodes = items.map(([key, term, value]) => {
    const div = document.createElement("div"), dt = document.createElement("dt"), dd = document.createElement("dd");
    dt.textContent = term; dd.textContent = value;
    if (key === "net") div.classList.add("emphasis");
    if (key && key === focusKey) div.classList.add("selected");
    div.append(dt, dd); return div;
  });
  $("calculation").replaceChildren(...nodes);
  $("string-check").open = false;
  $("string-clean").value = ""; $("string-soiled").value = ""; stringCheck();
}

function stringCheck() {
  const clean = $("string-clean"), soiled = $("string-soiled");
  let message = "Enter both readings to compare string current.";
  if (clean.value && soiled.value) {
    if (!clean.checkValidity() || !soiled.checkValidity() || clean.valueAsNumber <= 0) message = "Use a positive clean reading and a nonnegative soiled reading.";
    else {
      const delta = clean.valueAsNumber - soiled.valueAsNumber;
      message = "Clean minus soiled = " + signed(delta, 2) + " A (" + signed(delta / clean.valueAsNumber * 100, 2) + "% of the clean reference).";
      if (delta < 0) message += " The soiled string reads higher. Check the reference conditions.";
    }
  }
  text("string-result", message);
}

function readDraft() {
  return Object.fromEntries(["name", ...Object.keys(defaults).filter(k => k !== "name")].map(k => [k, form.elements[k].value]));
}

function showSource(source, keepDraft = true) {
  if (keepDraft && draftSource) draftProfiles[draftSource] = readDraft();
  draftSource = source;
  const values = draftProfiles[source];
  for (const key of Object.keys(defaults)) form.elements[key].value = values[key] ?? "";
  all("[data-source]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.source === source)));
  $("import-area").hidden = source !== "farm";
  text("source-explanation", source === "reference" ?
    "Explore the modeled 2025 Dubai array. Changing an assumption recalculates the historical wash policy." :
    "Use your block’s hourly history and all-in wash price. Imports and calculations stay in this browser.");
  $("settings-error").hidden = true;
  $("apply-settings").disabled = source === "farm" && importing;
  updateImportStatus();
}

function updateImportStatus() {
  text("import-file-state", draftData ? draftName + " · " + number(draftData.rows.length) + " hours" : "At least seven complete days in UTC.");
}

function setupForm() {
  draftSource = null; importing = false; fileSequence++;
  draftData = workspace.farm; draftName = workspace.filename;
  draftProfiles = {
    reference: { ...workspace.profiles.reference },
    farm: workspace.profiles.farm ? { ...workspace.profiles.farm } :
      { ...defaults, name: "", tariff: "", washCost: "", voltage: "", acLimit: "" },
  };
  $("schema").hidden = true; $("show-schema").setAttribute("aria-expanded", "false");
  $("farm-csv").value = ""; form.querySelector("details").open = false;
  showSource(workspace.source, false);
}

function formError(message) {
  text("settings-error", message); $("settings-error").hidden = false;
  $("settings-error").scrollIntoView({ block: "nearest" });
}

async function importFile() {
  const file = $("farm-csv").files[0];
  if (!file) return;
  const sequence = ++fileSequence;
  importing = true; $("apply-settings").disabled = true; $("settings-error").hidden = true;
  text("import-file-state", "Reading " + file.name + "…");
  try {
    if (file.size > 6 * 1024 * 1024) throw new Error("Use a CSV smaller than 6 MB.");
    const parsed = importHourly(await file.text());
    if (sequence !== fileSequence) return;
    draftData = parsed; draftName = file.name;
    updateImportStatus();
  } catch (error) {
    if (sequence !== fileSequence) return;
    draftData = null; draftName = ""; updateImportStatus();
    formError(error.message);
  } finally {
    if (sequence === fileSequence) { importing = false; $("apply-settings").disabled = false; }
  }
}

function applySettings(event) {
  event.preventDefault();
  if (draftSource === "farm" && importing) return;
  try {
    const next = validateSettings(readDraft());
    if (draftSource === "farm" && !draftData) throw new Error("Choose a valid hourly CSV for this farm.");
    const sourceChanged = workspace.source !== draftSource;
    const replacingData = draftSource === "farm" && draftData !== workspace.farm;
    const selected = replacingData ? null : (sourceChanged ? workspace.selected[draftSource] : currentRecord().date);
    workspace.profiles[draftSource] = next;
    workspace.source = draftSource;
    if (draftSource === "farm") {
      workspace.farm = draftData; workspace.filename = draftName;
      if (replacingData) delete workspace.selected.farm;
    }
    rebuild(selected);
    workspace.selected[draftSource] = currentRecord().date;
    $("settings-dialog").close();
    if (save()) toast("Farm settings applied.");
  } catch (error) { formError(error.message); }
}

function openDialog(name, focusKey) {
  if (!archive && name !== "method") return;
  const dialog = $(name + "-dialog");
  const active = document.querySelector("dialog[open]");
  if (active) active.close();
  if (name === "decision") populateDecision(focusKey);
  if (name === "settings") setupForm();
  dialog.showModal(); dialog.scrollTop = 0;
}

document.addEventListener("click", event => {
  const open = event.target.closest("[data-open]"), close = event.target.closest("[data-close]");
  const detail = event.target.closest("[data-detail]");
  if (open) openDialog(open.dataset.open);
  else if (detail) openDialog("decision", detail.dataset.detail);
  else if (close) close.closest("dialog").close();
  else if (event.target.matches("dialog")) {
    const rect = event.target.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close();
  }
});
$("prev-date").onclick = () => changeDay(day - 1);
$("next-date").onclick = () => changeDay(day + 1);
$("issue-date").onchange = e => {
  const index = archive.dates.indexOf(e.target.value);
  if (index < archive.minDay || index > archive.maxDay) e.target.value = currentRecord().date;
  else changeDay(index);
};
all("[data-unit]").forEach(b => b.onclick = () => {
  chartMode = b.dataset.unit;
  all("[data-unit]").forEach(el => el.setAttribute("aria-pressed", String(el === b)));
  renderChart();
});
$("rain-day").oninput = e => {
  rainDay = Number(e.target.value) > settings.horizon ? null : Number(e.target.value);
  renderScenario();
};
$("rain-day").onchange = () => text("announce", scenarioName() + ". " + $("dispatch-title").textContent);
$("rain-reset").onclick = () => { rainDay = null; renderScenario(); text("announce", "Dry horizon restored."); };
$("history-filter").onchange = () => { page = 0; renderHistory(); };
$("history-newer").onclick = () => { if (page > 0) { page--; renderHistory(); } };
$("history-older").onclick = () => { if ((page + 1) * historyPageSize < historyRows().length) { page++; renderHistory(); } };
$("history-body").onclick = e => { const b = e.target.closest("[data-date]"); if (b) changeDay(archive.dates.indexOf(b.dataset.date), true); };
$("export-history").onclick = exportHistory; $("export-decision").onclick = exportDecision;
$("string-clean").oninput = stringCheck; $("string-soiled").oninput = stringCheck;
all("[data-source]").forEach(b => b.onclick = () => showSource(b.dataset.source));
$("show-schema").onclick = () => {
  $("schema").hidden = !$("schema").hidden;
  $("show-schema").setAttribute("aria-expanded", String(!$("schema").hidden));
};
$("farm-csv").onchange = importFile;
$("get-template").onclick = () => download("heliofield-example-hourly.csv", templateCsv(reference));
form.addEventListener("invalid", event => { const details = event.target.closest("details"); if (details) details.open = true; }, true);
form.onsubmit = applySettings;
const historyObserver = new IntersectionObserver(([entry]) => {
  $("history-nav").classList.toggle("nav-active", entry.isIntersecting);
  $("overview-nav").classList.toggle("nav-active", !entry.isIntersecting);
}, { threshold: .65 });
historyObserver.observe($("history"));
new ResizeObserver(renderChart).observe($("chart"));

try {
  const response = await fetch("./assets/dubai-2025.json");
  if (!response.ok) throw new Error("Reference data failed to load.");
  reference = await response.json();
  readSaved();
  rebuild();
} catch (error) {
  $("load-error").hidden = false;
  text("load-error", "The reference record could not be loaded. Reload the page to retry.");
  text("dispatch-title", "Data unavailable");
  text("dispatch-copy", "A decision requires a complete hourly record.");
  for (const control of document.querySelectorAll("main button, main input, main select, .settings-button")) {
    if (control.dataset.open !== "method") control.disabled = true;
  }
}
