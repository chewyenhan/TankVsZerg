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
                // Opaque dark bg so tanks don't appear transparent; brighter colors for visibility
                this.generateTexture('tank_p1', 64, 56, 1, (ctx, w, h, f) => window.drawTank(ctx, 0xdd3333, w, h, f), '#2a2a2a');
                this.generateTexture('tank_p2', 64, 56, 1, (ctx, w, h, f) => window.drawTank(ctx, 0x3366dd, w, h, f), '#2a2a2a');
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
            if (window.drawSpitter) {
                this.generateTexture('zerg_spitter', 52, 42, 1, window.drawSpitter);
            }
            console.log('[Preload] Zerg textures generated successfully');
        } catch (e) {
            console.error('[Preload] Error generating zerg textures:', e);
        }
    }

    generateTexture(key, fw, fh, frames, drawFn, bgColor) {
        if (frames > 1) {
            this.makeAtlas(key, fw, fh, frames, drawFn, bgColor);
        } else {
            const canvas = document.createElement('canvas');
            canvas.width = fw;
            canvas.height = fh;
            const ctx = canvas.getContext('2d');

            // Optional opaque background (prevents transparency issues)
            if (bgColor) {
                ctx.fillStyle = bgColor;
                ctx.fillRect(0, 0, fw, fh);
            }

            drawFn(ctx, fw, fh, 0);
            this.textures.addCanvas(key, canvas);
        }
    }

    makeAtlas(key, fw, fh, frames, drawFn, bgColor) {
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
                if (bgColor) {
                    ctx.fillStyle = bgColor;
                    ctx.fillRect(-fw / 2, -fh / 2, fw, fh);
                }
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
        const W = 800, H = 600;
        const HORIZON = 280; // pixels from top

        // ── Sky gradient (dusty desert sunset) ──
        const skyGrad = ctx.createLinearGradient(0, 0, 0, HORIZON);
        skyGrad.addColorStop(0, '#1a0805');
        skyGrad.addColorStop(0.25, '#35180c');
        skyGrad.addColorStop(0.55, '#6b3a1f');
        skyGrad.addColorStop(0.8, '#b8845c');
        skyGrad.addColorStop(1, '#d4a870');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, W, HORIZON);

        // Sun glow (low on horizon)
        const sunGrad = ctx.createRadialGradient(500, HORIZON - 30, 10, 500, HORIZON - 10, 160);
        sunGrad.addColorStop(0, 'rgba(255, 220, 150, 0.6)');
        sunGrad.addColorStop(0.4, 'rgba(255, 180, 80, 0.25)');
        sunGrad.addColorStop(1, 'rgba(255, 100, 30, 0)');
        ctx.fillStyle = sunGrad;
        ctx.beginPath(); ctx.arc(500, HORIZON - 30, 160, 0, Math.PI * 2); ctx.fill();

        // ── Distant mountains ──
        ctx.fillStyle = '#1e100a';
        ctx.beginPath();
        ctx.moveTo(0, HORIZON);
        for (let x = 0; x <= W; x += 4) {
            const y = HORIZON - 15 + Math.sin(x * 0.006 + 0.5) * 25 + Math.sin(x * 0.018) * 12 + Math.sin(x * 0.04 + 2) * 6;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(W, HORIZON);
        ctx.closePath();
        ctx.fill();

        // Closer hill layer
        ctx.fillStyle = '#2a1808';
        ctx.beginPath();
        ctx.moveTo(0, HORIZON + 15);
        for (let x = 0; x <= W; x += 3) {
            const y = HORIZON + 10 + Math.sin(x * 0.01 + 1.2) * 18 + Math.sin(x * 0.025) * 8;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(W, HORIZON + 15);
        ctx.closePath();
        ctx.fill();

        // ── Ground layer ──
        const groundGrad = ctx.createLinearGradient(0, HORIZON + 30, 0, H);
        groundGrad.addColorStop(0, '#5a3d22');
        groundGrad.addColorStop(0.15, '#4a3020');
        groundGrad.addColorStop(0.5, '#352218');
        groundGrad.addColorStop(1, '#1f140c');
        ctx.fillStyle = groundGrad;
        ctx.fillRect(0, HORIZON + 30, W, H - HORIZON - 30);

        // ── Scattered rocks ──
        for (let i = 0; i < 50; i++) {
            const rx = Math.random() * W;
            const ry = HORIZON + 35 + Math.random() * (H - HORIZON - 40);
            const rr = Math.random() * 3 + 1.5;
            ctx.fillStyle = `rgba(25, 15, 8, ${0.3 + Math.random() * 0.5})`;
            ctx.beginPath();
            ctx.arc(rx, ry, rr, 0, Math.PI * 2);
            ctx.fill();
        }

        // ── Grass tufts near horizon ──
        for (let i = 0; i < 40; i++) {
            const gx = Math.random() * W;
            const gy = HORIZON + 32 + Math.random() * 25;
            const gh = 2 + Math.random() * 3;
            ctx.fillStyle = `rgba(55, 45, 20, ${0.4 + Math.random() * 0.4})`;
            ctx.fillRect(gx, gy - gh, 1.5, gh);
        }

        // ── Tank tracks ──
        for (let i = 0; i < 6; i++) {
            const tx = Math.random() * W;
            const ty = HORIZON + 50 + Math.random() * (H - HORIZON - 100);
            ctx.strokeStyle = 'rgba(15, 8, 4, 0.5)';
            ctx.lineWidth = 3 + Math.random() * 3;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            const endX = tx + 40 + Math.random() * 60;
            const endY = ty + (Math.random() - 0.5) * 15;
            ctx.lineTo(endX, endY);
            ctx.stroke();
            // Parallel second track
            ctx.lineWidth = 3 + Math.random() * 3;
            ctx.beginPath();
            ctx.moveTo(tx, ty + 9 + Math.random() * 3);
            ctx.lineTo(endX, endY + 9 + Math.random() * 3);
            ctx.stroke();
        }

        // ── Crater / scorch marks ──
        for (let i = 0; i < 5; i++) {
            const cx = Math.random() * W;
            const cy = HORIZON + 60 + Math.random() * (H - HORIZON - 120);
            const cr = 15 + Math.random() * 25;
            ctx.fillStyle = `rgba(10, 5, 2, 0.4)`;
            ctx.beginPath();
            ctx.ellipse(cx, cy, cr, cr * 0.6, 0, 0, Math.PI * 2);
            ctx.fill();
            // Scorch ring
            ctx.strokeStyle = `rgba(40, 20, 8, 0.5)`;
            ctx.lineWidth = 2 + Math.random() * 2;
            ctx.beginPath();
            ctx.ellipse(cx, cy, cr + 3, cr * 0.6 + 2, 0, 0, Math.PI * 2);
            ctx.stroke();
        }

        this.textures.addCanvas('bg_starfield', canvas);
    }
}
