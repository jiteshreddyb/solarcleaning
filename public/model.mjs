export const defaults = Object.freeze({
  name: "Dubai reference farm", tariff: 0.10980775, washCost: 9332.470588,
  voltage: 800, acLimit: 10000 * 10000 / 12994.8, horizon: 30, tilt: 25,
  inverterEfficiency: 96, otherLoss: 6, rainThreshold: 3, washRemoval: 100, initialMass: 0,
});

// The convergent Taylor series covers the site's typical mass range.
// The bounded A&S tail also handles extreme concentrations in imported histories.
function erf(x) {
  if (x === 0) return 0;
  if (x <= 2) {
    let term = x;
    let sum = x;
    for (let n = 1; n <= 32; n++) {
      term *= -x * x / n;
      const increment = term / (2 * n + 1);
      sum += increment;
      if (Math.abs(increment) < 1e-16) break;
    }
    return 2 / Math.sqrt(Math.PI) * sum;
  }
  const t = 1 / (1 + 0.3275911 * x);
  const polynomial = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t
    - 0.284496736) * t + 0.254829592) * t;
  return 1 - polynomial * Math.exp(-x * x);
}

export function soilingRatio(mass) {
  return 1 - 0.3437 * erf(0.17 * Math.max(0, mass) ** 0.8473);
}

const zeros = () => Array(24).fill(0);

function pastProfile(firstHour, rows, deposits) {
  const dc = zeros();
  const dust = zeros();
  for (let i = firstHour - 168; i < firstHour; i++) {
    dc[i % 24] += rows[i][0] / 7;
    dust[i % 24] += deposits[i] / 7;
  }
  return { dc, dust };
}

function forecast(mass, profile, settings) {
  const retained = 1 - settings.washRemoval / 100;
  const cleanMass = mass * retained;
  const conversion = (1 - settings.otherLoss / 100) * settings.inverterEfficiency / 100;
  const ac = (dc, dust) => Math.min(settings.acLimit, dc * conversion * soilingRatio(dust));
  let deposition = 0;
  const cumulative = [0];
  for (let d = 0; d < settings.horizon; d++) {
    let gain = 0;
    for (let h = 0; h < 24; h++) {
      deposition += profile.dust[h];
      gain += ac(profile.dc[h], cleanMass + deposition) - ac(profile.dc[h], mass + deposition);
    }
    cumulative.push(cumulative[d] + gain);
  }
  const referenceKw = Math.max(...profile.dc);
  const beforeAmps = referenceKw * 1000 * soilingRatio(mass) / settings.voltage;
  const afterAmps = referenceKw * 1000 * soilingRatio(cleanMass) / settings.voltage;
  return { cumulative, referenceKw, beforeAmps, afterAmps, amps: afterAmps - beforeAmps };
}

export function assess(record, settings, rainDay = null) {
  // An effective rain event at the START of a day erases the difference thereafter.
  const horizon = record.cumulative.length - 1;
  const dryDays = rainDay === null ? horizon : Math.max(0, Math.min(horizon, rainDay - 1));
  const energy = record.cumulative[dryDays];
  const gross = energy * settings.tariff;
  const net = gross - settings.washCost;
  const payback = record.cumulative.findIndex(kwh => kwh * settings.tariff > settings.washCost);
  const rainAtIssue = dryDays === 0;
  const beforeAmps = rainAtIssue ? record.referenceKw * 1000 / settings.voltage : record.beforeAmps;
  const afterAmps = rainAtIssue ? beforeAmps : record.afterAmps;
  return { dryDays, energy, gross, net, clean: net > 0, payback: payback < 0 ? null : payback,
    beforeAmps, afterAmps, amps: afterAmps - beforeAmps };
}

export function replay(dataset, settings, source = "reference") {
  const { rows } = dataset;
  const days = rows.length / 24;
  const coefficient = 0.0036 * Math.cos(settings.tilt * Math.PI / 180);
  const deposits = rows.map(([, coarseTotal, fine]) =>
    coefficient * (fine * 0.0009 + (coarseTotal - fine) * 0.004));
  const startTime = Date.parse(dataset.start);
  const dates = [];
  const records = [];
  let mass = settings.initialMass;
  let rollingRain = 0;
  const conversion = (1 - settings.otherLoss / 100) * settings.inverterEfficiency / 100;
  for (let day = 0; day <= days; day++) {
    const first = day * 24;
    const date = new Date(startTime + day * 86400000).toISOString().slice(0, 10);
    dates.push(date);
    const record = { date, mass, loss: 1 - soilingRatio(mass), washed: false, actualKwh: null };
    if (day >= 7) {
      Object.assign(record, forecast(mass, pastProfile(first, rows, deposits), settings));
      record.dry = assess(record, settings);
    }
    records.push(record);
    if (day === days) break; // the next issue time is available after the last complete day
    if (source === "reference" && record.dry?.clean) {
      mass *= 1 - settings.washRemoval / 100;
      record.washed = true;
    }
    record.actualKwh = 0;
    for (let i = first; i < first + 24; i++) {
      if (source === "farm" && rows[i][4] === 1) {
        mass *= 1 - settings.washRemoval / 100;
        record.washed = true;
      }
      rollingRain += rows[i][3] - (i >= 24 ? rows[i - 24][3] : 0);
      mass = rollingRain + 1e-9 >= settings.rainThreshold ? 0 : mass + deposits[i];
      record.actualKwh += Math.min(settings.acLimit, rows[i][0] * conversion * soilingRatio(mass));
    }
  }
  return { dates, records, minDay: 7, maxDay: source === "farm" ? days : days - 1 };
}
