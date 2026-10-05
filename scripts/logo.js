#!/usr/bin/env node
// Generates src/logo.svg (font embedded, so it renders identically in <img>, in the game and in covers).
// The same mascot gem is reused in-game (lit gems smile) and on the covers.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const font = fs.readFileSync(path.join(ROOT, 'src/fonts/lilita-one.woff2')).toString('base64');

// A gem with a face. Exported so covers.js can draw extra gems in the same style.
function gem(x, y, s, { mood = 'happy', id = 'g' } = {}) {
  const h = s;
  const w = s * 0.86;
  const eye = s * 0.19;
  const face = mood === 'happy'
    ? `<ellipse cx="${x - w * 0.3}" cy="${y - h * 0.02}" rx="${eye * 0.8}" ry="${eye}" fill="#fff"/>
       <ellipse cx="${x + w * 0.3}" cy="${y - h * 0.02}" rx="${eye * 0.8}" ry="${eye}" fill="#fff"/>
       <circle cx="${x - w * 0.27}" cy="${y + h * 0.01}" r="${eye * 0.55}" fill="#14093a"/>
       <circle cx="${x + w * 0.33}" cy="${y + h * 0.01}" r="${eye * 0.55}" fill="#14093a"/>
       <circle cx="${x - w * 0.24}" cy="${y - h * 0.05}" r="${eye * 0.2}" fill="#fff"/>
       <circle cx="${x + w * 0.36}" cy="${y - h * 0.05}" r="${eye * 0.2}" fill="#fff"/>
       <path d="M${x - w * 0.16} ${y + h * 0.2} Q${x + w * 0.03} ${y + h * 0.42} ${x + w * 0.2} ${y + h * 0.2} Z" fill="#14093a"/>
       <ellipse cx="${x - w * 0.5}" cy="${y + h * 0.2}" rx="${eye * 0.7}" ry="${eye * 0.4}" fill="#ff7aa8" opacity=".7"/>
       <ellipse cx="${x + w * 0.52}" cy="${y + h * 0.2}" rx="${eye * 0.7}" ry="${eye * 0.4}" fill="#ff7aa8" opacity=".7"/>`
    : `<path d="M${x - w * 0.42} ${y} q${w * 0.12} ${h * 0.08} ${w * 0.24} 0 M${x + w * 0.18} ${y} q${w * 0.12} ${h * 0.08} ${w * 0.24} 0" stroke="#14093a" stroke-width="${s * 0.05}" fill="none" stroke-linecap="round"/>`;
  return `
  <g>
    <path d="M${x} ${y - h} L${x + w} ${y - h * 0.15} L${x} ${y + h} L${x - w} ${y - h * 0.15} Z" fill="url(#${id}-body)" stroke="#14093a" stroke-width="${s * 0.09}" stroke-linejoin="round"/>
    <path d="M${x} ${y - h} L${x + w} ${y - h * 0.15} L${x} ${y - h * 0.05} Z" fill="#fff" opacity=".45"/>
    <path d="M${x} ${y - h} L${x - w} ${y - h * 0.15} L${x - w * 0.45} ${y - h * 0.12} Z" fill="#fff" opacity=".8"/>
    ${face}
  </g>`;
}

function gemDefs(id) {
  return `<linearGradient id="${id}-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b8fbff"/><stop offset=".5" stop-color="#3fe3f5"/><stop offset="1" stop-color="#1c8fd6"/>
    </linearGradient>`;
}

