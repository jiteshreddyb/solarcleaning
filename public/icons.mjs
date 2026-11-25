const paths = {
  sliders:'<path d="M3 6h7m4 0h7M3 12h12m4 0h2M3 18h3m4 0h11"/><circle cx="12" cy="6" r="2"/><circle cx="17" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
  pin:'<path d="M19.5 10.3c0 5.5-7.5 11-7.5 11s-7.5-5.5-7.5-11a7.5 7.5 0 1 1 15 0Z"/><circle cx="12" cy="10" r="2.4"/>',
  archive:'<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11h14V8m-10 4h6"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 4h2"/>',
  left:'<path d="m14 6-6 6 6 6"/>', right:'<path d="m9 6 6 6-6 6"/>', down:'<path d="m6 9 6 6 6-6"/>',
  'arrow-right':'<path d="M4 12h15m-6-6 6 6-6 6"/>', 'arrow-up-right':'<path d="M6 18 18 6M7 6h11v11"/>',
  radar:'<circle cx="12" cy="12" r="2"/><path d="M12 3a9 9 0 1 0 9 9m-9-5a5 5 0 1 0 5 5m-5 0 8-8"/>',
  aperture:'<path d="M3 8V4h4m10 0h4v4m0 8v4h-4M7 20H3v-4"/><circle cx="12" cy="12" r="3.5"/>',
  'sun-dust':'<circle cx="12" cy="9" r="3.6"/><path d="M12 2v1m-6 0 1 1m-4 5h2m14 0h2m-4-5 1-1M3 16h12m-8 4h14m-3-4h3"/>',
  activity:'<path d="M2 12h5l3-8 4.2 16 3.2-10 1.8 2H22"/>',
  bolt:'<path d="M13.5 2 4 13h7l-.6 9L20 10h-7l.5-8Z"/>',
  wallet:'<path d="M20 8V6a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h15v9a1 1 0 0 1-1 1H6a3 3 0 0 1-3-3V7"/><path d="M21 13h-4a2 2 0 0 0 0 4h4"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  'cloud-rain':'<path d="M5.5 15h-.4a4.1 4.1 0 0 1-.4-8.2 6.3 6.3 0 0 1 12-.8 4.6 4.6 0 0 1 2 8.8M8.6 15.2 7 19m6-3.8-2.2 5.4m6.5-5.4L15.7 19"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/>',
  file:'<path d="M6 3h8l5 5v13H6zM14 3v6h5m-10 4h7m-7 4h5"/>',
  book:'<path d="M12 5v15m0-15Q7 2 3 4v14q5-1 9 2 4-3 9-2V4q-4-2-9 1Z"/>',
  x:'<path d="m6 6 12 12M18 6 6 18"/>', device:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
};

export function svgIcon(name) {
  return '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || "") + "</svg>";
}

export function fillIcons(root = document) {
  root.querySelectorAll("i[data-icon]").forEach(el => { el.innerHTML = svgIcon(el.dataset.icon); });
}
