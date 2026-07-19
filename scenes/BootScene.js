/**
 * BootScene — Makes drawing functions available globally for PreloadScene.
 * All sprite drawing uses Canvas 2D API.
 */
export class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    create() {
        // Make drawing functions available to PreloadScene
        window.drawTank = drawTank;
        window.drawBullet = drawBullet;
        window.drawZergling = drawZergling;
        window.drawHydra = drawHydra;
        window.drawDrone = drawDrone;
        window.drawRoach = drawRoach;
        window.drawUltra = drawUltra;
        window.drawExplosion = drawExplosion;
    }
}

// ====== TANK DRAWING ======

/**
 * Draw a tank on a 2D canvas context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} color - Hex color (e.g. 0xcc2222)
 * @param {number} w - Frame width
 * @param {number} h - Frame height
 * @param {number} frame - Direction frame (0-11 for 30° increments)
 */
export function drawTank(ctx, color, w, h, frame) {
    const c = '#' + color.toString(16).padStart(6, '0');
    const cx = w / 2;
    const cy = h / 2;

    // 12 direction frames (30° each)
    const angles = [0, Math.PI / 6, Math.PI / 3, Math.PI / 2, (2 * Math.PI) / 3, (5 * Math.PI) / 6,
                    Math.PI, -(5 * Math.PI) / 6, -(2 * Math.PI) / 3, -Math.PI / 3, -Math.PI / 6, 0];
    const angle = frame !== undefined ? angles[frame % 12] : 0;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // Tracks
    ctx.fillStyle = '#222';
    ctx.fillRect(-22, -16, 8, 32);
    ctx.fillRect(14, -16, 8, 32);
    // Track treads
    ctx.fillStyle = '#333';
    for (let i = -14; i <= 14; i += 4) {
        ctx.fillRect(-22, i, 8, 2);
        ctx.fillRect(14, i, 8, 2);
    }

    // Body hull
    ctx.fillStyle = '#111';
    ctx.fillRect(-18, -13, 36, 26);
    ctx.fillStyle = c;
    ctx.fillRect(-16, -11, 32, 22);

    // Hull detail
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-12, -7, 10, 6);
    ctx.fillRect(4, -7, 10, 6);

    // Turret base
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();

    // Turret top
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();

    // Barrel (points right when angle=0)
    ctx.fillStyle = '#444';
    ctx.fillRect(4, -2, 18, 4);
    ctx.fillStyle = '#555';
    ctx.fillRect(18, -3, 4, 6); // muzzle brake

    ctx.restore();
}

// ====== BULLET ======

export function drawBullet(ctx, color, w, h) {
    const c = '#' + color.toString(16).padStart(6, '0');
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2);
    ctx.fill();
    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(w / 2 - 1, h / 2 - 1, 2, 0, Math.PI * 2);
    ctx.fill();
}

// ====== ZERG TYPES ======

export function drawZergling(ctx, w, h, frame) {
    const walk = frame === 1;
    ctx.save();
    ctx.translate(w / 2, h / 2);

    // Legs
    ctx.strokeStyle = '#117711';
    ctx.lineWidth = 2;
    const lo = walk ? 3 : 0;
    const lu = walk ? -1 : 0;
    ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(-8 - lo, -10 + lu); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, 4); ctx.lineTo(-8 - lo, 10 - lu); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, -4); ctx.lineTo(8 + lo, -10 - lu); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(8 + lo, 10 + lu); ctx.stroke();

    // Body
    ctx.fillStyle = '#22aa22';
    ctx.beginPath(); ctx.ellipse(0, 0, 10, 7, 0, 0, Math.PI * 2); ctx.fill();

    // Head
    ctx.fillStyle = '#1a8a1a';
    ctx.beginPath(); ctx.ellipse(8, -1, 5, 4, 0, 0, Math.PI * 2); ctx.fill();

    // Eye
    ctx.fillStyle = '#ff0000';
    ctx.beginPath(); ctx.arc(11, -2, 1.5, 0, Math.PI * 2); ctx.fill();

    // Antennae
    ctx.strokeStyle = '#117711';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(10, -4); ctx.lineTo(14, -8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, 2); ctx.lineTo(14, 6); ctx.stroke();

    ctx.restore();
}

