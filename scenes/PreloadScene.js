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
        // Drawing functions are on window (set by BootScene.create)
        const drawTank = window.drawTank;
        const drawBullet = window.drawBullet;
        const drawZergling = window.drawZergling;
        const drawHydra = window.drawHydra;
        const drawDrone = window.drawDrone;
        const drawRoach = window.drawRoach;
        const drawUltra = window.drawUltra;
        const drawExplosion = window.drawExplosion;

        if (!drawTank) return; // Safety check

        // Tanks: 12 direction frames
        this.makeAtlas('tank_p1', 56, 48, 12, (ctx, w, h, f) => drawTank(ctx, 0xcc2222, w, h, f));
        this.makeAtlas('tank_p2', 56, 48, 12, (ctx, w, h, f) => drawTank(ctx, 0x2244cc, w, h, f));

        // Bullets
        this.makeSingle('bullet_red', 10, 10, (ctx, w, h) => drawBullet(ctx, 0xffaa00, w, h));
        this.makeSingle('bullet_blue', 10, 10, (ctx, w, h) => drawBullet(ctx, 0x4488ff, w, h));
        this.makeSingle('bullet_green', 10, 10, (ctx, w, h) => drawBullet(ctx, 0x44ff44, w, h));

        // Zerg (2 frames walk cycle)
        this.makeAtlas('zerg_lings', 32, 28, 2, drawZergling);
        this.makeAtlas('zerg_hydra', 40, 32, 2, drawHydra);
        this.makeAtlas('zerg_drone', 30, 28, 2, drawDrone);
        this.makeAtlas('zerg_roach', 40, 32, 2, drawRoach);
        this.makeAtlas('zerg_ultra', 64, 52, 2, drawUltra);

        // Explosion (8 frames)
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

        // Phaser 3: addCanvas creates a single-frame texture, then we add frame data
        this.textures.addCanvas(key, canvas);
        const texture = this.textures.get(key);
        // Remove the default __BASE frame and add per-sprite frames
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

        const grad = ctx.createLinearGradient(0, 0, 0, 600);
        grad.addColorStop(0, '#0a0a2e');
        grad.addColorStop(1, '#1a1a2e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 800, 600);

        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        for (let x = 0; x < 800; x += 40) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 600); ctx.stroke();
        }
        for (let y = 0; y < 600; y += 40) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(800, y); ctx.stroke();
        }

        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        for (let i = 0; i < 100; i++) {
            ctx.beginPath();
            ctx.arc(Math.random() * 800, Math.random() * 600, Math.random() * 1.5 + 0.3, 0, Math.PI * 2);
            ctx.fill();
        }

        this.textures.addCanvas('bg_starfield', canvas);
    }
}
