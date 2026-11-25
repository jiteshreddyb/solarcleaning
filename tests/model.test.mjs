import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaults, replay, assess, soilingRatio } from "../public/model.mjs";
import { columns, importHourly, templateCsv, makeCsv, validateSettings } from "../public/data.mjs";

const reference = JSON.parse(readFileSync(new URL("../public/assets/dubai-2025.json", import.meta.url)));
const baseline = replay(reference, defaults);
const august = baseline.records.find(record => record.date === "2025-08-14");
const close = (a, b, tolerance = 0.0001) => assert.ok(Math.abs(a - b) < tolerance, a + " differs from " + b);

test("the shipped model reproduces the scheduler's decision dates, energy and net value", () => {
  const historical = baseline.records.slice(0, -1);
  assert.equal(historical.length, 365);
  assert.equal(baseline.minDay, 7);
  assert.deepEqual(historical.filter(r => r.dry?.clean).map(r => r.date),
    ["2025-03-09", "2025-05-15", "2025-07-08", "2025-08-14", "2025-09-15"]);
  const total = historical.reduce((s, r) => s + r.actualKwh, 0);
  close(total, 17204188.88184508, .01);
  close((total - 15350241.516276663) * defaults.tariff - 5 * defaults.washCost, 156915.43589149526, .01);
  close(august.dry.energy, 87352.98726607766);
  close(august.dry.net, 259.56439946663886);
});

test("recoverable current uses the DC reference power and operating voltage", () => {
  close(august.amps, august.referenceKw * 1000 * august.loss / defaults.voltage);
  const next = replay(reference, { ...defaults, voltage: 400 }).records[225];
  close(next.amps, august.amps * 2);
  close(next.dry.energy, august.dry.energy);
});

test("effective rain acts at the start of the specified day", () => {
  const immediate = assess(august, defaults, 1);
  assert.equal(immediate.energy, 0);
  assert.equal(immediate.amps, 0);
  assert.equal(immediate.net, -defaults.washCost);
  const rain = assess(august, defaults, 7);
  close(rain.energy, august.cumulative[6]);
  assert.equal(rain.clean, false);
  assert.equal(rain.payback, 30);
});

test("the issue-time forecast cannot see same-day or later observations", () => {
  const rows = reference.rows.map((row, index) => index < 225 * 24 ? row : [0, 0, 0, 10]);
  const changed = replay({ ...reference, rows }, defaults).records[225];
  assert.deepEqual(changed.cumulative, august.cumulative);
  assert.equal(changed.mass, august.mass);
});

test("partial and zero-efficacy washes, inverter clipping, and zero tariff are respected", () => {
  const rows = Array.from({ length: 168 }, () => [100, 50, 15, 0, 0]);
  const data = { start: reference.start, rows };
  const site = { ...defaults, initialMass: 1, acLimit: 1000, washCost: 0 };
  const full = replay(data, site, "farm").records.at(-1);
  const half = replay(data, { ...site, washRemoval: 50 }, "farm").records.at(-1);
  assert.ok(full.amps > half.amps && half.amps > 0);
  assert.ok(full.dry.energy > half.dry.energy && half.dry.energy > 0);
  assert.equal(replay(data, { ...site, washRemoval: 0 }, "farm").records.at(-1).dry.energy, 0);
  const clipped = replay(data, { ...site, acLimit: 1 }, "farm").records.at(-1);
  assert.equal(clipped.dry.energy, 0);
  assert.ok(clipped.amps > 0);
  const freePower = assess(full, { ...site, tariff: 0, washCost: 0 });
  assert.equal(freePower.clean, false);
  assert.equal(freePower.payback, null);
});

test("the farm issues a new decision at the end of a seven-day logged wash history", () => {
  const dataset = importHourly(templateCsv(reference));
  assert.equal(dataset.rows.length, 168);
  dataset.rows[167][4] = 1;
  const result = replay(dataset, { ...defaults, initialMass: 2 }, "farm");
  assert.equal(result.maxDay, 7);
  assert.equal(result.records[7].date, "2025-01-08");
  assert.equal(result.records[6].washed, true);
  assert.ok(result.records[7].mass < .01);
  assert.equal(result.records[7].actualKwh, null);
  assert.equal(result.records[7].loss, 1 - soilingRatio(result.records[7].mass));
});

test("the importer accepts quoted CSV and rejects invalid scientific inputs", () => {
  const sample = templateCsv(reference);
  const lines = sample.trim().split("\r\n");
  assert.equal(importHourly("\uFEFF" + sample.replaceAll(",", '","').split("\r\n").filter(Boolean).map(line => '"' + line + '"').join("\n")).rows.length, 168);
  assert.throws(() => importHourly(sample.replace(columns[1], "metered_AC_kw")), /Missing columns/);
  assert.throws(() => importHourly(lines.slice(0, -1).join("\n")), /complete UTC days/);
  const corrupt = (index, value) => {
    const cells = lines[3].split(",");
    cells[index] = value;
    return [lines[0], lines[1], lines[2], cells.join(","), ...lines.slice(4)].join("\n");
  };
  assert.throws(() => importHourly(corrupt(0, lines[1].split(",")[0])), /continuous/);
  assert.throws(() => importHourly(corrupt(1, "")), /numbers/);
  assert.throws(() => importHourly(corrupt(2, "Infinity")), /numbers/);
  assert.throws(() => importHourly(corrupt(3, "10000000")), /cannot exceed/);
  assert.throws(() => importHourly(corrupt(4, "-1")), /nonnegative/);
  assert.throws(() => importHourly(corrupt(5, "2")), /0 or 1/);
});

test("only a logged wash or historical effective rainfall clears imported dust history", () => {
  const rows = Array.from({ length: 192 }, () => [20, 0, 0, 0, 0]);
  const options = { ...defaults, initialMass: 2, washCost: 0 };
  const data = { start: reference.start, rows };
  const dry = replay(data, options, "farm");
  assert.ok(dry.records[7].dry.clean);
  assert.equal(dry.records[8].mass, 2);
  rows[168][3] = options.rainThreshold;
  const wet = replay(data, options, "farm");
  assert.equal(wet.records[8].mass, 0);
  assert.ok(wet.records[7].dry.clean);
});

test("settings reject invalid units and CSV export quotes operator-entered data", () => {
  assert.throws(() => validateSettings({ ...defaults, voltage: 0 }), /allowed range/);
  assert.throws(() => validateSettings({ ...defaults, horizon: 4.5 }), /whole number/);
  assert.match(makeCsv([['=1+1', 'Field "A", East', -5]]), /"'=1\+1","Field ""A"", East","-5"/);
});
