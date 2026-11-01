// Montage : chaque scène = zoom lent (effet « Ken Burns »), transitions en fondu, MP4 1080p 30 i/s.
const { execFileSync } = require('child_process');

const FPS = 30;
const T = 0.8; // durée d'une transition (s)
// durée d'affichage de chaque scène (s), dans l'ordre 1 → 13
const DUR = [6, 7, 7, 7, 7, 8, 8, 8, 7, 8, 7, 7, 8];
const TRANS = ['fade', 'slideleft', 'fade', 'smoothleft', 'fade', 'slideleft', 'fade', 'smoothleft', 'fade', 'slideleft', 'fade', 'fade'];

const args = ['-y'];
DUR.forEach((_, i) => args.push('-i', `frames/scene${String(i + 1).padStart(2, '0')}.png`));

const parts = [];
DUR.forEach((d, i) => {
  const n = d * FPS;
  // alterne zoom avant / zoom arrière
  const z = i % 2 === 0 ? `1+0.06*on/${n}` : `1.06-0.06*on/${n}`;
  parts.push(`[${i}:v]scale=3840:2160,zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${n}:s=1920x1080:fps=${FPS},setsar=1,format=yuv420p[v${i}]`);
});

let last = 'v0';
let offset = 0;
for (let i = 1; i < DUR.length; i++) {
  offset += DUR[i - 1] - (i === 1 ? 0 : 0);
  const off = (DUR.slice(0, i).reduce((a, b) => a + b, 0) - i * T).toFixed(2);
  const out = i === DUR.length - 1 ? 'vx' : `x${i}`;
  parts.push(`[${last}][v${i}]xfade=transition=${TRANS[i - 1]}:duration=${T}:offset=${off}[${out}]`);
  last = out;
}
const total = DUR.reduce((a, b) => a + b, 0) - (DUR.length - 1) * T;
parts.push(`[vx]fade=t=in:st=0:d=0.8,fade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2[vout]`);

args.push('-f', 'lavfi', '-t', total.toFixed(2), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
args.push('-filter_complex', parts.join(';'), '-map', '[vout]', '-map', `${DUR.length}:a`,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '96k', '-shortest', '-movflags', '+faststart', 'Khoule-Education-presentation.mp4');

console.log(`Durée totale : ${total.toFixed(1)} s`);
execFileSync('ffmpeg', args, { stdio: 'inherit' });