function logo() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -4 548 312" width="548" height="312">
  <defs>
    <style>@font-face{font-family:"Lilita One";src:url(data:font/woff2;base64,${font}) format("woff2");}</style>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5"/></filter>
    <linearGradient id="beam-word" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d9dcff"/>
    </linearGradient>
    <linearGradient id="line-word" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ff6aa6"/><stop offset="1" stop-color="#ff2d6f"/>
    </linearGradient>
    <linearGradient id="ribbon" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe680"/><stop offset="1" stop-color="#ffb938"/>
    </linearGradient>
    ${gemDefs('mascot')}${gemDefs('small')}
  </defs>

  <!-- beam: emitter on the left, across the top, off a mirror, down behind the title -->
  <g stroke-linecap="round" stroke-linejoin="round" fill="none">
    <polyline points="34,46 470,46 470,300" stroke="#ff3d7f" stroke-width="22" opacity=".55" filter="url(#glow)"/>
    <polyline points="34,46 470,46 470,300" stroke="#ff7aa8" stroke-width="10"/>
    <polyline points="34,46 470,46 470,300" stroke="#fff" stroke-width="4"/>
  </g>
  <rect x="6" y="30" width="34" height="32" rx="8" fill="#2a1d5e" stroke="#14093a" stroke-width="4"/>
  <circle cx="34" cy="46" r="7" fill="#fff"/>
  <line x1="448" y1="24" x2="492" y2="68" stroke="#14093a" stroke-width="16" stroke-linecap="round"/>
  <line x1="448" y1="24" x2="492" y2="68" stroke="#ffe680" stroke-width="9" stroke-linecap="round"/>
  ${gem(250, 46, 22, { id: 'small' })}

  <!-- title: dark extrusion, thick outline, bright faces -->
  <g font-family="Lilita One, Impact, sans-serif" font-size="118" text-anchor="middle" stroke-linejoin="round">
    <text x="260" y="196" textLength="470" lengthAdjust="spacingAndGlyphs" fill="#14093a" stroke="#14093a" stroke-width="22">BEAMLINE</text>
    <text x="260" y="186" textLength="470" lengthAdjust="spacingAndGlyphs" fill="#14093a" stroke="#14093a" stroke-width="16">BEAMLINE</text>
    <text x="260" y="186" textLength="470" lengthAdjust="spacingAndGlyphs"><tspan fill="url(#beam-word)">BEAM</tspan><tspan fill="url(#line-word)">LINE</tspan></text>
  </g>

  <!-- genre ribbon -->
  <g transform="rotate(-3 220 248)">
    <rect x="96" y="222" width="250" height="50" rx="25" fill="#14093a"/>
    <rect x="100" y="218" width="250" height="48" rx="24" fill="url(#ribbon)" stroke="#14093a" stroke-width="5"/>
    <text x="225" y="253" font-family="Lilita One, Impact, sans-serif" font-size="30" fill="#14093a" text-anchor="middle" letter-spacing="2">LASER PUZZLE</text>
  </g>

  <!-- mascot: the gem the beam is lighting up -->
  <circle cx="466" cy="236" r="50" fill="#5ef2ff" opacity=".5" filter="url(#glow)"/>
  ${gem(466, 236, 52, { id: "mascot" })}
  <g fill="#fff">
    <path d="M396 200 l3 9 9 3 -9 3 -3 9 -3 -9 -9 -3 9 -3z"/>
    <path d="M506 200 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z"/>
  </g>
</svg>
`;
}

// Square app icon: the mascot gem in a laser frame.
function icon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <radialGradient id="bg" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="#5a24c9"/><stop offset="1" stop-color="#1a0b45"/></radialGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
    ${gemDefs('icon')}
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#bg)"/>
  <polyline points="0,30 98,30 98,128" fill="none" stroke="#ff3d7f" stroke-width="12" opacity=".6" filter="url(#glow)"/>
  <polyline points="0,30 98,30 98,128" fill="none" stroke="#fff" stroke-width="4"/>
  <line x1="86" y1="18" x2="110" y2="42" stroke="#ffe680" stroke-width="7" stroke-linecap="round"/>
  <circle cx="62" cy="76" r="34" fill="#5ef2ff" opacity=".35" filter="url(#glow)"/>
  ${gem(62, 76, 38, { id: 'icon' })}
</svg>
`;
}

if (require.main === module) {
  fs.writeFileSync(path.join(ROOT, 'src/logo.svg'), logo());
  fs.writeFileSync(path.join(ROOT, 'src/icon.svg'), icon());
  console.log('wrote src/logo.svg, src/icon.svg');
}
module.exports = { gem, gemDefs, logo, icon };
