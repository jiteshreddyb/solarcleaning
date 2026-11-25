const num = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const fmt = value => Math.abs(value) >= 10000 ? num.format(value / 1000) + "k" : num.format(value);
const tick = (x, y, label, anchor = "middle", css = "") =>
  '<text x="' + x + '" y="' + y + '" text-anchor="' + anchor + '" class="' + css + '">' + label + '</text>';

function scaleTop(max) {
  const magnitude = 10 ** Math.floor(Math.log10((max || 1) / 3));
  const step = [1, 2, 2.5, 5, 10].find(step => step * magnitude >= (max || 1) / 3) * magnitude;
  return { step, top: Math.ceil((max || 1) / step) * step };
}

export function drawForecast(el, record, settings, scenario, rainDay, mode) {
  const isMoney = mode === "value";
  const thresholdKwh = settings.tariff > 0 ? settings.washCost / settings.tariff : null;
  const inMwh = Math.max(record.cumulative.at(-1), thresholdKwh || 0) >= 1000;
  const factor = isMoney ? settings.tariff : (inMwh ? .001 : 1);
  const unit = isMoney ? "AED" : (inMwh ? "MWh" : "kWh");
  const threshold = isMoney ? settings.washCost : (thresholdKwh === null ? null : thresholdKwh * factor);
  const values = record.cumulative.map((_, day) => record.cumulative[Math.min(day, scenario.dryDays)] * factor);
  const horizon = values.length - 1;
  const { top, step } = scaleTop(Math.max(record.cumulative.at(-1) * factor, threshold || 0));
  const width = Math.max(170, Math.round(el.clientWidth));
  const height = Math.max(150, Math.round(el.clientHeight));
  const left = 40, right = width - 12, upper = 24, lower = height - 27;
  const x = day => left + (right - left) * day / horizon;
  const y = value => lower - value / top * (lower - upper);
  const line = values.map((v, d) => (d ? "L" : "M") + x(d).toFixed(2) + "," + y(v).toFixed(2)).join(" ");
  const grid = [];
  for (let j = 0; j <= Math.round(top / step); j++) {
    const value = j * step;
    grid.push('<path d="M' + left + ' ' + y(value) + 'H' + right + '" stroke="#e2e8df" stroke-dasharray="3 4"/>');
    grid.push(tick(left - 9, y(value) + 3.5, fmt(value), "end"));
  }
  const count = Math.min(width < 420 ? 3 : 6, horizon);
  for (let j = 0; j <= count; j++) {
    const day = Math.round(j * horizon / count);
    grid.push(tick(x(day), height - 7, (j === 0 ? "Day " : "") + day, j === 0 ? "start" : (j === count ? "end" : "middle")));
  }
  const desc = "Day " + horizon + " projects " + num.format(values.at(-1)) + " " + unit +
    (threshold === null ? ". No energy break-even at zero tariff." : ". Wash break-even is " + num.format(threshold) + " " + unit + ".");
  const thresholdLine = threshold === null ? "" : '<path d="M' + left + ' ' + y(threshold) + 'H' + right + '" fill="none" stroke="#a57c3d" stroke-width="1.5" stroke-dasharray="6 4"/>';
  const resetLine = rainDay === null ? "" : '<path d="M' + x(scenario.dryDays) + ' ' + upper + 'V' + lower + '" stroke="#748b73" stroke-dasharray="2 3"/>' +
    tick(Math.min(right - 1, Math.max(left + 1, x(scenario.dryDays))), upper - 7, "Rain · day " + rainDay, scenario.dryDays < horizon / 2 ? "start" : "end");
  el.innerHTML = '<svg role="img" viewBox="0 0 ' + width + ' ' + height + '" aria-labelledby="forecast-title forecast-desc"><title id="forecast-title">Cumulative recovery in ' + unit + '</title><desc id="forecast-desc">' + desc + '</desc><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#8ab681" stop-opacity=".35"/><stop offset="1" stop-color="#b1d3a7" stop-opacity=".07"/></linearGradient></defs>' +
    grid.join("") + tick(0, 13, unit, "start", "axis-title") +
    '<path fill="url(#area)" d="' + line + ' L' + right + ',' + lower + ' L' + left + ',' + lower + 'Z"/>' + thresholdLine + resetLine +
    '<path d="' + line + '" stroke="#39734b" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round" fill="none"/>' +
    '<circle cx="' + right + '" cy="' + y(values.at(-1)) + '" r="4.5" fill="#39734b" stroke="white" stroke-width="2"/>' +
    '<g id="hover-point" visibility="hidden"><path stroke="#97a88f" stroke-dasharray="3 3"/><circle r="4" fill="#285d3c" stroke="white" stroke-width="2"/></g></svg><div class="tip" hidden></div>';
  const marker = el.querySelector("#hover-point");
  const tip = el.querySelector(".tip");
  let selected = 0;
  function show(day, speak) {
    selected = Math.min(horizon, Math.max(0, day));
    const px = x(selected), py = y(values[selected]);
    marker.setAttribute("visibility", "visible");
    marker.firstElementChild.setAttribute("d", "M" + px + " " + upper + "V" + lower);
    marker.lastElementChild.setAttribute("cx", px);
    marker.lastElementChild.setAttribute("cy", py);
    tip.hidden = false;
    tip.textContent = "Day " + selected + " · " + num.format(values[selected]) + " " + unit;
    tip.style.left = Math.max(tip.offsetWidth / 2, Math.min(width - tip.offsetWidth / 2, px)) + "px";
    tip.style.top = Math.max(22, py - 8) + "px";
    if (speak) document.getElementById("announce").textContent = tip.textContent;
  }
  function clear() { marker.setAttribute("visibility", "hidden"); tip.hidden = true; }
  el.onpointermove = e => show(Math.round((e.clientX - el.getBoundingClientRect().left - left) / (right - left) * horizon), false);
  el.onpointerleave = clear;
  el.onfocus = () => show(0, true);
  el.onblur = clear;
  el.onkeydown = e => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    show(e.key === "Home" ? 0 : e.key === "End" ? horizon : selected + (e.key === "ArrowLeft" ? -1 : 1), true);
  };
  document.getElementById("legend-unit").textContent = isMoney ? "value" : "energy";
  el.previousElementSibling.lastElementChild.hidden = threshold === null;
}