export function drawHydra(ctx, w, h, frame) {
    const flap = frame === 1 ? 3 : 0;
    ctx.save();
    ctx.translate(w / 2, h / 2);

    // Wings
    ctx.strokeStyle = '#9966cc';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(-2, -6); ctx.lineTo(-10, -16 - flap); ctx.lineTo(2, -14 - flap); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2, 6); ctx.lineTo(-10, 16 + flap); ctx.lineTo(2, 14 + flap); ctx.closePath(); ctx.stroke();
    ctx.globalAlpha = 1;

    // Body
    ctx.fillStyle = '#8844aa';
    ctx.beginPath(); ctx.ellipse(0, 0, 13, 8, 0, 0, Math.PI * 2); ctx.fill();

    // Spine pods
    ctx.fillStyle = '#44cc44';
    ctx.beginPath(); ctx.arc(-3, -10, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3, -11, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(9, -10, 3, 0, Math.PI * 2); ctx.fill();

    // Head
    ctx.fillStyle = '#6633aa';
    ctx.beginPath(); ctx.ellipse(12, -4, 6, 5, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff4444';
    ctx.beginPath(); ctx.arc(15, -5, 2, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
}

export function drawDrone(ctx, w, h, frame) {
    const flap = frame === 1 ? 4 : 0;
    ctx.save();
    ctx.translate(w / 2, h / 2);

    // Wings
    ctx.strokeStyle = '#eecc66';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(-8, -16 - flap); ctx.lineTo(4, -14 - flap); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(-8, 16 + flap); ctx.lineTo(4, 14 + flap); ctx.closePath(); ctx.stroke();
    ctx.globalAlpha = 1;

    // Body
    ctx.fillStyle = '#ddaa44';
    ctx.beginPath(); ctx.ellipse(0, 0, 8, 5, 0, 0, Math.PI * 2); ctx.fill();

    // Head
    ctx.fillStyle = '#bb8822';
    ctx.beginPath(); ctx.arc(7, -1, 5, 0, Math.PI * 2); ctx.fill();

    // Eyes
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.ellipse(9, -3, 3, 2, 0, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
}

export function drawRoach(ctx, w, h, frame) {
    const move = frame === 1 ? 2 : 0;
    ctx.save();
    ctx.translate(w / 2, h / 2);

    // Legs
    ctx.strokeStyle = '#553300';
    ctx.lineWidth = 2;
    [-8, 0, 8].forEach((x, i) => {
        const d = i % 2 === 0 ? 1 : -1;
        ctx.beginPath(); ctx.moveTo(x, -8); ctx.lineTo(x - 3 + move, -14 - d * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, 8); ctx.lineTo(x + 3 - move, 14 + d * 2); ctx.stroke();
    });

    // Shell
    ctx.fillStyle = '#885522';
    ctx.beginPath(); ctx.ellipse(0, 0, 14, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#aa7733';
    ctx.beginPath(); ctx.ellipse(-2, -2, 8, 5, 0, 0, Math.PI * 2); ctx.fill();

    // Head
    ctx.fillStyle = '#664411';
    ctx.beginPath(); ctx.arc(12, 0, 6, 0, Math.PI * 2); ctx.fill();

    // Mandibles
    ctx.strokeStyle = '#553300';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(16, -3); ctx.lineTo(20, -6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(16, 3); ctx.lineTo(20, 6); ctx.stroke();

    // Eyes
    ctx.fillStyle = '#ff6600';
    ctx.beginPath(); ctx.arc(14, -2, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(14, 2, 1.5, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
}

export function drawUltra(ctx, w, h, frame) {
    const swing = frame === 1 ? 3 : 0;
    ctx.save();
    ctx.translate(w / 2, h / 2);

    // Arms
    ctx.fillStyle = '#772244';
    ctx.beginPath(); ctx.arc(-14, -12 - swing, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-14, 12 + swing, 7, 0, Math.PI * 2); ctx.fill();

    // Claw lines
    ctx.strokeStyle = '#551133';
    ctx.lineWidth = 2;
    [[-18,-16],[-18,-8],[-18,8],[-18,16]].forEach(([bx, by]) => {
        ctx.beginPath(); ctx.moveTo(bx, by - swing); ctx.lineTo(bx - 4, by + 4 - swing); ctx.stroke();
    });

    // Body
    ctx.fillStyle = '#662244';
    ctx.beginPath(); ctx.ellipse(0, 0, 20, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#883355';
    ctx.beginPath(); ctx.ellipse(-4, -3, 12, 8, 0, 0, Math.PI * 2); ctx.fill();

    // Head
    ctx.fillStyle = '#551133';
    ctx.beginPath(); ctx.arc(16, 0, 8, 0, Math.PI * 2); ctx.fill();

    // Horns
    ctx.strokeStyle = '#440022';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(20, -5); ctx.lineTo(26, -12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(20, 5); ctx.lineTo(26, 12); ctx.stroke();

    // Eyes
    ctx.fillStyle = '#ff2200';
    ctx.beginPath(); ctx.arc(19, -3, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(19, 3, 2, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
}

// ====== EXPLOSION ======

export function drawExplosion(ctx, w, h, frame) {
    const t = frame / 7;
    const radius = 4 + t * 14;
    const alpha = Math.max(0, 1 - t);

    let r, g, b;
    if (t < 0.3) { r = 255; g = 255; b = 200; }
    else if (t < 0.6) { r = 255; g = 120; b = 20; }
    else { r = 150; g = 30; b = 10; }

    ctx.globalAlpha = alpha;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
    ctx.fill();

    if (t < 0.4) {
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 1 - t * 2.5;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, radius * 0.35, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}
