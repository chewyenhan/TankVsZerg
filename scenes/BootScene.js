/**
 * BootScene — Registers all procedural sprite drawing functions on window.
 *
 * Each sprite is hand-drawn with Canvas 2D API in a detailed pixel-art style.
 * Sizes are chosen to balance detail vs performance at 800×600 game resolution.
 */
export class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    create() {
        window.drawTank = drawTank;
        window.drawBullet = drawBullet;
        window.drawZergling = drawZergling;
        window.drawHydra = drawHydra;
        window.drawDrone = drawDrone;
        window.drawRoach = drawRoach;
        window.drawUltra = drawUltra;
        window.drawExplosion = drawExplosion;

        this.scene.start('PreloadScene');
    }
}

// ═══════════════════════════════════════════════════════════════
//  TANK — 12-direction armored battle tank
//  Frame size: 64×56
// ═══════════════════════════════════════════════════════════════

export function drawTank(ctx, color, w, h, frame) {
    const c = '#' + color.toString(16).padStart(6, '0');
    const cx = w / 2, cy = h / 2;

    // 12 directions (30° each), 0 = facing right
    const angles = [
        0, Math.PI/6, Math.PI/3, Math.PI/2,
        2*Math.PI/3, 5*Math.PI/6, Math.PI,
        -5*Math.PI/6, -2*Math.PI/3, -Math.PI/3, -Math.PI/6, 0
    ];
    const angle = frame !== undefined ? angles[frame % 12] : 0;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // ── Treads (shadow first, then links) ──
    // Tread shadow
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(-26, -18, 8, 36);
    ctx.fillRect(18, -18, 8, 36);

    // Tread outer frame
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    ctx.strokeRect(-26, -18, 8, 36);
    ctx.strokeRect(18, -18, 8, 36);

    // Tread links
    ctx.fillStyle = '#1a1a1a';
    for (let i = -16; i <= 16; i += 3) {
        ctx.fillRect(-25, i, 6, 1.5);
        ctx.fillRect(19, i, 6, 1.5);
    }
    // Tread highlight (top edge catches light)
    ctx.fillStyle = '#333';
    ctx.fillRect(-25, -17, 6, 2);
    ctx.fillRect(19, -17, 6, 2);

    // ── Hull body ──
    // Main hull shadow
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(-22, -15, 44, 30);
    // Main hull
    ctx.fillStyle = c;
    ctx.fillRect(-20, -14, 40, 28);

    // Hull armor plates (darker variant of faction color)
    const darker = darkenColor(color, 0.3);
    ctx.fillStyle = darker;
    ctx.fillRect(-18, -12, 36, 6);    // top plate
    ctx.fillRect(-18, 6, 36, 6);      // bottom plate

    // Panel lines
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-16, -4); ctx.lineTo(16, -4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-16, 4); ctx.lineTo(16, 4); ctx.stroke();

    // Hull rivets
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    [[-14,-12],[0,-12],[14,-12],[-14,12],[0,12],[14,12]].forEach(([rx, ry]) => {
        ctx.beginPath(); ctx.arc(rx, ry, 1.2, 0, Math.PI*2); ctx.fill();
    });

    // Engine grille (rear)
    ctx.fillStyle = '#111';
    ctx.fillRect(-20, -6, 5, 12);
    ctx.fillStyle = '#333';
    for (let i = -4; i <= 4; i += 2) {
        ctx.fillRect(-19, i, 3, 1);
    }

    // ── Turret ──
    // Turret base shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI*2); ctx.fill();
    // Turret ring
    ctx.fillStyle = darker;
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI*2); ctx.fill();
    // Turret top
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI*2); ctx.fill();
    // Turret highlight
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath(); ctx.arc(-1, -2, 3, 0, Math.PI*2); ctx.fill();

    // Turret hatch
    ctx.fillStyle = darker;
    ctx.beginPath(); ctx.arc(-1, 0, 3, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath(); ctx.arc(-2, -1, 1.5, 0, Math.PI*2); ctx.fill();

    // ── Barrel ──
    // Barrel shadow
    ctx.fillStyle = '#111';
    ctx.fillRect(4, -2.5, 22, 5);
    // Barrel
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(6, -2, 20, 4);
    // Barrel highlight (top)
    ctx.fillStyle = '#555';
    ctx.fillRect(6, -2, 20, 1.5);
    // Muzzle brake
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(22, -3.5, 6, 7);
    ctx.fillStyle = '#444';
    ctx.fillRect(22, -2, 6, 1);
    ctx.fillRect(22, 2, 6, 1);
    // Muzzle opening
    ctx.fillStyle = '#111';
    ctx.fillRect(27, -2, 2, 4);

    // ── Front headlight ──
    ctx.fillStyle = '#ffffaa';
    ctx.fillRect(18, -1, 3, 2);
    ctx.fillStyle = 'rgba(255,255,200,0.4)';
    ctx.fillRect(21, -1.5, 4, 3);

    ctx.restore();
}

