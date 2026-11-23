// Generates PWA / Apple touch icons from the brand mark with @napi-rs/canvas (run once).
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';

function icon(size, padFrac = 0) {
  const c = createCanvas(size, size);
  const g = c.getContext('2d');
  g.fillStyle = '#090909';
  g.fillRect(0, 0, size, size);
  const s = size * (1 - padFrac * 2);
  const o = size * padFrac;
  const cx = o + s / 2,
    cy = o + s / 2,
    r = s * 0.31;
  g.lineWidth = s * 0.045;
  g.strokeStyle = '#8E7037';
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = '#E5CC91';
  g.lineCap = 'round';
  g.beginPath();
  g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 0.85);
  g.stroke();
  g.fillStyle = '#C5A15A';
  const w = s * 0.09,
    h = s * 0.31;
  g.beginPath();
  g.roundRect(cx - w / 2, cy - h / 2, w, h, w / 2);
  g.fill();
  return c.toBuffer('image/png');
}
writeFileSync('public/pwa-192.png', icon(192, 0.08));
writeFileSync('public/pwa-512.png', icon(512, 0.12));
writeFileSync('public/apple-touch-icon.png', icon(180, 0.08));
console.log('icons written');
