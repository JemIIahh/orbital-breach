// One shared texture atlas for every stencil on the station: section numerals, zone words, airlock signs,
// container ids, hazard stripes and floor chevrons. Everything is drawn with fillRect/fillText only (no paths),
// so it works with the minimal canvas stub used by the CPU tests.
import * as T from 'three';
import { SECTION_COUNT } from './station-zones.js';

export const ATLAS_SIZE = 2048;
const NUMERAL = { cols: 8, w: 256, h: 192 };
const WORD = { y0: 1344, cols: 4, w: 512, h: 128 };
export const ATLAS_WORDS = ['DOCK A', 'DOCK B', 'HYDROPONICS', 'PROMENADE', 'REACTOR', 'FREIGHT', 'AIRLOCK', 'HAZARD', 'CHEVRON', 'KHI 437', 'KHI-19', 'KHI 204', 'KHI 611', 'KHI 88', 'KHI 999', 'STRIPE'];
export const CONTAINER_IDS = ['KHI 437', 'KHI-19', 'KHI 204', 'KHI 611', 'KHI 88', 'KHI 999'];

// Pixel rectangle of a numeral cell (section 1..55). Top-left origin, like the canvas.
export function numeralRect(section) {
  const index = Math.min(SECTION_COUNT, Math.max(1, section)) - 1;
  return { x: (index % NUMERAL.cols) * NUMERAL.w, y: Math.floor(index / NUMERAL.cols) * NUMERAL.h, w: NUMERAL.w, h: NUMERAL.h };
}

export function wordRect(key) {
  const index = ATLAS_WORDS.indexOf(key);
  if (index < 0) throw new Error(`unknown atlas word ${key}`);
  const rect = { x: (index % WORD.cols) * WORD.w, y: WORD.y0 + Math.floor(index / WORD.cols) * WORD.h, w: WORD.w, h: WORD.h };
  if (key === 'CHEVRON') rect.w = 128;
  return rect;
}

// UV window for a rect. Canvas textures are flipped, so v runs from the bottom of the image.
export function uvOf(rect) {
  return { u0: rect.x / ATLAS_SIZE, u1: (rect.x + rect.w) / ATLAS_SIZE, v0: 1 - (rect.y + rect.h) / ATLAS_SIZE, v1: 1 - rect.y / ATLAS_SIZE };
}

const FONT = 'Teko, "Arial Narrow", Impact, sans-serif';

function drawNumeral(ctx, section) {
  const { x, y, w, h } = numeralRect(section);
  ctx.fillStyle = '#12161a'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = `600 40px ${FONT}`; ctx.fillText('SECTION', x + w / 2, y + 44, w - 40);
  ctx.font = `700 172px ${FONT}`; ctx.fillText(String(section).padStart(2, '0'), x + w / 2, y + h - 14, w - 24);
}

function drawWord(ctx, key) {
  const { x, y, w, h } = wordRect(key);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  if (key === 'AIRLOCK') {
    ctx.fillStyle = '#eef1ef'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#e8681c'; ctx.fillRect(x, y, 10, h); ctx.fillRect(x + w - 10, y, 10, h);
    ctx.fillStyle = '#2fcf6f'; ctx.font = `600 34px ${FONT}`; ctx.fillText('OUTSIDE', x + w / 2, y + 38, w - 60);
    ctx.fillStyle = '#12161a'; ctx.font = `700 78px ${FONT}`; ctx.fillText('AIRLOCK', x + w / 2, y + h - 12, w - 60);
  } else if (key === 'HAZARD') {
    ctx.fillStyle = '#f0b21c'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#16181a';
    for (let row = 0; row < h; row += 4) for (let start = -h; start < w + h; start += 48) {
      const from = Math.max(0, start + row), to = Math.min(w, start + row + 22);
      if (to > from) ctx.fillRect(x + from, y + row, to - from, 4);
    }
  } else if (key === 'CHEVRON') {
    ctx.fillStyle = '#35d97e';
    for (let row = 0; row < 112; row++) { const width = Math.max(2, Math.round(row * 1.0)); ctx.fillRect(x + 64 - width / 2, y + 8 + row, width, 1); }
  } else if (key === 'STRIPE') {
    ctx.fillStyle = '#e8681c'; ctx.fillRect(x, y + 40, w, 48);
  } else {
    ctx.fillStyle = '#12161a'; ctx.font = `700 ${key.length > 8 ? 104 : 112}px ${FONT}`; ctx.fillText(key, x + w / 2, y + h - 16, w - 24);
  }
}

export function drawAtlas(canvas) {
  const ctx = canvas.getContext('2d');
  for (let section = 1; section <= SECTION_COUNT; section++) drawNumeral(ctx, section);
  for (const key of ATLAS_WORDS) drawWord(ctx, key);
}

export function makeAtlasTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = ATLAS_SIZE;
  drawAtlas(canvas);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 8;
  // Fonts load after the first frame; redraw once so the stencils use Teko instead of the fallback face.
  if (typeof document !== 'undefined' && document.fonts?.load) {
    Promise.all([document.fonts.load('700 100px Teko'), document.fonts.load('600 40px Teko')]).then(() => {
      canvas.getContext('2d').clearRect?.(0, 0, ATLAS_SIZE, ATLAS_SIZE); drawAtlas(canvas); texture.needsUpdate = true;
    }).catch(() => {});
  }
  return texture;
}
