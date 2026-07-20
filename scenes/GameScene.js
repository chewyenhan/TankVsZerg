/**
 * GameScene — Main gameplay. Handles tanks, zerg, bullets, waves, collisions, scoring.
 *
 * Player ID convention: 'p1' / 'p2' (string, used everywhere consistently)
 *
 * CRITICAL FIXES:
 * - Explicit body sizes on all physics objects (canvas textures may have 0-size bodies)
 * - Manual distance-based zerg-tank collision as FALLBACK (bypasses Phaser overlap bugs)
 * - Per-zerg hit cooldown (500ms) to prevent instant death from multi-frame overlap
 * - Shared AudioContext (not new per call) + BGM system
 */
export class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
    }

    create(data) {
        console.log('[GameScene] Creating scene...');
        GameData.waveNumber = 0;
        GameData.roundTimer = 180;
        GameData.coopFailed = false;
        GameData.coopRoundsSurvived = 0;

        document.getElementById('hud').style.display = 'block';
        document.getElementById('wave-announce').style.display = 'none';
        document.getElementById('gameover-overlay').style.display = 'none';

        console.log('[GameScene] Scene created successfully');

        if (GameData.displayMode === 'split') {
            this.cameras.main.setViewport(0, 0, 400, 600);
            if (!this.cameras.cameras[1]) this.cameras.add(400, 0, 400, 600);
            this.cameras.cameras[1].setScrollFactor(0);
        }

        this.bg = this.add.tileSprite(400, 300, 800, 600, 'bg_starfield');

        // ── Tanks ──
        this.tank1 = this.createTank(150, 300, 'tank_p1', 'p1');
        this.tank2 = GameData.gameMode === 'single' ? null : this.createTank(650, 300, 'tank_p2', 'p2');

        // ── Bullet pools ──
        this.bulletsP1 = this.physics.add.group({ maxSize: 30, runChildUpdate: true });
        this.bulletsP2 = this.physics.add.group({ maxSize: 30, runChildUpdate: true });

        // ── Zerg group (config REQUIRED for proper physics world registration) ──
        this.zergGroup = this.physics.add.group({ runChildUpdate: false });

        // ── Power-up group ──
        this.powerupGroup = this.physics.add.group({ runChildUpdate: false });
        this.generatePowerupTextures();

        // ── Debug graphics (green = bodies visible) ──
        this.debugGfx = this.add.graphics().setDepth(99);
        this._debugShowBodies = true;  // ENABLED to debug collision issues

        // ── Particles ──
        this.emitter = this.add.particles(0, 0, 'explosion', {
            speed: { min: 50, max: 150 },
            scale: { start: 0.6, end: 0 },
            alpha: { start: 1, end: 0 },
            lifespan: 400,
            emitting: false,
            tint: [0xff4400, 0xffaa00, 0xff2200],
        });

        // ── Collisions (Phaser overlap) ──
        this.setupCollisions();

        // ── Input ──
        this.keys = this.input.keyboard.addKeys({
            p1Up: 'W', p1Down: 'S', p1Left: 'A', p1Right: 'D',
            p1Fire: 'SPACE', p1Burst: 'SHIFT', p1Shield: 'E', p1Nuke: 'Q',
            p2Up: 'UP', p2Down: 'DOWN', p2Left: 'LEFT', p2Right: 'RIGHT',
            p2Fire: 'ENTER', p2Burst: 'RSHIFT', p2Shield: 'I', p2Nuke: 'U',
            escape: 'ESCAPE',
        });

        // ── Timers ──
        this.roundTimerEvent = this.time.addEvent({ delay: 1000, callback: this.onRoundTick, callbackScope: this, loop: true });
        this.waveTimerEvent = this.time.addEvent({ delay: 12000, callback: this.spawnWave, callbackScope: this, loop: true });
        this.shieldRegenEvent = this.time.addEvent({ delay: 1000, callback: this.regenShields, callbackScope: this, loop: true });

        // ── Animations ──
        // Note: Creating animations requires sprite sheets with multiple frames
        // For now, zerg will be static (no animation)
        // this.createAnimIfNeeded('zerg_lings', 'walk_zerg_lings', 6);
        // this.createAnimIfNeeded('zerg_roach', 'walk_zerg_roach', 6);
        // this.createAnimIfNeeded('zerg_hydra', 'fly_zerg_hydra', 4);
        // this.createAnimIfNeeded('zerg_drone', 'fly_zerg_drone', 4);
        // this.createAnimIfNeeded('zerg_ultra', 'stomp_zerg_ultra', 3);
        console.log('[GameScene] Animations disabled (sprite sheets not available)');

        // ── State ──
        this.paused = false;
        this._roundEnding = false;
        this._matchEnding = false;
        this._debugLogged = false;

        // ── Audio setup ──
        this.setupAudio();

        // ── Initial wave ──
        this.time.delayedCall(2000, () => this.spawnWave());

        // ── Start BGM (will be audible after AudioContext is resumed by user gesture) ──
        this.startBGM();

        this.showWaveAnnounce(`ROUND ${GameData.currentRound}`);
        this.updateHUD();
    }

    // ═══════════════════════════════════════════════════
    //  AUDIO SYSTEM
    // ═══════════════════════════════════════════════════

    setupAudio() {
        console.log('[GameScene] Setting up audio...');
        // Use global shared context, or create one
        if (!window.__gameAudioCtx) {
            try {
                window.__gameAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
                console.log('[GameScene] Created AudioContext');
            } catch (_) {
                window.__gameAudioCtx = null;
                console.error('[GameScene] Failed to create AudioContext');
            }
        }
        this.audioCtx = window.__gameAudioCtx;

        // Try to resume (needs user gesture)
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            try {
                this.audioCtx.resume();
                console.log('[GameScene] Resumed AudioContext');
            } catch (e) {
                console.error('[GameScene] Failed to resume AudioContext:', e);
            }
        }

        // Master gain node
        if (!window.__masterGain && this.audioCtx) {
            try {
                window.__masterGain = this.audioCtx.createGain();
                window.__masterGain.gain.value = 0.3;
                window.__masterGain.connect(this.audioCtx.destination);
                console.log('[GameScene] Created master gain node');
            } catch (e) {
                console.error('[GameScene] Failed to create master gain:', e);
            }
        }
        this.masterGain = window.__masterGain;

        // BGM state
        this._bgmPlaying = false;
    }

    startBGM() {
        if (!this.audioCtx || this._bgmPlaying) return;
        this._bgmPlaying = true;

        const ctx = this.audioCtx;
        const master = this.masterGain;

        const scheduleNote = () => {
            if (!this._bgmPlaying || !this.scene.isActive()) return;

            try {
                const now = ctx.currentTime;

                // Bass drum
                const bass = ctx.createOscillator();
                const bassGain = ctx.createGain();
                bass.type = 'sine';
                bass.frequency.value = 55;
                bassGain.gain.setValueAtTime(0.06, now);
                bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                bass.connect(bassGain);
                bassGain.connect(master);
                bass.start(now);
                bass.stop(now + 0.3);

                // Second beat
                const bass2 = ctx.createOscillator();
                const bg2 = ctx.createGain();
                bass2.type = 'sine';
                bass2.frequency.value = 65;
                bg2.gain.setValueAtTime(0.04, now + 0.5);
                bg2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
                bass2.connect(bg2);
                bg2.connect(master);
                bass2.start(now + 0.5);
                bass2.stop(now + 0.8);

                // Schedule next beat
                this._bgmTimer = this.time.delayedCall(1000, scheduleNote);
            } catch (e) {
                console.error('[BGM] Error scheduling note:', e);
                this._bgmPlaying = false;
            }
        };

        try {
            scheduleNote();
        } catch (e) {
            console.error('[BGM] Error starting BGM:', e);
            this._bgmPlaying = false;
        }
    }

    stopBGM() {
        this._bgmPlaying = false;
        if (this._bgmTimer) this._bgmTimer.destroy();
    }

    playSound(type) {
        if (!this.audioCtx || !this.masterGain) return;
        try {
            const ctx = this.audioCtx;
            const master = this.masterGain;
            const t = ctx.currentTime;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(master);

            switch (type) {
                case 'fire_red':
                    osc.type = 'square'; osc.frequency.value = 180;
                    gain.gain.setValueAtTime(0.08, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
                    osc.start(t); osc.stop(t + 0.1);
                    break;
                case 'fire_blue':
                    osc.type = 'square'; osc.frequency.value = 260;
                    gain.gain.setValueAtTime(0.08, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
                    osc.start(t); osc.stop(t + 0.1);
                    break;
                case 'burst':
                    osc.type = 'square'; osc.frequency.value = 130;
                    gain.gain.setValueAtTime(0.06, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
                    osc.start(t); osc.stop(t + 0.15);
                    break;
                case 'shield':
                    osc.type = 'sine'; osc.frequency.value = 800;
                    gain.gain.setValueAtTime(0.04, t);
                    osc.frequency.exponentialRampToValueAtTime(200, t + 0.2);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
                    osc.start(t); osc.stop(t + 0.3);
                    break;
                case 'hit_zerg':
                    osc.type = 'square'; osc.frequency.value = 600;
                    gain.gain.setValueAtTime(0.05, t);
                    osc.frequency.exponentialRampToValueAtTime(100, t + 0.06);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
                    osc.start(t); osc.stop(t + 0.1);
                    break;
                case 'hit_tank':
                    osc.type = 'sawtooth'; osc.frequency.value = 120;
                    gain.gain.setValueAtTime(0.08, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
                    osc.start(t); osc.stop(t + 0.2);
                    break;
                case 'explosion':
                    osc.type = 'sawtooth'; osc.frequency.value = 80;
                    gain.gain.setValueAtTime(0.12, t);
                    osc.frequency.exponentialRampToValueAtTime(20, t + 0.3);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
                    osc.start(t); osc.stop(t + 0.35);
                    break;
                case 'explosion_large':
                    osc.type = 'sawtooth'; osc.frequency.value = 50;
                    gain.gain.setValueAtTime(0.18, t);
                    osc.frequency.exponentialRampToValueAtTime(15, t + 0.5);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
                    osc.start(t); osc.stop(t + 0.55);
                    break;
                case 'wave_start':
                    osc.type = 'triangle'; osc.frequency.value = 330;
                    gain.gain.setValueAtTime(0.06, t);
                    osc.frequency.setValueAtTime(440, t + 0.1);
                    osc.frequency.setValueAtTime(550, t + 0.2);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
                    osc.start(t); osc.stop(t + 0.45);
                    break;
                default:
                    osc.frequency.value = 440;
                    gain.gain.setValueAtTime(0.03, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
                    osc.start(t); osc.stop(t + 0.1);
            }
        } catch (_) { /* audio unavailable */ }
    }

    // ═══════════════════════════════════════════════════
    //  ENTITY CREATION
    // ═══════════════════════════════════════════════════

    createTank(x, y, texture, playerId) {
        const tank = this.physics.add.sprite(x, y, texture);
        tank.setCollideWorldBounds(true);
        tank.setScale(1.2);
        tank.setDepth(10);
        tank.player = playerId;
        tank.hp = 100;
        tank.maxHp = 100;
        tank.shield = 0;
        tank.maxShield = 30;
        tank.invincible = 500;        // 0.5s spawn protection (reduced from 2s)
        tank.damageBoost = 0;         // Power-up stacks (0-3, +5 damage each)
        tank.nukeCharges = 0;         // Stored nukes (max 3)
        tank.alive = true;
        tank.score = 0;
        tank.kills = 0;
        tank.streak = 0;
        tank.maxStreak = 0;

        // EXPLICIT body size — critical for canvas textures
        tank.body.setSize(64, 56);
        tank.body.setOffset(-4, -4);

        tank.hpBar = this.add.graphics().setDepth(11);
        tank.shieldBar = this.add.graphics().setDepth(11);

        return tank;
    }

    setupCollisions() {
        // Bullet ↔ Zerg
        this.physics.add.overlap(this.bulletsP1, this.zergGroup, this.bulletHitZerg, null, this);
        this.physics.add.overlap(this.bulletsP2, this.zergGroup, this.bulletHitZerg, null, this);
        // Zerg ↔ Tank (Phaser overlap — may not fire; manual fallback in update)
        this.physics.add.overlap(this.zergGroup, this.tank1, this.zergHitTank, null, this);
        if (this.tank2) {
            this.physics.add.overlap(this.zergGroup, this.tank2, this.zergHitTank, null, this);
            // Bullet ↔ Enemy tank (only in two-player mode)
            this.physics.add.overlap(this.bulletsP1, this.tank2, this.bulletHitEnemy, null, this);
            this.physics.add.overlap(this.bulletsP2, this.tank1, this.bulletHitEnemy, null, this);
        }
        // Tank collects power-ups
        this.physics.add.overlap(this.tank1, this.powerupGroup, this.collectPowerup, null, this);
        if (this.tank2) {
            this.physics.add.overlap(this.tank2, this.powerupGroup, this.collectPowerup, null, this);
        }
    }

    // ═══════════════════════════════════════════════════
    //  UPDATE LOOP
    // ═══════════════════════════════════════════════════

    update(_time, delta) {
        if (this.paused) return;

        const dt = delta / 1000;
        this.bg.tilePositionX -= 20 * dt;

        this.handleTank(this.tank1, this.keys, 'p1', delta);
        this.handleTank(this.tank2, this.keys, 'p2', delta);

        // ── MANUAL zerg-tank collision fallback ──
        // This is the PRIMARY damage system — bypasses Phaser overlap bugs
        this.manualZergTankCollision(delta);

        this.drawHPBars();
        this.drawDebugBodies();
        this.updateHUD();
        this.cleanupExpiredBullets();

        if (Phaser.Input.Keyboard.JustDown(this.keys.escape)) {
            this.togglePause();
        }

        // ── Death & Round-End Handling ──

        // Tank 1 death
        if (this.tank1.hp <= 0 && this.tank1.alive) {
            this.tank1.alive = false;
            this.onTankDeath(this.tank1, 'p1');
            if (GameData.gameMode === 'single') {
                this.endMatch('single_lose');
                return;
            }
        }

        // Tank 2 death
        if (this.tank2 && this.tank2.hp <= 0 && this.tank2.alive) {
            this.tank2.alive = false;
            this.onTankDeath(this.tank2, 'p2');
        }

        // Two player: both dead → end round immediately
        if (GameData.gameMode === 'twoPlayer') {
            const bothDead = !this.tank1.alive && !this.tank2.alive;
            if (bothDead) {
                GameData.coopFailed = true;  // Mark round as failed
                this.endRound();
            }
        }
    }

    /**
     * MANUAL distance-based collision: zerg ↔ tanks.
     * Bypasses Phaser's physics overlap entirely.
     * Each zerg can damage a tank at most once per 800ms (cooldown).
     */
    manualZergTankCollision(delta) {
        try {
            const now = this.time.now;
            const zergs = this.zergGroup.getChildren();

            for (const zerg of zergs) {
                if (!zerg.active || zerg.hp <= 0) continue;

                const zergDmg = zerg.getData('damage') || 10;
                zerg._hitCooldown = zerg._hitCooldown || {};

                for (const tank of [this.tank1, this.tank2]) {
                    if (!tank || !tank.alive || (tank.invincible || 0) > 0) continue;

                    const key = tank.player; // 'p1' or 'p2'
                    const lastHit = zerg._hitCooldown[key] || 0;
                    if (now - lastHit < 800) continue; // Cooldown per zerg per tank

                    const dist = Phaser.Math.Distance.Between(zerg.x, zerg.y, tank.x, tank.y);
                    const hitRadius = 35; // Combined tank+zerg radius

                    if (dist < hitRadius) {
                        zerg._hitCooldown[key] = now;

                        // Apply damage
                        let remaining = zergDmg;
                        if (tank.shield > 0) {
                            const absorbed = Math.min(tank.shield, remaining);
                            tank.shield -= absorbed;
                            remaining -= absorbed;
                        }
                        if (remaining > 0) {
                            tank.hp -= remaining;
                            tank.hp = Math.max(0, tank.hp);
                        }

                        // Knockback
                        const angle = Phaser.Math.Angle.Between(zerg.x, zerg.y, tank.x, tank.y);
                        tank.setVelocity(Math.cos(angle) * 120, Math.sin(angle) * 120);

                        this.spawnHitEffect(tank.x, tank.y);
                        this.playSound('hit_tank');
                    }
                }
            }
        } catch (e) {
            console.error('[manualZergTankCollision] Error:', e);
        }
    }

    // ═══════════════════════════════════════════════════
    //  TANK HANDLING
    // ═══════════════════════════════════════════════════

    handleTank(tank, keys, player, delta) {
        if (!tank || !tank.alive) return;

        // Initialize auto-aim (default ON for all modes)
        if (tank.autoAim === undefined) tank.autoAim = true;

        // Fire key toggles auto-aim on/off
        const fireKey = player === 'p1' ? keys.p1Fire : keys.p2Fire;
        tank._fireTogglePrev = tank._fireTogglePrev || false;
        if (fireKey.isDown && !tank._fireTogglePrev) {
            tank.autoAim = !tank.autoAim;
            this.showFloatingText(tank.x, tank.y - 30, tank.autoAim ? '🎯 AUTO' : '🔫 MANUAL',
                tank.autoAim ? '#44ff44' : '#ffaa00');
        }
        tank._fireTogglePrev = fireKey.isDown;

        // Route to auto-aim or manual mode
        if (tank.autoAim) {
            this.handleTankAutoAim(tank, keys, delta);
            return;
        }

        // ── Manual mode ──
        const speed = 200;
        let vx = 0, vy = 0;

        try {
            if (player === 'p1') {
                if (keys.p1Left.isDown) vx = -speed;
                else if (keys.p1Right.isDown) vx = speed;
                if (keys.p1Up.isDown) vy = -speed;
                else if (keys.p1Down.isDown) vy = speed;
            } else {
                if (keys.p2Left.isDown) vx = -speed;
                else if (keys.p2Right.isDown) vx = speed;
                if (keys.p2Up.isDown) vy = -speed;
                else if (keys.p2Down.isDown) vy = speed;
            }

            if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }
            tank.setVelocity(vx, vy);

            if (vx !== 0 || vy !== 0) tank.rotation = Math.atan2(vy, vx);
        } catch (e) {
            console.error('[handleTank] Error:', e);
        }

        try {
            tank._fireTimer = Math.max(0, (tank._fireTimer || 0) - delta);
            tank._burstTimer = Math.max(0, (tank._burstTimer || 0) - delta);

            // Main fire (hold to fire in manual mode)
            if (fireKey.isDown && (tank._fireTimer || 0) <= 0) {
                this.fireBullet(tank, player === 'p1' ? this.bulletsP1 : this.bulletsP2, player);
                tank._fireTimer = 500;
                this.playSound(player === 'p1' ? 'fire_red' : 'fire_blue');
            }

            // Burst fire
            const burstKey = player === 'p1' ? keys.p1Burst : keys.p2Burst;
            if (burstKey.isDown && (tank._burstTimer || 0) <= 0 && tank.shield >= 5) {
                this.fireBurst(tank, player);
                tank._burstTimer = 200;
                tank.shield = Math.max(0, tank.shield - 5);
                this.playSound('burst');
            }

            // Shield (manual edge detection — JustDown is unreliable)
            const shieldKey = player === 'p1' ? keys.p1Shield : keys.p2Shield;
            tank._shieldPrevDown = tank._shieldPrevDown || false;
            const shieldDown = shieldKey.isDown;
            const shieldJustPressed = shieldDown && !tank._shieldPrevDown;
            if (shieldJustPressed && tank.shield < tank.maxShield) {
                tank.shield = Math.min(tank.maxShield, tank.shield + 15);
                tank.invincible = Math.max(tank.invincible, 300);
                this.playSound('shield');
                this.cameras.main.flash(200, 100, 200, 255, false);
            }
            tank._shieldPrevDown = shieldDown;

            // Nuke activation (edge detection)
            const nukeKey = player === 'p1' ? keys.p1Nuke : keys.p2Nuke;
            tank._nukePrevDown = tank._nukePrevDown || false;
            const nukeDown = nukeKey.isDown;
            const nukeJustPressed = nukeDown && !tank._nukePrevDown;
            if (nukeJustPressed && (tank.nukeCharges || 0) > 0) {
                this.activateNuke(tank, player);
            }
            tank._nukePrevDown = nukeDown;

            if (tank.invincible > 0) tank.invincible -= delta;
        } catch (e) {
            console.error('[handleTank] Error in control logic:', e);
        }
    }

    handleTankAutoAim(tank, keys, delta) {
        const player = tank.player;
        const speed = 200;
        const AUTO_FIRE_RANGE = 300;
        let vx = 0, vy = 0;

        // Movement for both players
        if (player === 'p1') {
            if (keys.p1Left.isDown) vx = -speed;
            else if (keys.p1Right.isDown) vx = speed;
            if (keys.p1Up.isDown) vy = -speed;
            else if (keys.p1Down.isDown) vy = speed;
        } else {
            if (keys.p2Left.isDown) vx = -speed;
            else if (keys.p2Right.isDown) vx = speed;
            if (keys.p2Up.isDown) vy = -speed;
            else if (keys.p2Down.isDown) vy = speed;
        }

        if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }
        tank.setVelocity(vx, vy);

        // Face nearest zerg
        const target = this.nearestZerg(tank.x, tank.y);
        if (target.zerg) {
            tank.rotation = Phaser.Math.Angle.Between(tank.x, tank.y, target.zerg.x, target.zerg.y);
        } else if (vx !== 0 || vy !== 0) {
            tank.rotation = Math.atan2(vy, vx);
        }

        // Cooldowns
        tank._fireTimer = Math.max(0, (tank._fireTimer || 0) - delta);

        // Auto-fire when zerg in range
        const bulletGroup = player === 'p1' ? this.bulletsP1 : this.bulletsP2;
        if (target.zerg && target.distance <= AUTO_FIRE_RANGE && (tank._fireTimer || 0) <= 0) {
            this.fireBullet(tank, bulletGroup, player);
            tank._fireTimer = 500;
            this.playSound(player === 'p1' ? 'fire_red' : 'fire_blue');
        }

        // Shield — edge detection
        const shieldKey = player === 'p1' ? keys.p1Shield : keys.p2Shield;
        tank._shieldPrevDown = tank._shieldPrevDown || false;
        const shieldDown = shieldKey.isDown;
        if (shieldDown && !tank._shieldPrevDown && tank.shield < (tank.maxShield || 30)) {
            tank.shield = Math.min(tank.maxShield || 30, tank.shield + 15);
            tank.invincible = Math.max(tank.invincible || 0, 300);
            this.playSound('shield');
            this.cameras.main.flash(200, 100, 200, 255, false);
        }
        tank._shieldPrevDown = shieldDown;

        // Nuke — edge detection
        const nukeKey = player === 'p1' ? keys.p1Nuke : keys.p2Nuke;
        tank._nukePrevDown = tank._nukePrevDown || false;
        const nukeDown = nukeKey.isDown;
        if (nukeDown && !tank._nukePrevDown && (tank.nukeCharges || 0) > 0) {
            this.activateNuke(tank, player);
        }
        tank._nukePrevDown = nukeDown;

        if (tank.invincible > 0) tank.invincible -= delta;

        // Draw auto-aim indicator
        if (!tank._autoIndicator) {
            tank._autoIndicator = this.add.text(tank.x, tank.y - 35, '🎯', {
                fontSize: '12px',
            }).setDepth(12).setOrigin(0.5);
        }
        tank._autoIndicator.setPosition(tank.x, tank.y - 35);
        tank._autoIndicator.setAlpha(0.8);
    }

    fireBullet(tank, bulletGroup, player) {
        const tex = player === 'p1' ? 'bullet_red' : 'bullet_blue';
        const bullet = bulletGroup.get(tank.x, tank.y, tex);
        if (!bullet) return;

        const angle = tank.rotation;
        bullet.setData('damage', 15 + (tank.damageBoost || 0) * 5);
        bullet.setData('owner', player);
        bullet.setData('expireAt', this.time.now + 3000);  // time-based expiry (avoids closure bug)
        bullet.setActive(true).setVisible(true);
        bullet.body.enable = true;
        bullet.body.setSize(10, 10);
        bullet.body.setAllowGravity(false);
        bullet.setPosition(tank.x + Math.cos(angle) * 20, tank.y + Math.sin(angle) * 20);
        bullet.setVelocity(400 * Math.cos(angle), 400 * Math.sin(angle));
        bullet.setDepth(5);

        this.cameras.main.shake(50, 0.002);
    }

    fireBurst(tank, player) {
        const bulletGroup = player === 'p1' ? this.bulletsP1 : this.bulletsP2;
        const baseAngle = tank.rotation;
        for (let i = -1; i <= 1; i++) {
            const angle = baseAngle + i * 0.2;
            const tex = player === 'p1' ? 'bullet_red' : 'bullet_blue';
            const bullet = bulletGroup.get(tank.x, tank.y, tex);
            if (!bullet) continue;

            bullet.setData('damage', 8 + Math.floor((tank.damageBoost || 0) * 2.5));
            bullet.setData('owner', player);
            bullet.setData('expireAt', this.time.now + 3000);  // time-based expiry
            bullet.setActive(true).setVisible(true);
            bullet.body.enable = true;
            bullet.body.setSize(10, 10);
            bullet.body.setAllowGravity(false);
            bullet.setPosition(tank.x + Math.cos(angle) * 20, tank.y + Math.sin(angle) * 20);
            bullet.setVelocity(350 * Math.cos(angle), 350 * Math.sin(angle));
            bullet.setDepth(5);
        }
    }

    cleanupExpiredBullets() {
        const now = this.time.now;
        const check = (group) => {
            group.getChildren().forEach(b => {
                if (!b.active) return;
                const expireAt = b.getData('expireAt');
                if (expireAt && now >= expireAt) {
                    b.setActive(false).setVisible(false);
                    b.body.stop();
                }
            });
        };
        check(this.bulletsP1);
        check(this.bulletsP2);
    }

    // ═══════════════════════════════════════════════════
    //  COLLISION HANDLERS (for bullet hits)
    // ═══════════════════════════════════════════════════

    bulletHitZerg(bullet, zerg) {
        console.log('[bulletHitZerg] Bullet hit zerg!', bullet, zerg, zerg.hp);
        if (!bullet.active || !zerg.active || zerg.hp === undefined) {
            console.log('[bulletHitZerg] Skipping - bullet or zerg inactive');
            return;
        }
        const damage = bullet.getData('damage') || 15;
        console.log('[bulletHitZerg] Applying', damage, 'damage to zerg');
        zerg.hp -= damage;
        zerg.setData('lastHitBy', bullet.getData('owner') || 'p1');

        bullet.setActive(false).setVisible(false);
        bullet.body.stop();
        this.spawnHitEffect(zerg.x, zerg.y);
        this.playSound('hit_zerg');
        // Splash damage to nearby zergs
        this.applySplashDamage(zerg.x, zerg.y, damage, bullet.getData('owner') || 'p1', zerg);

        if (zerg.hp <= 0) {
            this.destroyZerg(zerg);
        }
    }

    applySplashDamage(x, y, directDamage, owner, hitZerg) {
        const SPLASH_RADIUS = 80;
        const splashDmg = Math.floor(directDamage * 0.5);
        const zergs = this.zergGroup.getChildren();
        for (const z of zergs) {
            if (!z.active || z.hp <= 0 || z === hitZerg) continue;
            const dist = Phaser.Math.Distance.Between(x, y, z.x, z.y);
            if (dist > SPLASH_RADIUS) continue;
            z.setData('lastHitBy', owner);
            z.hp -= splashDmg;
            this.spawnHitEffect(z.x, z.y); // splash
            if (z.hp <= 0) {
                this.destroyZerg(z);
            }
        }
    }

    bulletHitEnemy(bullet, tank) {
        if (!bullet.active || !tank.alive || tank.hp === undefined) return;
        const owner = bullet.getData('owner');
        if (owner === tank.player) return; // friendly fire guard

        const damage = bullet.getData('damage') || 15;
        let remaining = damage;
        if (tank.shield > 0) {
            const absorbed = Math.min(tank.shield, remaining);
            tank.shield -= absorbed;
            remaining -= absorbed;
        }
        if (remaining > 0 && (tank.invincible || 0) <= 0) {
            tank.hp -= remaining;
            tank.hp = Math.max(0, tank.hp);
            this.cameras.main.shake(100, 0.01);
            this.spawnHitEffect(tank.x, tank.y);
            this.playSound('hit_tank');
        }

        bullet.setActive(false).setVisible(false);
        bullet.body.stop();

        const attacker = owner === 'p1' ? this.tank1 : this.tank2;
        if (attacker && attacker.alive) attacker.score += Math.ceil(damage / 10) * 5;
    }

    /** Phaser overlap callback — kept as secondary, primary is manualZergTankCollision */
    zergHitTank(zerg, tank) {
        if (!tank.alive || tank.hp === undefined) return;
        if ((tank.invincible || 0) > 0) return;

        // Cooldown per zerg per tank
        const now = this.time.now;
        zerg._hitCooldown = zerg._hitCooldown || {};
        const lastHit = zerg._hitCooldown[tank.player] || 0;
        if (now - lastHit < 800) return;
        zerg._hitCooldown[tank.player] = now;

        const damage = zerg.getData('damage') || 10;
        let remaining = damage;
        if (tank.shield > 0) {
            const absorbed = Math.min(tank.shield, remaining);
            tank.shield -= absorbed;
            remaining -= absorbed;
        }
        if (remaining > 0) {
            tank.hp -= remaining;
            tank.hp = Math.max(0, tank.hp);
        }

        const angle = Phaser.Math.Angle.Between(zerg.x, zerg.y, tank.x, tank.y);
        tank.setVelocity(Math.cos(angle) * 120, Math.sin(angle) * 120);
        this.spawnHitEffect(tank.x, tank.y);
        this.playSound('hit_tank');

        if (!this._debugLogged) {
            this._debugLogged = true;
            console.log('⚡ [PHASER OVERLAP] ZERG HIT TANK! zerg:', zerg.texture.key, 'tank:', tank.player, 'HP:', tank.hp);
        }
    }

    destroyZerg(zerg) {
        const points = zerg.getData('points') || 10;
        const killer = zerg.getData('lastHitBy') || 'p1';

        this.spawnExplosion(zerg.x, zerg.y);
        this.playSound('explosion');
        zerg.destroy();

        const attacker = killer === 'p1' ? this.tank1 : this.tank2;
        if (attacker && attacker.alive) {
            attacker.score += points;
            attacker.kills = (attacker.kills || 0) + 1;
            const otherTank = killer === 'p1' ? this.tank2 : this.tank1;
            if (otherTank) otherTank.streak = 0;
            attacker.streak = (attacker.streak || 0) + 1;
            if (attacker.streak > (attacker.maxStreak || 0)) attacker.maxStreak = attacker.streak;
            if (attacker.streak % 10 === 0) attacker.score += 50;
        }

        // 10% chance to drop a power-up
        if (Math.random() < 0.10) {
            this.spawnPowerup(zerg.x, zerg.y);
        }
    }

    onTankDeath(tank, playerId) {
        this.spawnExplosion(tank.x, tank.y);
        tank.setVisible(false);
        if (tank.hpBar) tank.hpBar.destroy();
        if (tank.shieldBar) tank.shieldBar.destroy();
        if (tank._autoIndicator) { tank._autoIndicator.destroy(); tank._autoIndicator = null; }
        this.playSound('explosion_large');
        this.cameras.main.flash(500, 255, 0, 0);
        this.stopBGM();
    }

    spawnExplosion(x, y) {
        this.emitter.explode(8, x, y);
        this.cameras.main.shake(150, 0.02);
    }

    spawnHitEffect(x, y) {
        this.emitter.explode(2, x, y);
    }

    // ═══════════════════════════════════════════════════
    //  WAVE SYSTEM
    // ═══════════════════════════════════════════════════

    spawnWave() {
        GameData.waveNumber++;
        const wave = GameData.waveNumber;
        this.showWaveAnnounce(`WAVE ${wave}`);
        this.playSound('wave_start');

        // Sizes per zerg type (for explicit body sizing)
        const sizeMap = {
            zerg_lings: [40, 30],
            zerg_hydra: [48, 38],
            zerg_drone: [40, 30],
            zerg_roach: [48, 38],
            zerg_ultra: [72, 56],
        };

        const spawn = (tex, count, hp, spd, dmg, pts) => {
            const [fw, fh] = sizeMap[tex] || [40, 30];
            for (let i = 0; i < count; i++) {
                const { x, y } = this.randomEdge();
                const z = this.zergGroup.create(x, y, tex);
                if (!z) continue;
                // Explicit physics world registration (critical for overlap detection)
                this.physics.world.enable(z);
                z.setDepth(8);
                z.hp = hp;
                z.setData('damage', dmg);
                z.setData('points', pts);
                z._hitCooldown = {};
                z._lastHitTime = 0;

                // EXPLICIT body size
                z.body.setSize(fw, fh);
                z.body.enable = true;

                console.log('[spawnWave] Created zerg:', tex, 'at', x, y, 'HP:', hp, 'position:', z.x, z.y);

                const target = this.nearestTank(x, y);
                if (target) {
                    const angle = Phaser.Math.Angle.Between(x, y, target.x, target.y);
                    z.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
                }

                // Animations disabled (no sprite sheets with multiple frames)
                // Zerg will appear as static sprites
                // const animKey = (tex === 'zerg_lings' || tex === 'zerg_roach') ? 'walk_' + tex :
                //                 (tex === 'zerg_hydra' || tex === 'zerg_drone') ? 'fly_' + tex :
                //                 (tex === 'zerg_ultra') ? 'stomp_' + tex : null;
                // if (animKey && this.anims.exists(animKey)) z.play(animKey);

                this.time.addEvent({
                    delay: 2000,
                    callback: () => {
                        if (!z.active || z.hp <= 0) return;
                        const t = this.nearestTank(z.x, z.y);
                        if (t) {
                            const a = Phaser.Math.Angle.Between(z.x, z.y, t.x, t.y);
                            z.setVelocity(Math.cos(a) * spd, Math.sin(a) * spd);
                        }
                    },
                    loop: true,
                });
            }
        };

        // Rebalanced: zerglings 1-shot, others scaled proportionally
        // Format: spawn(type, count, hp, speed, damage, points)
        if (wave === 1) spawn('zerg_lings', 10, 15, 170, 15, 10);
        else if (wave === 2) { spawn('zerg_lings', 10, 15, 170, 15, 10); spawn('zerg_hydra', 6, 30, 100, 12, 20); }
        else if (wave === 3) { spawn('zerg_lings', 10, 15, 170, 15, 10); spawn('zerg_hydra', 6, 30, 100, 12, 20); spawn('zerg_drone', 7, 20, 140, 8, 15); }
        else if (wave % 5 === 0) {
            spawn('zerg_lings', 12, 15, 180, 15, 10);
            spawn('zerg_hydra', 8, 30, 110, 12, 20);
            spawn('zerg_drone', 8, 20, 150, 8, 15);
            spawn('zerg_roach', 6, 60, 80, 25, 30);
            spawn('zerg_ultra', 2, 120, 55, 40, 100);
        } else if (wave <= 5) {
            spawn('zerg_lings', 10, 15, 170, 15, 10);
            spawn('zerg_hydra', 6, 30, 100, 12, 20);
            spawn('zerg_drone', 7, 20, 140, 8, 15);
            spawn('zerg_roach', Math.floor(wave / 2) + 3, 60, 75, 25, 30);
        } else {
            const scale = Math.floor((wave - 5) / 2) + 1;
            spawn('zerg_lings', 10 + scale, 15, 180, 15, 10);
            spawn('zerg_hydra', 6 + scale, 30, 110, 12, 20);
            spawn('zerg_drone', 7 + scale, 20, 150, 8, 15);
            spawn('zerg_roach', Math.min(scale * 3, 15), 60, 80, 25, 30);
            if (wave % 3 === 0) spawn('zerg_ultra', 1 + Math.floor(scale / 2), 120, 55, 40, 100);
        }

        GameData.p1Score += 25;
        GameData.p2Score += 25;
    }

    randomEdge() {
        const side = Phaser.Math.Between(0, 3);
        switch (side) {
            case 0: return { x: Phaser.Math.Between(0, 800), y: -30 };
            case 1: return { x: 830, y: Phaser.Math.Between(0, 600) };
            case 2: return { x: Phaser.Math.Between(0, 800), y: 630 };
            default: return { x: -30, y: Phaser.Math.Between(0, 600) };
        }
    }

    nearestTank(x, y) {
        if (GameData.gameMode === 'single') {
            return this.tank1 && this.tank1.alive ? this.tank1 : null;
        }

        const t1 = this.tank1 && this.tank1.alive ? this.tank1 : null;
        const t2 = this.tank2 && this.tank2.alive ? this.tank2 : null;
        if (!t1 && !t2) return null;
        if (!t1) return t2;
        if (!t2) return t1;
        return Phaser.Math.Distance.Between(x, y, t1.x, t1.y) <
               Phaser.Math.Distance.Between(x, y, t2.x, t2.y) ? t1 : t2;
    }

    // ═══════════════════════════════════════════════════
    //  POWER-UP & NUKE SYSTEM
    // ═══════════════════════════════════════════════════

    generatePowerupTextures() {
        const colors = { damage: '#ff2222', shield: '#4488ff', nuke: '#ffcc00' };
        for (const [type, color] of Object.entries(colors)) {
            const key = 'orb_' + type;
            if (this.textures.exists(key)) continue;
            const canvas = document.createElement('canvas');
            canvas.width = 16; canvas.height = 16;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(8, 8, 7, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.beginPath(); ctx.arc(5, 5, 3, 0, Math.PI * 2); ctx.fill();
            this.textures.addCanvas(key, canvas);
        }
    }

    spawnPowerup(x, y) {
        const types = ['damage', 'shield', 'nuke'];
        const type = types[Phaser.Math.Between(0, 2)];
        const orb = this.powerupGroup.create(x, y, 'orb_' + type);
        if (!orb) return;
        orb.setDepth(9);
        orb.setData('type', type);
        orb.body.setSize(16, 16);
        orb.body.enable = true;
        // Float animation
        this.tweens.add({
            targets: orb, y: y - 8, duration: 600,
            yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
        // Auto-despawn after 10 seconds
        this.time.delayedCall(10000, () => {
            if (orb.active) orb.destroy();
        });
    }

    collectPowerup(tank, orb) {
        if (!tank.alive || !orb.active) return;
        const type = orb.getData('type');
        switch (type) {
            case 'damage':
                if ((tank.damageBoost || 0) < 3) {
                    tank.damageBoost = (tank.damageBoost || 0) + 1;
                    this.showFloatingText(tank.x, tank.y - 24, `DMG +${tank.damageBoost * 5}`, '#ff2222');
                }
                break;
            case 'shield':
                tank.shield = Math.min(tank.maxShield || 30, tank.shield + 20);
                this.showFloatingText(tank.x, tank.y - 24, 'SHIELD +20', '#4488ff');
                break;
            case 'nuke':
                if ((tank.nukeCharges || 0) < 3) {
                    tank.nukeCharges = (tank.nukeCharges || 0) + 1;
                    this.showFloatingText(tank.x, tank.y - 24, `NUKE x${tank.nukeCharges}`, '#ffcc00');
                }
                break;
        }
        orb.destroy();
        this.playSound('shield');
    }

    showFloatingText(x, y, text, color) {
        const txt = this.add.text(x, y, text, {
            fontSize: '14px', fontFamily: 'Courier New, monospace',
            color: color, stroke: '#000000', strokeThickness: 3,
        }).setDepth(20).setOrigin(0.5);
        this.tweens.add({
            targets: txt, y: y - 40, alpha: 0,
            duration: 1200, ease: 'Sine.easeOut',
            onComplete: () => txt.destroy()
        });
    }

    activateNuke(tank, player) {
        if ((tank.nukeCharges || 0) <= 0) return;
        tank.nukeCharges--;
        // Kill all on-screen zerg
        const zergs = this.zergGroup.getChildren();
        for (const z of zergs) {
            if (!z.active || z.hp <= 0) continue;
            z.setData('lastHitBy', player);
            z.hp = 0;
            this.destroyZerg(z);
        }
        // Big visual feedback
        this.cameras.main.flash(500, 255, 255, 200);
        this.cameras.main.shake(300, 0.03);
        this.emitter.explode(30, tank.x, tank.y);
        this.playSound('explosion_large');
        this.showFloatingText(tank.x, tank.y - 30, '💥 NUKE!', '#ffcc00');
    }

    nearestZerg(x, y) {
        let closest = null;
        let closestDist = Infinity;
        const zergs = this.zergGroup.getChildren();
        for (const z of zergs) {
            if (!z.active || z.hp <= 0) continue;
            const dist = Phaser.Math.Distance.Between(x, y, z.x, z.y);
            if (dist < closestDist) { closestDist = dist; closest = z; }
        }
        return { zerg: closest, distance: closestDist };
    }

    createAnimIfNeeded(tex, key, rate) {
        if (this.anims.exists(key)) return;
        const texture = this.textures.get(tex);
        const frameNames = texture.getFrameNames();
        if (frameNames.length > 0) {
            const frames = frameNames.map(name => ({ key: tex, frame: name }));
            this.anims.create({ key, frames, frameRate: rate, repeat: -1 });
        }
    }

    regenShields() {
        if (this.tank1 && this.tank1.alive && this.tank1.shield < this.tank1.maxShield) {
            this.tank1.shield = Math.min(this.tank1.maxShield, this.tank1.shield + 1);
        }
        if (GameData.gameMode === 'twoPlayer' && this.tank2 && this.tank2.alive && this.tank2.shield < this.tank2.maxShield) {
            this.tank2.shield = Math.min(this.tank2.maxShield, this.tank2.shield + 1);
        }
    }

    // ═══════════════════════════════════════════════════
    //  ROUND / MATCH FLOW
    // ═══════════════════════════════════════════════════

    onRoundTick() {
        if (this.paused) return;
        GameData.roundTimer--;
        if (GameData.roundTimer <= 0) {
            if (GameData.gameMode === 'single' && this.tank1.alive) {
                // Single: survived the round
                if (GameData.currentRound >= 5) {
                    this.endMatch('single_win');
                } else {
                    GameData.currentRound++;
                    this.startNewRound();
                }
            } else if (GameData.gameMode === 'twoPlayer') {
                // Co-op: timer expired = round survived (at least one alive)
                GameData.coopFailed = false;
                this.endRound();
            }
        }
    }

    endRound() {
        if (this._roundEnding) return;
        this._roundEnding = true;
        this.stopBGM();

        this.roundTimerEvent.destroy();
        this.waveTimerEvent.destroy();
        this.shieldRegenEvent.destroy();

        // Clear power-ups
        this.powerupGroup.clear(true, true);

        if (this.tank1) GameData.p1Score += this.tank1.score || 0;
        if (this.tank2) GameData.p2Score += this.tank2.score || 0;

        // Co-op: count survived rounds
        if (!GameData.coopFailed) {
            GameData.coopRoundsSurvived = (GameData.coopRoundsSurvived || 0) + 1;
        }

        if (GameData.currentRound >= 3) {
            this.endMatch('twoPlayer');
        } else {
            GameData.coopFailed = false;
            this.time.delayedCall(2000, () => this.startNewRound());
        }
    }

    startNewRound() {
        GameData.currentRound++;
        GameData.waveNumber = 0;
        GameData.roundTimer = 180;
        GameData.coopFailed = false;
        this._roundEnding = false;
        this._matchEnding = false;
        this._debugLogged = false;

        this.zergGroup.clear(true, true);

        [this.tank1, this.tank2].forEach(tank => {
            if (!tank) return;
            tank.setPosition(tank.player === 'p1' ? 150 : 650, 300);
            tank.setActive(true).setVisible(true);
            tank.alive = true;
            tank.hp = 100;
            tank.shield = 0;
            tank.invincible = 500;
            tank.score = 0;
            tank.kills = 0;
            tank.streak = 0;
            tank.maxStreak = 0;
            tank.damageBoost = 0;
            tank.nukeCharges = 0;
            tank.autoAim = true;  // Reset to auto-aim ON
            tank._fireTimer = 0;
            tank._burstTimer = 0;
            tank._fireTogglePrev = false;
            if (tank.hpBar) tank.hpBar.clear();
            if (tank.shieldBar) tank.shieldBar.clear();
            if (tank._autoIndicator) { tank._autoIndicator.destroy(); tank._autoIndicator = null; }
        });

        // Re-create timer events
        this.roundTimerEvent = this.time.addEvent({ delay: 1000, callback: this.onRoundTick, callbackScope: this, loop: true });
        this.waveTimerEvent = this.time.addEvent({ delay: 12000, callback: this.spawnWave, callbackScope: this, loop: true });
        this.shieldRegenEvent = this.time.addEvent({ delay: 1000, callback: this.regenShields, callbackScope: this, loop: true });
        this.time.delayedCall(2000, () => this.spawnWave());

        this.showWaveAnnounce(`ROUND ${GameData.currentRound}`);
        this.updateHUD();

        // Resume BGM
        this.startBGM();
    }

    endMatch(result) {
        if (this._matchEnding) return;
        this._matchEnding = true;
        this.stopBGM();
        this.roundTimerEvent?.destroy();
        this.waveTimerEvent?.destroy();
        this.shieldRegenEvent?.destroy();

        // Capture final stats before cleanup
        const p1 = this.tank1;
        const p2 = this.tank2;
        const stats = {
            p1: p1 ? {
                name: GameData.p1Name,
                kills: p1.kills || 0,
                maxStreak: p1.maxStreak || 0,
                damageBoost: p1.damageBoost || 0,
                nukes: p1.nukeCharges || 0,
                score: GameData.p1Score,
                alive: p1.alive,
                hp: Math.max(0, p1.hp || 0),
                shield: p1.shield || 0,
            } : null,
            p2: p2 ? {
                name: GameData.p2Name,
                kills: p2.kills || 0,
                maxStreak: p2.maxStreak || 0,
                damageBoost: p2.damageBoost || 0,
                nukes: p2.nukeCharges || 0,
                score: GameData.p2Score,
                alive: p2.alive,
                hp: Math.max(0, p2.hp || 0),
                shield: p2.shield || 0,
            } : null,
            waves: GameData.waveNumber,
            round: GameData.currentRound,
            mode: GameData.gameMode,
            coopSurvived: GameData.coopRoundsSurvived || 0,
            coopFailed: GameData.coopFailed || false,
        };

        document.getElementById('hud').style.display = 'none';

        const overlay = document.getElementById('gameover-overlay');
        const title = document.getElementById('gameover-title');
        const statsEl = document.getElementById('gameover-stats');

        // Single-player row: 2 columns (Stat | Value)
        const singleRow = (label, val) =>
            `<tr><td class="stat-label">${label}</td><td class="stat-p1">${val !== null && val !== undefined ? val : '—'}</td></tr>`;

        // Two-player row: 3 columns (Stat | P1 | P2)
        const coopRow = (label, p1Val, p2Val) => {
            const p1s = p1Val !== null && p1Val !== undefined ? String(p1Val) : '—';
            const p2s = p2Val !== null && p2Val !== undefined ? String(p2Val) : '—';
            return `<tr><td class="stat-label">${label}</td><td class="stat-p1">${p1s}</td><td class="stat-p2">${p2s}</td></tr>`;
        };

        switch (result) {
            case 'single_win':
                title.textContent = `🏆 ${GameData.p1Name} SURVIVED!`;
                title.style.color = '#44ff44';
                statsEl.innerHTML = `
                    <p style="font-size:18px;margin-bottom:12px;">All ${stats.round} rounds defended!</p>
                    <table class="score-table">
                        <tr><th>Stat</th><th>Value</th></tr>
                        ${singleRow('Rounds Survived', stats.round + ' / ' + stats.round)}
                        ${singleRow('Kills', stats.p1.kills)}
                        ${singleRow('Max Streak', stats.p1.maxStreak)}
                        ${singleRow('Waves Faced', stats.waves)}
                        ${singleRow('Damage Boost', '+' + (stats.p1.damageBoost * 5))}
                        ${singleRow('Nukes Held', stats.p1.nukes)}
                        ${singleRow('Final Score', stats.p1.score)}
                        ${singleRow('HP Remaining', stats.p1.hp)}
                        ${singleRow('Shield', stats.p1.shield)}
                    </table>
                `;
                break;
            case 'single_lose':
                title.textContent = `💀 ${GameData.p1Name} DEFEATED!`;
                title.style.color = '#ff2222';
                statsEl.innerHTML = `
                    <p style="font-size:18px;margin-bottom:12px;">Zerg overran your defenses</p>
                    <table class="score-table">
                        <tr><th>Stat</th><th>Value</th></tr>
                        ${singleRow('Round', 'Died in Round ' + stats.round)}
                        ${singleRow('Kills', stats.p1.kills)}
                        ${singleRow('Max Streak', stats.p1.maxStreak)}
                        ${singleRow('Waves Faced', stats.waves)}
                        ${singleRow('Damage Boost', '+' + (stats.p1.damageBoost * 5))}
                        ${singleRow('Nukes Held', stats.p1.nukes)}
                        ${singleRow('Final Score', stats.p1.score)}
                    </table>
                `;
                break;
            default: {
                // Two-player CO-OP mode
                const bothDead = !stats.p1.alive && !stats.p2.alive;
                const anyAlive = stats.p1.alive || stats.p2.alive;

                if (bothDead && stats.coopFailed) {
                    title.textContent = '💀 ANNIHILATED!';
                    title.style.color = '#ff2222';
                } else if (stats.coopSurvived >= 3) {
                    title.textContent = '🏆 MISSION COMPLETE!';
                    title.style.color = '#44ff44';
                } else if (anyAlive) {
                    title.textContent = '⚔️ ROUND CLEARED';
                    title.style.color = '#ffcc00';
                } else {
                    title.textContent = '💀 MISSION FAILED';
                    title.style.color = '#ff2222';
                }

                const p1AliveTag = stats.p1.alive ? ' ✅' : ' 💀';
                const p2AliveTag = stats.p2.alive ? ' ✅' : ' 💀';

                statsEl.innerHTML = `
                    <p style="font-size:18px;margin-bottom:8px;">Rounds Survived: ${stats.coopSurvived} / ${stats.round}</p>
                    <table class="score-table">
                        <tr><th>Stat</th><th class="stat-p1">${stats.p1.name}${p1AliveTag}</th><th class="stat-p2">${stats.p2.name}${p2AliveTag}</th></tr>
                        ${coopRow('Kills', stats.p1.kills, stats.p2.kills)}
                        ${coopRow('Max Streak', stats.p1.maxStreak, stats.p2.maxStreak)}
                        ${coopRow('Waves Faced', stats.waves, stats.waves)}
                        ${coopRow('Damage Boost', '+' + (stats.p1.damageBoost * 5), '+' + (stats.p2.damageBoost * 5))}
                        ${coopRow('Nukes Used', stats.p1.nukes, stats.p2.nukes)}
                        ${coopRow('HP Remaining', stats.p1.hp, stats.p2.hp)}
                        ${coopRow('Shield', stats.p1.shield, stats.p2.shield)}
                        ${coopRow('Final Score', stats.p1.score, stats.p2.score)}
                    </table>
                `;
                break;
            }
        }
        overlay.style.display = 'flex';
    }

    forfeit(player) {
        const tank = player === 'p1' ? this.tank1 : this.tank2;
        if (tank && tank.alive) {
            tank.hp = 0;
            tank.alive = false;
            this.onTankDeath(tank, player);
            if (GameData.gameMode === 'single') {
                this.endMatch('single_lose');
                return;
            }
        }
        document.getElementById('pause-overlay').style.display = 'none';
        this.paused = false;
        this.scene.resume();
        // In co-op, check if both dead
        if (GameData.gameMode === 'twoPlayer') {
            const bothDead = !this.tank1.alive && !this.tank2.alive;
            if (bothDead) {
                GameData.coopFailed = true;
                this.endRound();
            }
        }
    }

    togglePause() {
        this.paused = !this.paused;
        const overlay = document.getElementById('pause-overlay');
        if (this.paused) {
            overlay.style.display = 'flex';
            this.scene.pause();
            this.stopBGM();
        } else {
            overlay.style.display = 'none';
            this.scene.resume();
            this.startBGM();
        }
    }

    showWaveAnnounce(text) {
        const el = document.getElementById('wave-announce');
        const txt = document.getElementById('wave-announce-text');
        txt.textContent = text;
        el.style.display = 'block';
        txt.style.animation = 'none';
        txt.offsetHeight;
        txt.style.animation = '';
        this.time.delayedCall(2000, () => { el.style.display = 'none'; });
    }

    // ═══════════════════════════════════════════════════
    //  HUD & DEBUG
    // ═══════════════════════════════════════════════════

    updateHUD() {
        const p1Hp = this.tank1 ? Math.max(0, this.tank1.hp) : 0;
        const p2Hp = this.tank2 ? Math.max(0, this.tank2.hp) : 0;
        const p1Sh = this.tank1 ? this.tank1.shield : 0;
        const p2Sh = this.tank2 ? this.tank2.shield : 0;

        const setWidth = (id, pct) => {
            const el = document.getElementById(id);
            if (el) el.style.width = `${Math.max(0, Math.min(100, pct))}%`;
        };
        setWidth('p1-hp', p1Hp);
        setWidth('p2-hp', p2Hp);
        setWidth('p1-shield', (p1Sh / 30) * 100);
        setWidth('p2-shield', (p2Sh / 30) * 100);

        const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        s('p1-score', `Score: ${GameData.p1Score}`);
        if (GameData.gameMode === 'twoPlayer') {
            s('p2-score', `Score: ${GameData.p2Score}`);
        } else {
            s('p2-score', ''); // Hide in single player
        }
        s('wave-display', `WAVE ${GameData.waveNumber}`);
        const m = Math.floor(GameData.roundTimer / 60);
        const sec = GameData.roundTimer % 60;
        s('timer-display', `${m}:${sec.toString().padStart(2, '0')}`);

        if (GameData.gameMode === 'twoPlayer') {
            s('round-display', `ROUND ${GameData.currentRound} | ${GameData.p1RoundsWon} — ${GameData.p2RoundsWon}`);
        } else {
            s('round-display', `SINGLE PLAYER - ${GameData.currentRound}/5`);
        }
    }

    drawHPBars() {
        // Draw tank1 HP bar
        if (this.tank1 && this.tank1.alive && this.tank1.hp !== undefined) {
            const pct = this.tank1.hp / this.tank1.maxHp;
            const shPct = this.tank1.shield / this.tank1.maxShield;

            this.tank1.hpBar.clear();
            this.tank1.hpBar.fillStyle(0x000000, 0.7);
            this.tank1.hpBar.fillRect(this.tank1.x - 25, this.tank1.y - 30, 50, 6);
            this.tank1.hpBar.fillStyle(pct > 0.5 ? 0x44ff44 : pct > 0.25 ? 0xffaa00 : 0xff2200, 1);
            this.tank1.hpBar.fillRect(this.tank1.x - 25, this.tank1.y - 30, 50 * pct, 6);

            this.tank1.shieldBar.clear();
            this.tank1.shieldBar.fillStyle(0x000000, 0.5);
            this.tank1.shieldBar.fillRect(this.tank1.x - 25, this.tank1.y - 36, 50, 4);
            this.tank1.shieldBar.fillStyle(0x44ddff, 1);
            this.tank1.shieldBar.fillRect(this.tank1.x - 25, this.tank1.y - 36, 50 * shPct, 4);
        }

        // Draw tank2 HP bar only in two player mode
        if (GameData.gameMode === 'twoPlayer' && this.tank2 && this.tank2.alive && this.tank2.hp !== undefined) {
            const pct = this.tank2.hp / this.tank2.maxHp;
            const shPct = this.tank2.shield / this.tank2.maxShield;

            this.tank2.hpBar.clear();
            this.tank2.hpBar.fillStyle(0x000000, 0.7);
            this.tank2.hpBar.fillRect(this.tank2.x - 25, this.tank2.y - 30, 50, 6);
            this.tank2.hpBar.fillStyle(pct > 0.5 ? 0x44ff44 : pct > 0.25 ? 0xffaa00 : 0xff2200, 1);
            this.tank2.hpBar.fillRect(this.tank2.x - 25, this.tank2.y - 30, 50 * pct, 6);

            this.tank2.shieldBar.clear();
            this.tank2.shieldBar.fillStyle(0x000000, 0.5);
            this.tank2.shieldBar.fillRect(this.tank2.x - 25, this.tank2.y - 36, 50, 4);
            this.tank2.shieldBar.fillStyle(0x44ddff, 1);
            this.tank2.shieldBar.fillRect(this.tank2.x - 25, this.tank2.y - 36, 50 * shPct, 4);
        }
    }

    /** Draw green rectangles around all physics bodies for debugging */
    drawDebugBodies() {
        if (!this._debugShowBodies) { this.debugGfx.clear(); return; }
        this.debugGfx.clear();
        this.debugGfx.lineStyle(1, 0x00ff00, 0.5);

        // Zerg bodies
        this.zergGroup.getChildren().forEach(z => {
            if (!z.active || !z.body) return;
            this.debugGfx.strokeRect(z.body.x, z.body.y, z.body.width, z.body.height);
        });

        // Tank bodies
        [this.tank1, this.tank2].forEach(t => {
            if (!t || !t.alive || !t.body) return;
            this.debugGfx.lineStyle(1.5, 0xffff00, 0.7);
            this.debugGfx.strokeRect(t.body.x, t.body.y, t.body.width, t.body.height);
        });
    }
}
