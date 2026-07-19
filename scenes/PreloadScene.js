/**
 * PreloadScene — Generates all procedural textures from Canvas 2D draw functions,
 * then transitions to MenuScene.
 */
export class PreloadScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PreloadScene' });
    }

    preload() {
        const cam = this.cameras.main;
        const cx = cam.centerX;
        const cy = cam.centerY;

        const box = this.add.graphics();
        box.fillStyle(0x222222, 0.8);
        box.fillRect(cx - 120, cy - 15, 240, 30);

        const fill = this.add.graphics();

        this.load.on('progress', (value) => {
            fill.clear();
            fill.fillStyle(0xc9a44c, 1);
            fill.fillRect(cx - 118, cy - 13, 236 * value, 26);
        });

        this.time.delayedCall(400, () => {
            box.destroy();
            fill.destroy();
            this.generateTextures();
            this.scene.start('MenuScene');
        });
    }

    generateTextures() {
        const drawTank = window.drawTank;
        const drawBullet = window.drawBullet;
        const drawZergling = window.drawZergling;
        const drawHydra = window.drawHydra;
        const drawDrone = window.drawDrone;
        const drawRoach = window.drawRoach;
        const drawUltra = window.drawUltra;
        const drawExplosion = window.drawExplosion;

        if (!drawTank) return;

        // Tanks: 12 direction frames (64×56 each)
        this.makeAtlas('tank_p1', 64, 56, 12, (ctx, w, h, f) => drawTank(ctx, 0xcc2222, w, h, f));
        this.makeAtlas('tank_p2', 64, 56, 12, (ctx, w, h, f) => drawTank(ctx, 0x2244cc, w, h, f));

        // Bullets (14×14 glowing orbs)
        this.makeSingle('bullet_red', 14, 14, (ctx, w, h) => drawBullet(ctx, 0xff6644, w, h));
        this.makeSingle('bullet_blue', 14, 14, (ctx, w, h) => drawBullet(ctx, 0x4488ff, w, h));
        this.makeSingle('bullet_green', 14, 14, (ctx, w, h) => drawBullet(ctx, 0x44ff44, w, h));

        // Zerg — 4-frame animations for smoother movement
        this.makeAtlas('zerg_lings', 40, 30, 4, drawZergling);
        this.makeAtlas('zerg_hydra', 48, 38, 4, drawHydra);
        this.makeAtlas('zerg_drone', 40, 30, 4, drawDrone);
        this.makeAtlas('zerg_roach', 48, 38, 4, drawRoach);
        this.makeAtlas('zerg_ultra', 72, 56, 4, drawUltra);

        // Explosion (8 frames, 32×32)
        this.makeAtlas('explosion', 32, 32, 8, drawExplosion);

        // Background
        this.makeBackground();
    }

    makeAtlas(key, fw, fh, frames, drawFn) {
        const canvas = document.createElement('canvas');
        canvas.width = fw * frames;
        canvas.height = fh;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        for (let f = 0; f < frames; f++) {
            ctx.save();
            ctx.translate(f * fw + fw / 2, fh / 2);
            drawFn(ctx, fw, fh, f);
            ctx.restore();
        }

        this.textures.addCanvas(key, canvas);
        const texture = this.textures.get(key);
        if (texture.has('__BASE')) texture.remove('__BASE');
        for (let i = 0; i < frames; i++) {
            texture.add(String(i), 0, i * fw, 0, fw, fh);
        }
    }

    makeSingle(key, w, h, drawFn) {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        drawFn(ctx, w, h);
        this.textures.addCanvas(key, canvas);
    }

    makeBackground() {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');

        // Deep space gradient
        const grad = ctx.createLinearGradient(0, 0, 0, 600);
        grad.addColorStop(0, '#050520');
        grad.addColorStop(0.5, '#0a0a2e');
        grad.addColorStop(1, '#0d0d1a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 800, 600);

        // Grid lines (subtle)
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;
        for (let x = 0; x < 800; x += 40) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 600); ctx.stroke();
        }
        for (let y = 0; y < 600; y += 40) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(800, y); ctx.stroke();
        }

        // Stars (varied brightness + color)
        for (let i = 0; i < 150; i++) {
            const sx = Math.random() * 800;
            const sy = Math.random() * 600;
            const sr = Math.random() * 1.5 + 0.3;
            const brightness = Math.random();
            const hue = Math.random();
            let starColor;
            if (hue < 0.7) starColor = `rgba(255,255,255,${0.3 + brightness * 0.7})`;
            else if (hue < 0.85) starColor = `rgba(200,220,255,${0.3 + brightness * 0.7})`;
            else starColor = `rgba(255,240,200,${0.3 + brightness * 0.7})`;

            ctx.fillStyle = starColor;
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fill();

            // Occasional cross sparkle
            if (brightness > 0.85) {
                ctx.strokeStyle = starColor;
                ctx.lineWidth = 0.3;
                ctx.beginPath(); ctx.moveTo(sx - sr*2, sy); ctx.lineTo(sx + sr*2, sy); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(sx, sy - sr*2); ctx.lineTo(sx, sy + sr*2); ctx.stroke();
            }
        }

        // Nebula blobs
        const drawNebula = (x, y, radius, color) => {
            const ng = ctx.createRadialGradient(x, y, 0, x, y, radius);
            ng.addColorStop(0, color);
            ng.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = ng;
            ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
        };
        drawNebula(120, 100, 120, 'rgba(30,10,60,0.15)');
        drawNebula(650, 450, 160, 'rgba(10,20,50,0.12)');
        drawNebula(400, 300, 200, 'rgba(15,10,30,0.08)');

        this.textures.addCanvas('bg_starfield', canvas);
    }
}
