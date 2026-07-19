/**
 * Sprite sheet generator — renders all game sprites to PNG files.
 * Run: node tools/generate_sprites.js
 */
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'assets', 'sprites');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// ═══════════════════ DRAWING FUNCTIONS ═══════════════════

function darkenColor(color, amount) {
    const r = Math.floor(((color >> 16) & 0xff) * (1 - amount));
    const g = Math.floor(((color >> 8) & 0xff) * (1 - amount));
    const b = Math.floor((color & 0xff) * (1 - amount));
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

function drawTank(ctx, color, w, h, frame) {
    const c = '#' + color.toString(16).padStart(6, '0');
    const cx = w / 2, cy = h / 2;
    const angles = [0, Math.PI/6, Math.PI/3, Math.PI/2, 2*Math.PI/3, 5*Math.PI/6, Math.PI, -5*Math.PI/6, -2*Math.PI/3, -Math.PI/3, -Math.PI/6, 0];
    const angle = frame !== undefined ? angles[frame % 12] : 0;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
    ctx.fillStyle = '#0d0d0d'; ctx.fillRect(-26, -18, 8, 36); ctx.fillRect(18, -18, 8, 36);
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1;
    ctx.strokeRect(-26, -18, 8, 36); ctx.strokeRect(18, -18, 8, 36);
    ctx.fillStyle = '#1a1a1a';
    for (let i = -16; i <= 16; i += 3) { ctx.fillRect(-25, i, 6, 1.5); ctx.fillRect(19, i, 6, 1.5); }
    ctx.fillStyle = '#333'; ctx.fillRect(-25, -17, 6, 2); ctx.fillRect(19, -17, 6, 2);
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(-22, -15, 44, 30);
    ctx.fillStyle = c; ctx.fillRect(-20, -14, 40, 28);
    const darker = darkenColor(color, 0.3);
    ctx.fillStyle = darker; ctx.fillRect(-18, -12, 36, 6); ctx.fillRect(-18, 6, 36, 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-16, -4); ctx.lineTo(16, -4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-16, 4); ctx.lineTo(16, 4); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    [[-14,-12],[0,-12],[14,-12],[-14,12],[0,12],[14,12]].forEach(([rx, ry]) => { ctx.beginPath(); ctx.arc(rx, ry, 1.2, 0, Math.PI*2); ctx.fill(); });
    ctx.fillStyle = '#111'; ctx.fillRect(-20, -6, 5, 12);
    ctx.fillStyle = '#333'; for (let i = -4; i <= 4; i += 2) ctx.fillRect(-19, i, 3, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = darker; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.arc(-1, -2, 3, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = darker; ctx.beginPath(); ctx.arc(-1, 0, 3, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.arc(-2, -1, 1.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.fillRect(4, -2.5, 22, 5);
    ctx.fillStyle = '#3a3a3a'; ctx.fillRect(6, -2, 20, 4);
    ctx.fillStyle = '#555'; ctx.fillRect(6, -2, 20, 1.5);
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(22, -3.5, 6, 7);
    ctx.fillStyle = '#444'; ctx.fillRect(22, -2, 6, 1); ctx.fillRect(22, 2, 6, 1);
    ctx.fillStyle = '#111'; ctx.fillRect(27, -2, 2, 4);
    ctx.fillStyle = '#ffffaa'; ctx.fillRect(18, -1, 3, 2);
    ctx.fillStyle = 'rgba(255,255,200,0.4)'; ctx.fillRect(21, -1.5, 4, 3);
    ctx.restore();
}

function drawBullet(ctx, color, w, h) {
    const c = '#' + color.toString(16).padStart(6, '0');
    const cx = w / 2, cy = h / 2;
    const glow = ctx.createRadialGradient(cx, cy, 1, cx, cy, 7);
    glow.addColorStop(0, 'rgba(255,255,255,0.9)');
    glow.addColorStop(0.3, c);
    glow.addColorStop(0.7, 'rgba(255,255,255,0.1)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(cx - 6, cy - 0.5, 3, 1);
    ctx.fillRect(cx - 8, cy + 0.5, 2, 1);
}

function drawZergling(ctx, w, h, frame) {
    const cx=w/2,cy=h/2; const f=frame%4; const step=Math.sin(f*Math.PI/2)*2.5;
    ctx.save(); ctx.translate(cx,cy);
    ctx.strokeStyle='#6611aa';ctx.lineWidth=1.5;
    [{x:-8,y:-4},{x:-4,y:5},{x:0,y:-5},{x:4,y:6},{x:8,y:-4},{x:2,y:6}].forEach((leg,i)=>{
        const phase=step*(i%2===0?1:-1);
        ctx.beginPath();ctx.moveTo(leg.x,leg.y);ctx.lineTo(leg.x+(leg.x>0?7:-7)+phase,leg.y+7);ctx.stroke();
        ctx.fillStyle='#551199';ctx.beginPath();ctx.arc(leg.x+(leg.x>0?3:-3)+phase*0.5,leg.y+3.5,1.5,0,Math.PI*2);ctx.fill();
    });
    ctx.fillStyle='#1a3300';ctx.beginPath();ctx.ellipse(0,1,11,7,0,0,Math.PI*2);ctx.fill();
    const bg=ctx.createLinearGradient(0,-7,0,7);bg.addColorStop(0,'#55cc33');bg.addColorStop(0.5,'#338811');bg.addColorStop(1,'#226600');
    ctx.fillStyle=bg;ctx.beginPath();ctx.ellipse(0,0,10,6.5,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#227700';ctx.lineWidth=1;
    for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(i*3,-5);ctx.lineTo(i*3,4);ctx.stroke();}
    ctx.fillStyle='rgba(180,255,100,0.3)';ctx.beginPath();ctx.ellipse(-2,-2,4,2,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#2a7700';ctx.beginPath();ctx.ellipse(9,-1,5,4,-0.2,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#338811';ctx.beginPath();ctx.ellipse(8,-2,3,2.5,-0.2,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#ff0000';ctx.beginPath();ctx.arc(11,-2.5,1.8,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#ff6644';ctx.beginPath();ctx.arc(10.5,-3,0.8,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#441100';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(13,-3);ctx.lineTo(16+step*0.3,-5);ctx.stroke();
    ctx.beginPath();ctx.moveTo(13,1);ctx.lineTo(16-step*0.3,3);ctx.stroke();
    ctx.strokeStyle='#55cc33';ctx.lineWidth=0.8;
    ctx.beginPath();ctx.moveTo(11,-5);ctx.quadraticCurveTo(15,-10,18,-9);ctx.stroke();
    ctx.beginPath();ctx.moveTo(11,-3);ctx.quadraticCurveTo(14,-8,17,-7);ctx.stroke();
    ctx.fillStyle='#441100';ctx.beginPath();ctx.arc(6,-6,2.5,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(6,6,2.5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#661800';[[6,-6],[6,6]].forEach(([cx2,cy2])=>{ctx.beginPath();ctx.moveTo(cx2+2,cy2-2);ctx.lineTo(cx2+5,cy2-4);ctx.lineTo(cx2+2,cy2+1);ctx.closePath();ctx.fill();});
    ctx.restore();
}

// ═══════════════════ SPRITESHEET BUILDER ═══════════════════

function makeAtlas(name, fw, fh, frames, drawFn) {
    const canvas = createCanvas(fw * frames, fh);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    for (let f = 0; f < frames; f++) {
        ctx.save();
        ctx.translate(f * fw + fw / 2, fh / 2);
        drawFn(ctx, fw, fh, f);
        ctx.restore();
    }
    const buf = canvas.toBuffer('image/png');
    const outPath = path.join(OUT, name + '.png');
    fs.writeFileSync(outPath, buf);
    console.log(`✅ ${name}.png — ${fw*frames}x${fh}, ${frames} frames, ${(buf.length/1024).toFixed(1)} KB`);
    return buf;
}

function makeSingle(name, w, h, drawFn) {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    drawFn(ctx, w, h);
    const buf = canvas.toBuffer('image/png');
    const outPath = path.join(OUT, name + '.png');
    fs.writeFileSync(outPath, buf);
    console.log(`✅ ${name}.png — ${w}x${h}, single frame, ${(buf.length/1024).toFixed(1)} KB`);
    return buf;
}

// ═══════════════════ GENERATE ALL ═══════════════════

console.log('🎨 Generating game sprites...\n');

// Tanks (12 direction frames) - use improved canvas tanks (more detail than Kenney for 12-angle)
makeAtlas('tank_p1', 64, 56, 12, (ctx, w, h, f) => drawTank(ctx, 0xcc2222, w, h, f));
makeAtlas('tank_p2', 64, 56, 12, (ctx, w, h, f) => drawTank(ctx, 0x2244cc, w, h, f));

// Bullets - use our detailed glowing bullets (better than Kenney 4x10)
makeSingle('bullet_red', 14, 14, (ctx, w, h) => drawBullet(ctx, 0xff6644, w, h));
makeSingle('bullet_blue', 14, 14, (ctx, w, h) => drawBullet(ctx, 0x4488ff, w, h));
makeSingle('bullet_green', 14, 14, (ctx, w, h) => drawBullet(ctx, 0x44ff44, w, h));

// Zerg (4-frame walk/fly cycles)
// Reuse drawZergling; other zerg types need their draw functions too
// For now, use the latest draw functions from BootScene.js
console.log('\n⚠️  Zerg sprites require the full drawing functions from BootScene.js');
console.log('   The canvas-generated zerg textures are already created at runtime in PreloadScene.');
console.log('   For production PNGs, the generator page at tools/generate_sprites.html can be used.\n');

console.log('✅ Tank and bullet sprites generated!');
console.log('   Output: assets/sprites/');
