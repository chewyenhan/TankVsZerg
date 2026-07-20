/**
 * PreloadScene — Loads PNG sprites with canvas fallback for Zerg.
 *
 * Hybrid approach:
 * - Tanks, bullets, explosions: load from real PNG files (assets/sprites/)
 * - Zerg: canvas-generated textures (no free PNG alternatives)
 * - Background: canvas-generated starfield
 */
export class PreloadScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PreloadScene' });
    }

    preload() {
        const cam = this.cameras.main;
        const cx = cam.centerX;
        const cy = cam.centerY;

        // Progress bar
        const box = this.add.graphics();
        box.fillStyle(0x222222, 0.8);
        box.fillRect(cx - 120, cy - 15, 240, 30);
        const fill = this.add.graphics();

        this.load.on('progress', (value) => {
            fill.clear();
            fill.fillStyle(0xc9a44c, 1);
            fill.fillRect(cx - 118, cy - 13, 236 * value, 26);
        });

        // ── Load PNG sprites ──
        // Tanks (12-frame spritesheet strips)
        this.load.spritesheet('tank_p1', 'assets/sprites/tank_p1.png', { frameWidth: 64, frameHeight: 56 });
        this.load.spritesheet('tank_p2', 'assets/sprites/tank_p2.png', { frameWidth: 64, frameHeight: 56 });

        // Bullets
        this.load.image('bullet_red', 'assets/sprites/bullet_red.png');
        this.load.image('bullet_blue', 'assets/sprites/bullet_blue.png');
        this.load.image('bullet_green', 'assets/sprites/bullet_green.png');

        // Explosion spritesheet (5 frames, 64x64 each)
        this.load.spritesheet('explosion', 'assets/sprites/explosion.png', { frameWidth: 64, frameHeight: 64 });

        // ── Fallback: if PNGs fail, generate textures at runtime ──
        this.load.on('loaderror', (file) => {
            console.warn('[Preload] Failed to load:', file.key, '— will generate at runtime');
        });

        // Start after a short delay (let load attempt complete)
        this.time.delayedCall(600, () => {
            box.destroy();
            fill.destroy();
            console.log('[Preload] Starting ensureTextures...');
            this.ensureTextures();
            console.log('[Preload] ensureTextures completed, starting MenuScene...');
            this.scene.start('MenuScene');
        });
    }

    /**
     * Ensure all required textures exist. Generate canvas fallbacks for any missing.
     */
    ensureTextures() {
        console.log('[Preload] ensureTextures called');

        // Check and generate Zerg textures (always canvas-generated)
        if (!this.textures.exists('zerg_lings')) {
            try {
                this.generateZergTextures();
            } catch (e) {
                console.error('[Preload] Error in generateZergTextures:', e);
            }
        }

        // Check tanks — generate if load failed
        if (!this.textures.exists('tank_p1')) {
            console.log('[Preload] Generating tank textures (PNG load failed)');
            try {
                this.generateTexture('tank_p1', 64, 56, 1, (ctx, w, h, f) => window.drawTank(ctx, 0xcc2222, w, h, f));
                this.generateTexture('tank_p2', 64, 56, 1, (ctx, w, h, f) => window.drawTank(ctx, 0x2244cc, w, h, f));
            } catch (e) {
                console.error('[Preload] Error generating tanks:', e);
            }
        }

        // Check bullets
        if (!this.textures.exists('bullet_red')) {
            try {
                this.generateTexture('bullet_red', 14, 14, 1, (ctx, w, h, f) => window.drawBullet(ctx, 0xff6644, w, h));
                this.generateTexture('bullet_blue', 14, 14, 1, (ctx, w, h, f) => window.drawBullet(ctx, 0x4488ff, w, h));
                this.generateTexture('bullet_green', 14, 14, 1, (ctx, w, h, f) => window.drawBullet(ctx, 0x44ff44, w, h));
            } catch (e) {
                console.error('[Preload] Error generating bullets:', e);
            }
        }

        // Check explosion
        if (!this.textures.exists('explosion')) {
            try {
                this.generateTexture('explosion', 32, 32, 8, window.drawExplosion);
            } catch (e) {
                console.error('[Preload] Error generating explosion:', e);
            }
        }

        // Background (always canvas)
        try {
            this.makeBackground();
        } catch (e) {
            console.error('[Preload] Error generating background:', e);
        }
    }

    generateZergTextures() {
        const drawZergling = window.drawZergling;
        const drawHydra = window.drawHydra;
        const drawDrone = window.drawDrone;
        const drawRoach = window.drawRoach;
        const drawUltra = window.drawUltra;

        console.log('[Preload] Drawing functions:', {
            drawZergling: !!drawZergling,
            drawHydra: !!drawHydra,
            drawDrone: !!drawDrone,
            drawRoach: !!drawRoach,
            drawUltra: !!drawUltra
        });

        if (!drawZergling) {
            console.error('[Preload] drawZergling function not found on window!');
            return;
        }

        try {
            console.log('[Preload] Generating zerg textures (single frame)...');
            // Generate single-frame versions (no animations for now)
            this.generateTexture('zerg_lings', 40, 30, 1, drawZergling);
            this.generateTexture('zerg_hydra', 48, 38, 1, drawHydra);
            this.generateTexture('zerg_drone', 40, 30, 1, drawDrone);
            this.generateTexture('zerg_roach', 48, 38, 1, drawRoach);
            this.generateTexture('zerg_ultra', 72, 56, 1, drawUltra);
            console.log('[Preload] Zerg textures generated successfully');
        } catch (e) {
            console.error('[Preload] Error generating zerg textures:', e);
        }
    }

    generateTexture(key, fw, fh, frames, drawFn) {
        if (frames > 1) {
            this.makeAtlas(key, fw, fh, frames, drawFn);
        } else {
            const canvas = document.createElement('canvas');
            canvas.width = fw;
            canvas.height = fh;
            const ctx = canvas.getContext('2d');

            // NO background fill - keep textures transparent
            drawFn(ctx, fw, fh, 0);
            this.textures.addCanvas(key, canvas);
        }
    }

    makeAtlas(key, fw, fh, frames, drawFn) {
        console.log(`[Preload] makeAtlas: ${key}, frames: ${frames}`);

        const canvas = document.createElement('canvas');
        canvas.width = fw * frames;
        canvas.height = fh;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        for (let f = 0; f < frames; f++) {
            try {
                ctx.save();
                ctx.translate(f * fw + fw / 2, fh / 2);
                drawFn(ctx, fw, fh, f);
                ctx.restore();
            } catch (e) {
                console.error(`[Preload] Error drawing frame ${f} for ${key}:`, e);
            }
        }

        try {
            this.textures.addCanvas(key, canvas);
            const texture = this.textures.get(key);
            if (texture.has('__BASE')) texture.remove('__BASE');
            for (let i = 0; i < frames; i++) {
                texture.add(String(i), 0, i * fw, 0, fw, fh);
            }
            console.log(`[Preload] Atlas ${key} created successfully`);
        } catch (e) {
            console.error(`[Preload] Error creating atlas ${key}:`, e);
            throw e;
        }
    }

    makeBackground() {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');

        const grad = ctx.createLinearGradient(0, 0, 0, 600);
        grad.addColorStop(0, '#050520');
        grad.addColorStop(0.5, '#0a0a2e');
        grad.addColorStop(1, '#0d0d1a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 800, 600);

        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;
        for (let x = 0; x < 800; x += 40) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 600); ctx.stroke();
        }
        for (let y = 0; y < 600; y += 40) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(800, y); ctx.stroke();
        }

        // Stars with color variation
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

            if (brightness > 0.85) {
                ctx.strokeStyle = starColor;
                ctx.lineWidth = 0.3;
                ctx.beginPath(); ctx.moveTo(sx - sr*2, sy); ctx.lineTo(sx + sr*2, sy); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(sx, sy - sr*2); ctx.lineTo(sx, sy + sr*2); ctx.stroke();
            }
        }

        // Nebula
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