function darkenColor(color, amount) {
    const r = Math.floor(((color >> 16) & 0xff) * (1 - amount));
    const g = Math.floor(((color >> 8) & 0xff) * (1 - amount));
    const b = Math.floor((color & 0xff) * (1 - amount));
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// ═══════════════════════════════════════════════════════════════
//  BULLET — Glowing energy projectile
//  Frame size: 14×14
// ═══════════════════════════════════════════════════════════════

export function drawBullet(ctx, color, w, h) {
    const c = '#' + color.toString(16).padStart(6, '0');
    const cx = w / 2, cy = h / 2;

    // Outer glow
    const glow = ctx.createRadialGradient(cx, cy, 1, cx, cy, 7);
    glow.addColorStop(0, 'rgba(255,255,255,0.9)');
    glow.addColorStop(0.3, c);
    glow.addColorStop(0.7, 'rgba(255,255,255,0.1)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI*2); ctx.fill();

    // Bright core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI*2); ctx.fill();

    // Inner ring
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI*2); ctx.fill();

    // Speed lines (small dashes behind)
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(cx - 6, cy - 0.5, 3, 1);
    ctx.fillRect(cx - 8, cy + 0.5, 2, 1);
}

// ═══════════════════════════════════════════════════════════════
//  ZERGLING — Fast melee alien (Xenomorph style)
//  Frame size: 40×30, 4 walk frames
// ═══════════════════════════════════════════════════════════════

export function drawZergling(ctx, w, h, frame) {
    const cx = w / 2, cy = h / 2;
    const f = frame % 4;
    const step = Math.sin(f * Math.PI / 2) * 2;

    ctx.save();
    ctx.translate(cx, cy);

    // ── Legs (6 spidery legs) ──
    ctx.strokeStyle = '#880044';
    ctx.lineWidth = 2;
    const legPositions = [
        [-9, -5, -1], [-5, 6, 0], [-1, -6, 1],
        [-9, 7, -1], [-4, -7, 0], [-2, 6, 1]
    ];
    legPositions.forEach(([lx, ly, dir]) => {
        const phase = step * dir;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + (lx > 0 ? 8 : -8) + phase, ly + (ly > 0 ? 6 : -6));
        ctx.stroke();
        // Spiked foot
        ctx.fillStyle = '#660033';
        ctx.beginPath();
        ctx.arc(lx + (lx > 0 ? 8 : -8) + phase, ly + (ly > 0 ? 6 : -6), 2, 0, Math.PI*2);
        ctx.fill();
    });

    // ── Body carapace (dark purple, segmented) ──
    // Shadow
    ctx.fillStyle = '#110011';
    ctx.beginPath(); ctx.ellipse(0, 1, 11, 7, 0, 0, Math.PI*2); ctx.fill();
    // Main body (dark purple)
    const bodyGrad = ctx.createLinearGradient(0, -7, 0, 7);
    bodyGrad.addColorStop(0, '#660066');
    bodyGrad.addColorStop(0.5, '#440044');
    bodyGrad.addColorStop(1, '#220022');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath(); ctx.ellipse(0, 0, 10, 6.5, 0, 0, Math.PI*2); ctx.fill();

    // Carapace ridges (spikes)
    ctx.strokeStyle = '#880088';
    ctx.lineWidth = 1.5;
    for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 3.5, -5.5);
        ctx.lineTo(i * 3.5, 3.5);
        ctx.stroke();
        // Spikes at ends
        if (i % 2 !== 0) {
            ctx.beginPath();
            ctx.moveTo(i * 3.5 - 0.5, -6);
            ctx.lineTo(i * 3.5, -8);
            ctx.lineTo(i * 3.5 + 0.5, -6);
            ctx.fill();
        }
    }
    // Gooey sheen
    ctx.fillStyle = 'rgba(150,50,150,0.3)';
    ctx.beginPath(); ctx.ellipse(-3, -2, 3, 1.5, 0, 0, Math.PI*2); ctx.fill();

    // ── Head (cephalopod style) ──
    ctx.fillStyle = '#550055';
    ctx.beginPath(); ctx.ellipse(9, -1, 5.5, 4.5, -0.3, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#770077';
    ctx.beginPath(); ctx.ellipse(8, -2, 4, 3.5, -0.3, 0, Math.PI*2); ctx.fill();

    // Eyes (glowing purple-red)
    ctx.fillStyle = '#ff0066';
    ctx.beginPath(); ctx.arc(11, -2, 2, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ff3388';
    ctx.beginPath(); ctx.arc(10.5, -3, 0.9, 0, Math.PI*2); ctx.fill();

    // Fangs (long, curved)
    ctx.fillStyle = '#44ff44';
    ctx.beginPath(); ctx.moveTo(14, -3); ctx.quadraticCurveTo(18, -7, 19, -4); ctx.lineTo(15, -2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.quadraticCurveTo(18, -2, 19, 2); ctx.lineTo(15, 2); ctx.closePath(); ctx.fill();

    // ── Antennae (thin, sensory) ──
    ctx.strokeStyle = '#aa00aa';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(10, -5); ctx.quadraticCurveTo(14, -12, 16, -11); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, -3); ctx.quadraticCurveTo(13, -9, 15, -8); ctx.stroke();

    // Claws (bladed)
    ctx.fillStyle = '#440044';
    ctx.beginPath(); ctx.arc(5, -6, 2.2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(5, 6, 2.2, 0, Math.PI*2); ctx.fill();
    // Razor blades
    ctx.strokeStyle = '#880088';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(3, -5); ctx.lineTo(0, -7); ctx.lineTo(-1, -5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, 5); ctx.lineTo(0, 7); ctx.lineTo(-1, 5); ctx.stroke();

    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  HYDRALISK — Ranged spine-shooter (Xenomorph bio-shooter)
//  Frame size: 48×38, 4 fly frames
// ═══════════════════════════════════════════════════════════════

export function drawHydra(ctx, w, h, frame) {
    const cx = w / 2, cy = h / 2;
    const f = frame % 4;
    const flap = Math.sin(f * Math.PI / 2) * 3;

    ctx.save();
    ctx.translate(cx, cy);

    // ── Wings (membrane, translucent purple) ──
    ctx.save();
    ctx.globalAlpha = 0.5;
    // Upper wing
    ctx.fillStyle = '#990099';
    ctx.beginPath();
    ctx.moveTo(-2, -6);
    ctx.quadraticCurveTo(-10, -18 - flap, -2, -20 - flap);
    ctx.quadraticCurveTo(6, -16 - flap, 2, -10);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#770077';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Lower wing
    ctx.fillStyle = '#990099';
    ctx.beginPath();
    ctx.moveTo(-2, 6);
    ctx.quadraticCurveTo(-10, 18 + flap, -2, 20 + flap);
    ctx.quadraticCurveTo(6, 16 + flap, 2, 10);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#770077';
    ctx.stroke();
    ctx.restore();

    // ── Body (elongated, purple-black) ──
    const bodyGrad = ctx.createLinearGradient(0, -9, 0, 9);
    bodyGrad.addColorStop(0, '#880088');
    bodyGrad.addColorStop(0.4, '#550055');
    bodyGrad.addColorStop(1, '#220022');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath(); ctx.ellipse(0, 0, 14, 8, 0, 0, Math.PI*2); ctx.fill();

    // Belly (glowing)
    ctx.fillStyle = 'rgba(255,100,150,0.4)';
    ctx.beginPath(); ctx.ellipse(-1, 2, 6, 3.5, 0, 0, Math.PI*2); ctx.fill();

    // ── Spine crest (sharp spikes along back) ──
    ctx.fillStyle = '#aa00aa';
    [-11, -7, -3, 1, 5, 9].forEach(sx => {
        ctx.beginPath();
        ctx.moveTo(sx, -7);
        ctx.lineTo(sx - 2, -13);
        ctx.lineTo(sx + 2, -13);
        ctx.closePath(); ctx.fill();
    });
    ctx.fillStyle = '#cc00cc';
    [-9, -5, -1, 3, 7].forEach(sx => {
        ctx.beginPath();
        ctx.moveTo(sx, -8);
        ctx.lineTo(sx - 1.5, -12);
        ctx.lineTo(sx + 1.5, -12);
        ctx.closePath(); ctx.fill();
    });

    // ── Head (face-hugger style) ──
    ctx.fillStyle = '#660066';
    ctx.beginPath(); ctx.ellipse(13, -2, 7, 5, 0.4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#770077';
    ctx.beginPath(); ctx.ellipse(12, -2, 5, 3.5, 0.4, 0, Math.PI*2); ctx.fill();

    // Crest/hood (spiky)
    ctx.fillStyle = '#880088';
    ctx.beginPath();
    ctx.moveTo(9, -6);
    ctx.quadraticCurveTo(14, -15, 18, -7);
    ctx.quadraticCurveTo(15, -4, 9, -4);
    ctx.closePath(); ctx.fill();

    // Eyes (bioluminescent purple)
    ctx.fillStyle = '#ff00aa';
    ctx.beginPath(); ctx.ellipse(15, -3, 2.5, 1.8, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(16, -3, 1.2, 1.3, 0, 0, Math.PI*2); ctx.fill();

    // Fangs (purple)
    ctx.fillStyle = '#ff66ff';
    ctx.beginPath(); ctx.moveTo(19, -3); ctx.lineTo(22, -5.5); ctx.lineTo(20, -1); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(19, 1); ctx.lineTo(22, -0.5); ctx.lineTo(20, 3); ctx.closePath(); ctx.fill();

    // ── Tail ──
    ctx.fillStyle = '#550055';
    ctx.beginPath(); ctx.moveTo(-13, -1); ctx.quadraticCurveTo(-18, -3, -20, 0); ctx.quadraticCurveTo(-18, 3, -13, 1); ctx.closePath(); ctx.fill();

    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  DRONE — Flying insect scout (dark moth-like)
//  Frame size: 40×30, 4 fly frames
// ═══════════════════════════════════════════════════════════════

export function drawDrone(ctx, w, h, frame) {
    const cx = w / 2, cy = h / 2;
    const f = frame % 4;
    const flap = Math.sin(f * Math.PI / 2) * 4;

    ctx.save();
    ctx.translate(cx, cy);

    // ── Wings (dark membrane) ──
    ctx.save();
    ctx.globalAlpha = 0.5;
    // Upper wing
    ctx.fillStyle = '#660066';
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.quadraticCurveTo(-10, -16 - flap, -4, -20 - flap);
    ctx.quadraticCurveTo(4, -16 - flap, 2, -8);
    ctx.closePath(); ctx.fill();
    // Lower wing
    ctx.fillStyle = '#660066';
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.quadraticCurveTo(-10, 16 + flap, -4, 20 + flap);
    ctx.quadraticCurveTo(4, 16 + flap, 2, 8);
    ctx.closePath(); ctx.fill();
    // Wing veins
    ctx.strokeStyle = '#440044';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(-6, -18 - flap); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(-6, 18 + flap); ctx.stroke();
    ctx.restore();

    // ── Body (ovipositor) ──
    const bodyGrad = ctx.createLinearGradient(0, -6, 0, 6);
    bodyGrad.addColorStop(0, '#770077');
    bodyGrad.addColorStop(1, '#330033');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath(); ctx.ellipse(0, 0, 7, 5, 0, 0, Math.PI*2); ctx.fill();

    // Stripes
    ctx.fillStyle = '#aa00aa';
    ctx.fillRect(-2, -4, 4, 1);
    ctx.fillRect(-1, 3, 4, 1);

    // ── Head ──
    ctx.fillStyle = '#550055';
    ctx.beginPath(); ctx.arc(7, 0, 5, 0, Math.PI*2); ctx.fill();

    // Compound eyes (glowing red)
    ctx.fillStyle = '#ff0044';
    ctx.beginPath(); ctx.ellipse(9, -2, 3.5, 2.5, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#444444';
    ctx.beginPath(); ctx.ellipse(8.5, -2.5, 1.5, 1, 0, 0, Math.PI*2); ctx.fill();
    // Eye highlight
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(9, -2.8, 0.8, 0, Math.PI*2); ctx.fill();

    // Antennae (thin, dark)
    ctx.strokeStyle = '#880088';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(8, -4); ctx.quadraticCurveTo(12, -7, 14, -6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8, 4); ctx.quadraticCurveTo(12, 7, 14, 6); ctx.stroke();

    // Legs (spiny)
    ctx.strokeStyle = '#440044';
    ctx.lineWidth = 0.8;
    [-3, 0, 3].forEach(lx => {
        ctx.beginPath(); ctx.moveTo(lx, -4); ctx.lineTo(lx - 2, -7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(lx, 4); ctx.lineTo(lx + 2, 7); ctx.stroke();
    });

    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  ROACH — Armored tank beetle (dark biotank)
//  Frame size: 48×38, 4 walk frames
// ═══════════════════════════════════════════════════════════════

export function drawRoach(ctx, w, h, frame) {
    const cx = w / 2, cy = h / 2;
    const f = frame % 4;
    const step = Math.sin(f * Math.PI / 2) * 2;

    ctx.save();
    ctx.translate(cx, cy);

    // ── Legs (6 spiny legs) ──
    ctx.strokeStyle = '#880022';
    ctx.lineWidth = 2;
    const legPositions = [
        [-7, -6, -1], [0, -8, 0], [7, -6, 1],
        [-7, 6, -1], [0, 8, 0], [7, 6, 1]
    ];
    legPositions.forEach(([lx, ly, phaseDir]) => {
        const phase = step * phaseDir;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + (lx > 0 ? 8 : -8) + phase, ly + (ly > 0 ? 6 : -6));
        ctx.stroke();
        // Spiked foot
        ctx.fillStyle = '#660022';
        ctx.beginPath();
        ctx.arc(lx + (lx > 0 ? 8 : -8) + phase, ly + (ly > 0 ? 6 : -6), 2, 0, Math.PI*2);
        ctx.fill();
    });

    // ── Shell / Carapace (dark purple-black) ──
    // Shadow
    ctx.fillStyle = '#110011';
    ctx.beginPath(); ctx.ellipse(0, 1, 15, 10, 0, 0, Math.PI*2); ctx.fill();
    // Main shell
    const shellGrad = ctx.createLinearGradient(0, -10, 0, 10);
    shellGrad.addColorStop(0, '#770077');
    shellGrad.addColorStop(0.4, '#550055');
    shellGrad.addColorStop(1, '#220022');
    ctx.fillStyle = shellGrad;
    ctx.beginPath(); ctx.ellipse(0, 0, 14, 9.5, 0, 0, Math.PI*2); ctx.fill();
    // Inner shell plate
    ctx.fillStyle = '#880088';
    ctx.beginPath(); ctx.ellipse(-1, -3, 7, 5, 0, 0, Math.PI*2); ctx.fill();
    // Shell ridges (spikes)
    ctx.strokeStyle = '#aa00aa';
    ctx.lineWidth = 0.8;
    for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 5, -8);
        ctx.lineTo(i * 5, 4);
        ctx.stroke();
        // Spikes
        if (i !== 0) {
            ctx.beginPath();
            ctx.moveTo(i * 5 - 1, -9);
            ctx.lineTo(i * 5, -11);
            ctx.lineTo(i * 5 + 1, -9);
            ctx.fill();
        }
    }
    // Shell sheen
    ctx.fillStyle = 'rgba(180,100,180,0.2)';
    ctx.beginPath(); ctx.ellipse(-3, -4, 4, 2, 0, 0, Math.PI*2); ctx.fill();

    // ── Head ──
    ctx.fillStyle = '#660066';
    ctx.beginPath(); ctx.arc(13, 0, 7, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#770077';
    ctx.beginPath(); ctx.arc(12, -1, 5, 0, Math.PI*2); ctx.fill();

    // Mandibles (curved, sharp)
    ctx.fillStyle = '#cc00cc';
    ctx.beginPath(); ctx.moveTo(18, -4); ctx.lineTo(23, -7); ctx.lineTo(19, -3); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(18, 4); ctx.lineTo(23, 7); ctx.lineTo(19, 3); ctx.closePath(); ctx.fill();
    // Mandible tips
    ctx.fillStyle = '#ff00ff';
    ctx.beginPath(); ctx.arc(22.5, -6.5, 1.2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(22.5, 6.5, 1.2, 0, Math.PI*2); ctx.fill();

    // Eyes (glowing pink-red)
    ctx.fillStyle = '#ff0088';
    ctx.beginPath(); ctx.arc(16, -3, 2.2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(16, 3, 2.2, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ff88bb';
    ctx.beginPath(); ctx.arc(15.5, -3.5, 0.9, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(15.5, 2.5, 0.9, 0, Math.PI*2); ctx.fill();

    // ── Tail spikes ──
    ctx.fillStyle = '#550055';
    ctx.beginPath(); ctx.moveTo(-13, -2); ctx.lineTo(-17, -5); ctx.lineTo(-14, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-13, 2); ctx.lineTo(-17, 5); ctx.lineTo(-14, 0); ctx.closePath(); ctx.fill();

    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  ULTRALISK — Massive boss zerg (Xenomorph Queen)
//  Frame size: 72×56, 4 stomp frames
// ═══════════════════════════════════════════════════════════════

export function drawUltra(ctx, w, h, frame) {
    const cx = w / 2, cy = h / 2;
    const f = frame % 4;
    const stomp = Math.sin(f * Math.PI / 2) * 3;

    ctx.save();
    ctx.translate(cx, cy);

    // ── Legs (4 massive spiny legs) ──
    ctx.strokeStyle = '#990022';
    ctx.lineWidth = 2.5;
    [[-12,-10,-1],[12,-10,1],[-12,10,-1],[12,10,1]].forEach(([lx, ly, dir]) => {
        const phase = stomp * dir;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + (lx > 0 ? 10 : -10) + phase, ly + (ly > 0 ? 8 : -8));
        ctx.stroke();
        // Spiked foot
        ctx.fillStyle = '#660011';
        ctx.beginPath();
        ctx.arc(lx + (lx > 0 ? 10 : -10) + phase, ly + (ly > 0 ? 8 : -8), 3, 0, Math.PI*2);
        ctx.fill();
    });

    // ── Body (massive segmented carapace) ──
    // Shadow
    ctx.fillStyle = '#110011';
    ctx.beginPath(); ctx.ellipse(0, 2, 22, 15, 0, 0, Math.PI*2); ctx.fill();
    // Main body
    const bodyGrad = ctx.createLinearGradient(0, -15, 0, 15);
    bodyGrad.addColorStop(0, '#880066');
    bodyGrad.addColorStop(0.4, '#660044');
    bodyGrad.addColorStop(1, '#330022');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath(); ctx.ellipse(0, 0, 20, 14, 0, 0, Math.PI*2); ctx.fill();

    // Armor plates (segmented dark purple)
    ctx.fillStyle = '#990099';
    ctx.beginPath(); ctx.ellipse(-6, -4, 10, 7, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#bb00bb';
    ctx.beginPath(); ctx.ellipse(-8, -5, 6, 4, 0, 0, Math.PI*2); ctx.fill();

    // Plate seams
    ctx.strokeStyle = '#440044';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-14, -6); ctx.lineTo(-10, 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6, -10); ctx.lineTo(-2, 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, -11); ctx.lineTo(6, 11); ctx.stroke();

    // Body sheen
    ctx.fillStyle = 'rgba(200,100,200,0.2)';
    ctx.beginPath(); ctx.ellipse(-8, -6, 4, 2.5, 0, 0, Math.PI*2); ctx.fill();

    // ── Tusks / Horns (forward-facing, glowing pink) ──
    ctx.fillStyle = '#ff66aa';
    // Upper tusks
    ctx.beginPath();
    ctx.moveTo(20, -8);
    ctx.quadraticCurveTo(28, -18, 32, -16);
    ctx.quadraticCurveTo(28, -10, 20, -6);
    ctx.closePath(); ctx.fill();
    // Lower tusks
    ctx.beginPath();
    ctx.moveTo(20, 8);
    ctx.quadraticCurveTo(28, 18, 32, 16);
    ctx.quadraticCurveTo(28, 10, 20, 6);
    ctx.closePath(); ctx.fill();
    // Tusk highlight
    ctx.fillStyle = '#ffaaee';
    ctx.beginPath();
    ctx.moveTo(22, -8);
    ctx.quadraticCurveTo(27, -16, 30, -15);
    ctx.quadraticCurveTo(26, -11, 21, -6);
    ctx.closePath(); ctx.fill();

    // ── Head ──
    ctx.fillStyle = '#550055';
    ctx.beginPath(); ctx.arc(17, -1, 9, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#660066';
    ctx.beginPath(); ctx.arc(16, -2, 7, 0, Math.PI*2); ctx.fill();

    // Eyes (fierce glowing pink-red)
    ctx.fillStyle = '#ff0088';
    ctx.beginPath(); ctx.arc(20, -4, 2.8, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(20, 4, 2.8, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ff55aa';
    ctx.beginPath(); ctx.arc(19.5, -5, 1.2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(19.5, 3, 1.2, 0, Math.PI*2); ctx.fill();

    // Jaw
    ctx.fillStyle = '#220022';
    ctx.beginPath(); ctx.ellipse(21, -1, 3, 2, 0, 0, Math.PI*2); ctx.fill();
    // Teeth (white, small)
    ctx.fillStyle = '#ffffff';
    [-4, -1, 2].forEach(dy => {
        ctx.beginPath(); ctx.moveTo(23, -1 + dy); ctx.lineTo(25, -2 + dy); ctx.lineTo(23, 1 + dy); ctx.closePath(); ctx.fill();
    });

    // ── Arms/Claws (side) ──
    ctx.fillStyle = '#770066';
    ctx.beginPath(); ctx.arc(-16, -12 - stomp*0.5, 7, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(-16, 12 + stomp*0.5, 7, 0, Math.PI*2); ctx.fill();
    // Claw details
    ctx.strokeStyle = '#440044';
    ctx.lineWidth = 1.5;
    [[-20,-16],[-16,-12],[-12,-16],[-20,16],[-16,12],[-12,16]].forEach(([cx2, cy2]) => {
        const offset = cy2 > 0 ? stomp*0.5 : -stomp*0.5;
        ctx.beginPath();
        ctx.moveTo(cx2, cy2 + offset);
        ctx.lineTo(cx2 - 2, cy2 + 4 + offset);
        ctx.stroke();
    });

    // ── Tail club ──
    ctx.fillStyle = '#660044';
    ctx.beginPath(); ctx.moveTo(-19, -3); ctx.lineTo(-26, -1); ctx.lineTo(-19, 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#880066';
    ctx.beginPath(); ctx.arc(-27, -1, 4, 0, Math.PI*2); ctx.fill();
    // Tail spikes
    ctx.fillStyle = '#aa00aa';
    ctx.beginPath(); ctx.moveTo(-28, -4); ctx.lineTo(-32, -6); ctx.lineTo(-27, -1); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-28, 2); ctx.lineTo(-32, 4); ctx.lineTo(-27, 1); ctx.closePath(); ctx.fill();

    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  EXPLOSION — 8-frame animated particle burst
//  Frame size: 32×32
// ═══════════════════════════════════════════════════════════════

export function drawExplosion(ctx, w, h, frame) {
    const cx = w / 2, cy = h / 2;
    const t = frame / 7;  // 0 → 1 over 8 frames
    const alpha = Math.max(0, 1 - t * 0.9);

    ctx.save();
    ctx.globalAlpha = alpha;

    // Color transitions: white → yellow → orange → red → dark
    let r, g, b;
    if (t < 0.15)      { r = 255; g = 255; b = 240; }  // bright white
    else if (t < 0.35) { r = 255; g = 220; b = 60; }   // yellow
    else if (t < 0.55) { r = 255; g = 140; b = 20; }   // orange
    else if (t < 0.75) { r = 220; g = 50; b = 10; }    // red-orange
    else               { r = 100; g = 20; b = 5; }      // dark embers

    // Main fireball
    const radius = 3 + t * 14;
    const grad = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
    grad.addColorStop(0, `rgb(${r},${g},${b})`);
    grad.addColorStop(0.5, `rgba(${r},${Math.floor(g*0.6)},${Math.floor(b*0.3)},0.7)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();

    // Bright core (early frames)
    if (t < 0.3) {
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 1 - t * 3;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.25, 0, Math.PI * 2);
        ctx.fill();
    }

    // Debris particles
    if (t > 0.15 && t < 0.8) {
        ctx.fillStyle = `rgb(${r},${Math.floor(g*0.7)},${Math.floor(b*0.5)})`;
        for (let i = 0; i < 8; i++) {
            const da = (i / 8) * Math.PI * 2 + t * 1.5;
            const dd = radius * (0.6 + (i % 3) * 0.3);
            const dx = cx + Math.cos(da) * dd;
            const dy = cy + Math.sin(da) * dd;
            ctx.fillStyle = i % 2 === 0 ?
                `rgb(${r},${Math.floor(g*0.8)},${Math.floor(b*0.4)})` :
                `rgb(${Math.floor(r*0.7)},${Math.floor(g*0.5)},0)`;
            ctx.beginPath();
            ctx.arc(dx, dy, 1 + t * 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Smoke ring (late frames)
    if (t > 0.4) {
        ctx.strokeStyle = `rgba(60,50,50,${Math.max(0, 1 - (t-0.4)*2)})`;
        ctx.lineWidth = 2 + t * 3;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 1.2, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.restore();
}
