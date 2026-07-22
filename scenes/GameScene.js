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
        GameData.survivalTime = 0;
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

        // ── Enemy bullet pool (zerg ranged attacks) ──
        this.enemyBullets = this.physics.add.group({ maxSize: 80, runChildUpdate: false });

        // ── Zerg group (config REQUIRED for proper physics world registration) ──
        this.zergGroup = this.physics.add.group({ runChildUpdate: false });

        // ── Power-up group ──
        this.powerupGroup = this.physics.add.group({ runChildUpdate: false });
        this.generatePowerupTextures();
        this.generateEnemyBulletTexture();
        this.generateSwarmMissileTexture();

        // ── Swarm missile group (homing missiles from power-up) ──
        this.swarmMissiles = this.physics.add.group({ maxSize: 40, runChildUpdate: false });

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

        // ── Input (uses configurable keybindings from GameData) ──
        const kb = GameData.keyBindings;
        this.keys = this.input.keyboard.addKeys({
            p1Up: kb.p1Up, p1Down: kb.p1Down, p1Left: kb.p1Left, p1Right: kb.p1Right,
            p1Fire: kb.p1Fire, p1Burst: 'SHIFT', p1Shield: kb.p1Shield, p1Nuke: kb.p1Nuke,
            p2Up: kb.p2Up, p2Down: kb.p2Down, p2Left: kb.p2Left, p2Right: kb.p2Right,
            p2Fire: kb.p2Fire, p2Burst: 'RSHIFT', p2Shield: kb.p2Shield, p2Nuke: kb.p2Nuke,
            escape: 'ESCAPE',
        });

        // ── Timers ──
        // Survival timer: counts UP from 0 every second
        this.survivalTimerEvent = this.time.addEvent({ delay: 1000, callback: this.onSurvivalTick, callbackScope: this, loop: true });
        // Waves spawn continuously (scales with wave number, no round ceiling)
        this.waveTimerEvent = this.time.addEvent({ delay: 12000, callback: this.spawnWave, callbackScope: this, loop: true });
        this.shieldRegenEvent = this.time.addEvent({ delay: 1000, callback: this.regenShields, callbackScope: this, loop: true });

        // ── Animations ──
        // Note: Creating animations requires sprite sheets with multiple frames
        // For now, zerg will be static (no animation)
        console.log('[GameScene] Animations disabled (sprite sheets not available)');

        // ── State ──
        this.paused = false;
        this._matchEnding = false;
        this._debugLogged = false;
        this._bossWaveState = null;   // null | 'clearing' | 'boss_incoming' | 'boss_fight' | 'boss_down'
        this._bossZerg = null;        // reference to the boss sprite during boss fight

        // ── Audio setup ──
        this.setupAudio();
        this._currentSfx = null;   // track currently playing SFX to prevent overlap

        // ── Initial wave ──
        this.time.delayedCall(2000, () => this.spawnWave());

        // BGM now only plays during boss fights — not during normal waves
        this.showWaveAnnounce('WAVE 1');
        this.updateHUD();
    }

    // ═══════════════════════════════════════════════════
    //  AUDIO SYSTEM (real SFX with oscillator fallback)
    // ═══════════════════════════════════════════════════

    /** SFX mapping: old oscillator type → new audio key */
    static SFX_MAP = {
        fire_red: 'sfx_shoot',
        fire_blue: 'sfx_shoot',
        burst: 'sfx_shoot',
        shield: 'sfx_shield',
        hit_zerg: 'sfx_hit_zerg',
        hit_tank: 'sfx_hit_tank',
        explosion: 'sfx_explosion_small',
        explosion_large: 'sfx_explosion_large',
        wave_start: 'sfx_wave_start',
        powerup: 'sfx_powerup',
        nuke: 'sfx_nuke',
        swarm: 'sfx_swarm',
        boss: 'sfx_boss_warning',
    };

    setupAudio() {
        // Audio is managed by Phaser's sound manager (Web Audio or HTML5 Audio)
        this.sound.volume = 0.3;
        this._bgmPlaying = false;
        this._bgmMusic = null;
    }

    /** Play a sound effect (real file preferred, oscillator fallback if missing) */
    playSound(type) {
        const sfxKey = GameScene.SFX_MAP[type];
        if (sfxKey && this.cache.audio.exists(sfxKey)) {
            try {
                // Stop previous instance of the same sound to prevent stacking
                if (this._currentSfx === sfxKey) {
                    try { this.sound.stopByKey(sfxKey); } catch (_) {}
                }
                this.sound.play(sfxKey, { volume: 0.3 });
                this._currentSfx = sfxKey;
                return;
            } catch (_) { /* fall back to oscillator */ }
        }
        // Oscillator fallback — minimal beep
        this._oscBeep(type);
    }

    /** Minimal oscillator beep as fallback */
    _oscBeep(type) {
        if (!this._oscCtx) {
            try {
                this._oscCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (_) { return; }
        }
        const ctx = this._oscCtx;
        if (ctx.state === 'suspended') ctx.resume();
        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            const t = ctx.currentTime;
            const freq = type === 'fire_red' ? 180 : type === 'fire_blue' ? 260 : 440;
            osc.type = 'square';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.05, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
            osc.start(t); osc.stop(t + 0.1);
        } catch (_) { /* audio unavailable */ }
    }

    /** Short 3-beep alarm for boss entry (replaces long sfx_boss_warning.wav) */
    _alarmBeep() {
        if (!this._oscCtx) {
            try {
                this._oscCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (_) { return; }
        }
        const ctx = this._oscCtx;
        if (ctx.state === 'suspended') ctx.resume();
        try {
            for (let i = 0; i < 3; i++) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                const t = ctx.currentTime + i * 0.25;
                osc.type = 'square';
                osc.frequency.value = 660 + i * 220;  // Rising tone: 660 → 880 → 1100 Hz
                gain.gain.setValueAtTime(0.08, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
                osc.start(t);
                osc.stop(t + 0.2);
            }
        } catch (_) { /* audio unavailable */ }
    }

    startBGM() {
        if (this._bgmPlaying) return;
        if (this.cache.audio.exists('bgm_battle')) {
            try {
                this._bgmMusic = this.sound.add('bgm_battle', { volume: 0.15, loop: true });
                this._bgmMusic.play();
                this._bgmPlaying = true;
                return;
            } catch (_) { /* fall back to oscillator */ }
        }
        // Oscillator BGM fallback skipped — silence is fine if no BGM file
        this._bgmPlaying = true;
    }

    stopBGM() {
        this._bgmPlaying = false;
        if (this._bgmMusic) {
            try { this._bgmMusic.stop(); } catch (_) {}
            this._bgmMusic = null;
        }
    }

    // ═══════════════════════════════════════════════════
    //  ENTITY CREATION
    // ═══════════════════════════════════════════════════

    createTank(x, y, texture, playerId) {
        const tank = this.physics.add.sprite(x, y, texture);
        tank.setCollideWorldBounds(true);
        tank.setDepth(10);
        tank.player = playerId;

        // Apply per-player tech tree bonuses
        const tt = (window.getTechTree ? window.getTechTree(playerId) : window.TechTree) || {};
        const bonusHP = (tt.armor || 0) * 15;
        const bonusShield = (tt.shieldCap || 0) * 5;
        const bonusNukeCap = (tt.nukeCap || 0);

        tank.hp = 100 + bonusHP;
        tank.maxHp = 100 + bonusHP;
        tank.shield = 30 + bonusShield;
        tank.maxShield = 30 + bonusShield;
        tank.invincible = 500;        // 0.5s spawn protection
        tank.nukeCharges = 0;         // Stored nukes (max 3 + tech bonus)
        tank.maxNukes = 3 + bonusNukeCap;
        tank.swarmTimer = 0;          // Swarm missile launcher duration (ms)
        tank.swarmActive = false;     // Whether swarm missiles are active
        tank._swarmFireTimer = 0;     // Cooldown between swarm missile shots
        tank.alive = true;
        tank.score = 0;
        tank.kills = 0;
        tank.streak = 0;
        tank.maxStreak = 0;

        // Weapon evolution system (replaces old damageBoost)
        tank.weaponLevel = 1;         // Lv1-5 weapon evolution
        tank.weaponExp = 0;           // Current exp progress
        tank.weaponNextExp = 3;       // Exp needed for next level
        const WEAPON_EXP_TABLE = [0, 3, 6, 11, 19]; // cumulative exp for each level
        tank._weaponExpTable = WEAPON_EXP_TABLE;

        // Auto-detect texture size for proper body sizing
        const tex = this.textures.get(texture);
        const texW = tex ? tex.getSourceImage().width : 64;
        const texH = tex ? tex.getSourceImage().height : 56;

        if (texW > 70) {
            // Kenney tank PNG (~76-84px wide) — scale down
            tank.setScale(0.8);
            tank.body.setSize(58, 58);
            tank.body.setOffset((texW - 58) / 2, (texH - 58) / 2);
        } else {
            // Canvas fallback (64×56) or other small texture
            tank.setScale(1.2);
            tank.body.setSize(56, 48);
            tank.body.setOffset(4, 4);
        }

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
        // Enemy bullet hits tank
        this.physics.add.overlap(this.enemyBullets, this.tank1, this.enemyBulletHitTank, null, this);
        if (this.tank2) {
            this.physics.add.overlap(this.enemyBullets, this.tank2, this.enemyBulletHitTank, null, this);
        }
        // Swarm missile hits zerg
        this.physics.add.overlap(this.swarmMissiles, this.zergGroup, this.swarmMissileHitZerg, null, this);
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
        this.cleanupEnemyBullets();
        this.manualEnemyBulletTankCollision();  // Manual fallback — bypasses Phaser overlap bugs
        this.updateEnemyAI(delta);  // FIXED: pass delta (ms) not dt (seconds)
        this.updateSwarmMissiles(delta);

        if (Phaser.Input.Keyboard.JustDown(this.keys.escape)) {
            this.togglePause();
        }

        // ── Death Handling (survival mode — game ends when you die) ──

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

        // Two player co-op: both dead → game over
        if (GameData.gameMode === 'twoPlayer') {
            const bothDead = !this.tank1.alive && !this.tank2.alive;
            if (bothDead && !this._matchEnding) {
                GameData.coopFailed = true;
                this.endMatch('twoPlayer');
            }
        }

        // ── Boss HP bar update ──
        this.updateBossHPBar();
    }

    updateBossHPBar() {
        if (this._bossWaveState === 'boss_fight' && this._bossZerg && this._bossZerg.active) {
            const pct = Math.max(0, (this._bossZerg.hp / this._bossZerg.maxHp) * 100);
            const el = document.getElementById('boss-hp-fill');
            if (el) el.style.width = `${pct}%`;
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

    /**
     * MANUAL distance-based collision: enemy bullets ↔ tanks.
     * Bypasses Phaser's physics overlap entirely (unreliable for fast projectiles).
     */
    manualEnemyBulletTankCollision() {
        try {
            const bullets = this.enemyBullets.getChildren();
            for (const bullet of bullets) {
                if (!bullet.active) continue;
                const dmg = bullet.getData('damage') || 8;

                for (const tank of [this.tank1, this.tank2]) {
                    if (!tank || !tank.alive || (tank.invincible || 0) > 0) continue;

                    const dist = Phaser.Math.Distance.Between(bullet.x, bullet.y, tank.x, tank.y);
                    const hitRadius = 28; // bullet (16) + tank (~56) / 2 ≈ 28 effective

                    if (dist < hitRadius) {
                        // Apply damage
                        let remaining = dmg;
                        if (tank.shield > 0) {
                            const absorbed = Math.min(tank.shield, remaining);
                            tank.shield -= absorbed;
                            remaining -= absorbed;
                        }
                        if (remaining > 0) {
                            tank.hp -= remaining;
                            tank.hp = Math.max(0, tank.hp);
                        }

                        // Deactivate bullet
                        bullet.setActive(false).setVisible(false);
                        bullet.body.stop();

                        this.spawnHitEffect(tank.x, tank.y);
                        this.playSound('hit_tank');
                        break; // bullet consumed, move to next bullet
                    }
                }
            }
        } catch (e) {
            console.error('[manualEnemyBulletTankCollision] Error:', e);
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
                const tt = (window.getTechTree ? window.getTechTree(player) : window.TechTree) || {};
                tank._fireTimer = 500 - (tt.fireRate || 0) * 60;  // Tech tree fire rate bonus
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

            // Shield (3s cooldown to prevent spam)
            const shieldKey = player === 'p1' ? keys.p1Shield : keys.p2Shield;
            tank._shieldCooldown = Math.max(0, (tank._shieldCooldown || 0) - delta);
            tank._shieldPrevDown = tank._shieldPrevDown || false;
            const shieldDown = shieldKey.isDown;
            const shieldJustPressed = shieldDown && !tank._shieldPrevDown;
            if (shieldJustPressed && tank.shield < tank.maxShield && tank._shieldCooldown <= 0) {
                tank.shield = Math.min(tank.maxShield, tank.shield + 15);
                tank.invincible = Math.max(tank.invincible, 300);
                tank._shieldCooldown = 3000;  // 3 second cooldown
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
            const tt = (window.getTechTree ? window.getTechTree(player) : window.TechTree) || {};
            tank._fireTimer = 500 - (tt.fireRate || 0) * 60;
            this.playSound(player === 'p1' ? 'fire_red' : 'fire_blue');
        }

        // Shield — edge detection + 3s cooldown
        const shieldKey = player === 'p1' ? keys.p1Shield : keys.p2Shield;
        tank._shieldCooldown = Math.max(0, (tank._shieldCooldown || 0) - delta);
        tank._shieldPrevDown = tank._shieldPrevDown || false;
        const shieldDown = shieldKey.isDown;
        if (shieldDown && !tank._shieldPrevDown && tank.shield < (tank.maxShield || 30) && tank._shieldCooldown <= 0) {
            tank.shield = Math.min(tank.maxShield || 30, tank.shield + 15);
            tank.invincible = Math.max(tank.invincible || 0, 300);
            tank._shieldCooldown = 3000;  // 3 second cooldown
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
        const angle = tank.rotation;
        const tt = (window.getTechTree ? window.getTechTree(player) : window.TechTree) || {};
        const weaponLevel = tank.weaponLevel || 1;
        const weaponBonuses = [0, 5, 10, 15, 25]; // damage bonus per weapon level
        const baseDamage = 15 + (tt.attack || 0) * 3 + weaponBonuses[weaponLevel - 1];

        const spawnBullet = (offsetAngle, offsetX, offsetY, piercing) => {
            const bullet = bulletGroup.get(tank.x, tank.y, tex);
            if (!bullet) return;
            bullet.setData('damage', baseDamage);
            bullet.setData('owner', player);
            bullet.setData('expireAt', this.time.now + 3000);
            if (piercing) bullet.setData('piercing', true);

            // Scale: bigger at higher weapon levels
            const scaleByLevel = [1.0, 1.1, 1.2, 1.4, 1.8];
            const bs = Math.round(10 * scaleByLevel[weaponLevel - 1]);

            bullet.setActive(true).setVisible(true);
            bullet.body.enable = true;
            bullet.body.setSize(bs, bs);
            bullet.body.setAllowGravity(false);
            bullet.setScale(scaleByLevel[weaponLevel - 1]);
            const a = angle + offsetAngle;
            bullet.setPosition(tank.x + Math.cos(a) * 20 + offsetX, tank.y + Math.sin(a) * 20 + offsetY);
            bullet.setVelocity(400 * Math.cos(a), 400 * Math.sin(a));
            bullet.setDepth(5);
        };

        switch (weaponLevel) {
            case 1: // Single shot
                spawnBullet(0, 0, 0, false);
                break;
            case 2: // Dual parallel (2 bullets, 8px spacing)
                spawnBullet(0, 0, -4, false);
                spawnBullet(0, 0, 4, false);
                break;
            case 3: // 5-way spread (40° fan)
                for (let i = -2; i <= 2; i++) {
                    spawnBullet(i * 0.14, 0, 0, false);
                }
                break;
            case 4: // 3-way piercing (bullets don't disappear on zerg hit)
                for (let i = -1; i <= 1; i++) {
                    spawnBullet(i * 0.12, 0, 0, true);
                }
                break;
            case 5: // MAX — Laser beam + splash
                // Fire a thick beam (represented as a large fast bullet with splash)
                const beam = bulletGroup.get(tank.x, tank.y, tex);
                if (beam) {
                    beam.setData('damage', baseDamage);
                    beam.setData('owner', player);
                    beam.setData('expireAt', this.time.now + 800);
                    beam.setData('laser', true);  // Splash on hit
                    beam.setActive(true).setVisible(true);
                    beam.body.enable = true;
                    beam.body.setSize(18, 18);
                    beam.body.setAllowGravity(false);
                    beam.setScale(2.0);
                    beam.setTint(0xff8800);  // Orange laser
                    beam.setPosition(tank.x + Math.cos(angle) * 20, tank.y + Math.sin(angle) * 20);
                    beam.setVelocity(500 * Math.cos(angle), 500 * Math.sin(angle));
                    beam.setDepth(5);
                }
                break;
        }

        this.cameras.main.shake(50, 0.002);
    }

    fireBurst(tank, player) {
        const bulletGroup = player === 'p1' ? this.bulletsP1 : this.bulletsP2;
        const baseAngle = tank.rotation;
        const tt = (window.getTechTree ? window.getTechTree(player) : window.TechTree) || {};
        const weaponLevel = tank.weaponLevel || 1;
        const weaponBonuses = [0, 5, 10, 15, 25];
        const baseDamage = 8 + Math.floor(((tt.attack || 0) * 3 + weaponBonuses[weaponLevel - 1]) * 0.5);
        for (let i = -1; i <= 1; i++) {
            const angle = baseAngle + i * 0.2;
            const tex = player === 'p1' ? 'bullet_red' : 'bullet_blue';
            const bullet = bulletGroup.get(tank.x, tank.y, tex);
            if (!bullet) continue;

            bullet.setData('damage', baseDamage);
            bullet.setData('owner', player);
            bullet.setData('expireAt', this.time.now + 3000);

            const scaleByLevel = [1.0, 1.1, 1.2, 1.4, 1.8];
            const bScale = scaleByLevel[weaponLevel - 1];
            const bz = Math.round(10 * bScale);

            bullet.setActive(true).setVisible(true);
            bullet.body.enable = true;
            bullet.body.setSize(bz, bz);
            bullet.body.setAllowGravity(false);
            bullet.setScale(bScale);
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
        if (!bullet.active || !zerg.active || zerg.hp === undefined) return;
        const damage = bullet.getData('damage') || 15;
        zerg.hp -= damage;
        zerg.setData('lastHitBy', bullet.getData('owner') || 'p1');

        // Laser splash: 80px radius to nearby zergs
        if (bullet.getData('laser')) {
            const splashRadius = 80;
            this.zergGroup.getChildren().forEach(nearby => {
                if (!nearby.active || nearby === zerg || nearby.hp <= 0) return;
                const d = Phaser.Math.Distance.Between(zerg.x, zerg.y, nearby.x, nearby.y);
                if (d < splashRadius) {
                    nearby.hp -= Math.floor(damage * 0.5);  // 50% splash damage
                    nearby.setData('lastHitBy', bullet.getData('owner') || 'p1');
                    this.spawnHitEffect(nearby.x, nearby.y);
                }
            });
        }

        // Piercing bullets don't disappear on hit
        const piercing = bullet.getData('piercing');
        if (!piercing && !bullet.getData('laser')) {
            bullet.setActive(false).setVisible(false);
            bullet.body.stop();
        }
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
        const zergType = zerg.getData('type') || '';

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
            // Boss kill bonus
            if (zergType === 'ultra_boss') attacker.score += 100;
        }

        // 10% chance to drop a power-up (nuke-killed zergs never drop)
        if (!zerg._nuked && Math.random() < 0.10) {
            this.spawnPowerup(zerg.x, zerg.y);
        }

        // ── Boss wave state machine ──
        // Boss killed → victory
        if (zergType === 'ultra_boss' && this._bossWaveState === 'boss_fight') {
            this.onBossKilled();
        }
        // Check if all non-boss zergs cleared on a boss wave
        if (this._bossWaveState === 'clearing') {
            this.checkBossWaveClear();
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
    //  ENEMY AI — Ranged attacks & projectile system
    // ═══════════════════════════════════════════════════

    cleanupEnemyBullets() {
        const now = this.time.now;
        this.enemyBullets.getChildren().forEach(b => {
            if (!b.active) return;
            const expireAt = b.getData('expireAt');
            if (expireAt && now >= expireAt) {
                b.setActive(false).setVisible(false);
                b.body.stop();
            }
            // Also cleanup if off-screen
            if (b.x < -20 || b.x > 820 || b.y < -20 || b.y > 620) {
                b.setActive(false).setVisible(false);
                b.body.stop();
            }
        });
    }

    fireEnemyBullet(zerg, target, damage, speed) {
        if (!target || !target.alive) return;
        const bullet = this.enemyBullets.get(zerg.x, zerg.y, 'enemy_bullet');
        if (!bullet) return;

        const angle = Phaser.Math.Angle.Between(zerg.x, zerg.y, target.x, target.y);
        const bx = zerg.x + Math.cos(angle) * 20;
        const by = zerg.y + Math.sin(angle) * 20;
        bullet.setData('damage', damage || 8);
        bullet.setData('expireAt', this.time.now + 4000);
        bullet.setActive(true).setVisible(true);
        bullet.body.reset(bx, by);
        bullet.body.enable = true;
        bullet.body.setSize(16, 16);
        bullet.body.setAllowGravity(false);
        bullet.body.updateBounds();
        bullet.setVelocity((speed || 220) * Math.cos(angle), (speed || 220) * Math.sin(angle));
        bullet.setDepth(7);
    }

    enemyBulletHitTank(bullet, tank) {
        if (!bullet.active || !tank.alive || (tank.invincible || 0) > 0) return;

        console.log('[enemyBulletHitTank] HIT! Tank:', tank.player, 'HP before:', tank.hp, 'shield:', tank.shield, 'dmg:', bullet.getData('damage'));

        const damage = bullet.getData('damage') || 8;
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

        bullet.setActive(false).setVisible(false);
        bullet.body.stop();
        this.spawnHitEffect(tank.x, tank.y);
        this.playSound('hit_tank');
    }

    updateEnemyAI(delta) {
        // delta is in milliseconds (Phaser standard)
        const zergs = this.zergGroup.getChildren();
        for (const zerg of zergs) {
            if (!zerg.active || zerg.hp <= 0) continue;

            const type = zerg.getData('type');
            const target = this.nearestTank(zerg.x, zerg.y);
            if (!target || !target.alive) continue;

            const dist = Phaser.Math.Distance.Between(zerg.x, zerg.y, target.x, target.y);

            // ── Spitter AI (ranged, keeps distance) ──
            if (type === 'spitter') {
                zerg._fireTimer = (zerg._fireTimer || 0) - delta;
                const PREFERRED = 200, TOO_CLOSE = 120;
                const angle = Phaser.Math.Angle.Between(target.x, target.y, zerg.x, zerg.y);

                if (dist < TOO_CLOSE) {
                    // Back away
                    zerg.setVelocity(Math.cos(angle) * 70, Math.sin(angle) * 70);
                } else if (dist > PREFERRED + 60) {
                    // Move closer
                    zerg.setVelocity(-Math.cos(angle) * 50, -Math.sin(angle) * 50);
                } else {
                    zerg.setVelocity(0, 0);
                }

                if (dist < 450 && zerg._fireTimer <= 0) {
                    this.fireEnemyBullet(zerg, target, 12, 200);
                    zerg._fireTimer = 1800 + Math.random() * 400;  // ms — faster fire rate
                }
            }

            // ── Boss Ultra AI (chase + spread machine-gun fire) ──
            if (type === 'ultra_boss') {
                zerg._fireTimer = (zerg._fireTimer || 0) - delta;

                // Chase the nearest tank
                const chaseAngle = Phaser.Math.Angle.Between(zerg.x, zerg.y, target.x, target.y);
                const chaseSpeed = 55 + GameData.waveNumber * 0.5;  // faster at higher waves
                zerg.setVelocity(
                    Math.cos(chaseAngle) * chaseSpeed,
                    Math.sin(chaseAngle) * chaseSpeed
                );

                // Spread fire — bullet count scales with wave (1 at wave 10, 2 at 20, etc.)
                if (dist < 450 && zerg._fireTimer <= 0) {
                    const spreadCount = zerg.getData('spreadCount') || 1;
                    const bossDmg = zerg.getData('bossDmg') || 20;
                    const baseAngle = Phaser.Math.Angle.Between(zerg.x, zerg.y, target.x, target.y);
                    const spreadDeg = 12;  // degrees between spread bullets

                    for (let i = 0; i < spreadCount; i++) {
                        let angle;
                        if (spreadCount === 1) {
                            angle = baseAngle;
                        } else {
                            const offset = (i - (spreadCount - 1) / 2) * (spreadDeg * Math.PI / 180);
                            angle = baseAngle + offset;
                        }
                        // Use a virtual target at the computed angle (fireEnemyBullet needs a target)
                        const vTarget = {
                            x: zerg.x + Math.cos(angle) * 400,
                            y: zerg.y + Math.sin(angle) * 400,
                            alive: true
                        };
                        this.fireEnemyBullet(zerg, vTarget, bossDmg, 300);
                    }
                    // Fire rate improves slightly with wave (250ms → 180ms at high waves)
                    zerg._fireTimer = Math.max(180, 250 - GameData.waveNumber);
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════
    //  SWARM MISSILE SYSTEM (homing missile power-up)
    // ═══════════════════════════════════════════════════

    updateSwarmMissiles(delta) {
        const now = this.time.now;

        // Fire swarm missiles for each tank
        for (const tank of [this.tank1, this.tank2]) {
            if (!tank || !tank.alive) continue;

            // Decrement swarm timer
            if (tank.swarmTimer > 0) {
                tank.swarmTimer = Math.max(0, tank.swarmTimer - delta);
                if (tank.swarmTimer <= 0) tank.swarmActive = false;
            }

            // Fire missiles while swarm is active
            if (tank.swarmActive) {
                tank._swarmFireTimer = (tank._swarmFireTimer || 0) - delta;
                if (tank._swarmFireTimer <= 0) {
                    const target = this.nearestZerg(tank.x, tank.y);
                    if (target.zerg) {
                        this.fireSwarmMissile(tank, target.zerg);
                    }
                    tank._swarmFireTimer = 200;  // Fire every 200ms
                }
            }
        }

        // Update homing behavior for active missiles
        this.swarmMissiles.getChildren().forEach(m => {
            if (!m.active) return;
            // Check expiry
            const expireAt = m.getData('expireAt');
            if (expireAt && now >= expireAt) {
                m.setActive(false).setVisible(false);
                m.body.stop();
                return;
            }
            // Homing: adjust heading toward target
            const target = m.getData('target');
            if (target && target.active && target.hp > 0) {
                const desiredAngle = Phaser.Math.Angle.Between(m.x, m.y, target.x, target.y);
                const currentAngle = Math.atan2(m.body.velocity.y, m.body.velocity.x);
                let angleDiff = desiredAngle - currentAngle;
                // Normalize to [-PI, PI]
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                const turnRate = 0.06;  // radians per frame
                const newAngle = currentAngle + Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), turnRate);
                const speed = 320;
                m.body.velocity.x = Math.cos(newAngle) * speed;
                m.body.velocity.y = Math.sin(newAngle) * speed;
                m.rotation = newAngle + Math.PI / 2;
            }
            // Cleanup off-screen
            if (m.x < -30 || m.x > 830 || m.y < -30 || m.y > 630) {
                m.setActive(false).setVisible(false);
                m.body.stop();
            }
        });
    }

    fireSwarmMissile(tank, target) {
        const m = this.swarmMissiles.get(tank.x, tank.y, 'swarm_missile');
        if (!m) return;
        const angle = Phaser.Math.Angle.Between(tank.x, tank.y, target.x, target.y);
        m.setData('damage', 20);
        m.setData('target', target);
        m.setData('expireAt', this.time.now + 2500);
        m.setActive(true).setVisible(true);
        m.body.reset(tank.x + Math.cos(angle) * 20, tank.y + Math.sin(angle) * 20);
        m.body.enable = true;
        m.body.setSize(12, 16);
        m.body.setAllowGravity(false);
        m.body.updateBounds();
        m.setVelocity(320 * Math.cos(angle), 320 * Math.sin(angle));
        m.setDepth(7);
        m.rotation = angle + Math.PI / 2;
        this.playSound('fire_red');
    }

    swarmMissileHitZerg(missile, zerg) {
        if (!missile.active || !zerg.active || zerg.hp <= 0) return;
        const damage = missile.getData('damage') || 20;
        zerg.hp -= damage;
        zerg.setData('lastHitBy', (missile.getData('owner') || 'p1'));
        this.spawnExplosion(missile.x, missile.y);
        this.playSound('explosion');

        // Splash damage in small radius
        const splashDmg = Math.floor(damage * 0.4);
        this.zergGroup.getChildren().forEach(z => {
            if (z === zerg || !z.active || z.hp <= 0) return;
            const dist = Phaser.Math.Distance.Between(missile.x, missile.y, z.x, z.y);
            if (dist <= 50) { z.hp -= splashDmg; if (z.hp <= 0) this.destroyZerg(z); }
        });

        missile.setActive(false).setVisible(false);
        missile.body.stop();

        if (zerg.hp <= 0) this.destroyZerg(zerg);
    }

    spawnSpitter(count, wave) {
        const tex = 'zerg_spitter';
        const hp = 40 + wave * 4;
        const spd = 60;
        const dmg = 8;

        for (let i = 0; i < count; i++) {
            const { x, y } = this.randomEdge();
            const z = this.zergGroup.create(x, y, tex);
            if (!z) continue;
            this.physics.world.enable(z);
            z.setDepth(8);
            z.hp = hp;
            z.setData('damage', dmg);
            z.setData('rangedDamage', 12);
            z.setData('type', 'spitter');
            z.setData('points', 35);
            z._hitCooldown = {};
            z._fireTimer = 1500 + Math.random() * 1000;
            z.body.setSize(52, 42);
            z.body.enable = true;

            const target = this.nearestTank(x, y);
            if (target) {
                const a = Phaser.Math.Angle.Between(x, y, target.x, target.y);
                z.setVelocity(Math.cos(a) * spd, Math.sin(a) * spd);
            }
            // Spitters don't use the generic re-target timer; AI handles movement
        }
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
            zerg_spitter: [52, 42],
        };

        const spawn = (tex, count, hp, spd, dmg, pts, zergType) => {
            const [fw, fh] = sizeMap[tex] || [40, 30];
            for (let i = 0; i < count; i++) {
                const { x, y } = this.randomEdge();
                const z = this.zergGroup.create(x, y, tex);
                if (!z) continue;
                this.physics.world.enable(z);
                z.setDepth(8);
                z.hp = hp;
                z.setData('damage', dmg);
                z.setData('points', pts);
                if (zergType) z.setData('type', zergType);
                z._hitCooldown = {};
                z._lastHitTime = 0;

                z.body.setSize(fw, fh);
                z.body.enable = true;

                const target = this.nearestTank(x, y);
                if (target) {
                    const angle = Phaser.Math.Angle.Between(x, y, target.x, target.y);
                    z.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
                }

                // Re-target timer (skip for AI-controlled types)
                if (zergType !== 'spitter') {
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
            }
        };

        // ── Survival wave scaling (difficulty based on wave number only) ──
        const isBossWave = (wave % 10 === 0);       // Major boss every 10 waves
        const isMiniBossWave = (wave % 5 === 0);     // Ultra mini-boss every 5 waves

        // Co-op difficulty scaling — more enemies + tougher enemies for 2 players
        const coopCountMult = GameData.gameMode === 'twoPlayer' ? 1.6 : 1.0;
        const coopHPMult = GameData.gameMode === 'twoPlayer' ? 1.3 : 1.0;

        // Base difficulty scales with wave number (+8% per wave)
        const waveMult = 1 + (wave - 1) * 0.08;

        // ── Breathing wave: after boss wave, reduce enemy count by 50% ──
        const isBreathWave = ((wave - 1) % 10 === 0 && wave > 1);
        const breathMult = isBreathWave ? 0.5 : 1.0;

        // Core melee swarm (with breath wave reduction)
        spawn('zerg_lings', Math.floor((8 + wave * 0.5) * waveMult * coopCountMult * breathMult), Math.floor((15 + wave) * coopHPMult), 170 + wave * 4, 15, 10);
        spawn('zerg_hydra', Math.floor((4 + wave * 0.3) * waveMult * coopCountMult * breathMult), Math.floor((30 + wave * 3) * coopHPMult), 100 + wave * 2, 12, 20);
        spawn('zerg_drone', Math.floor((5 + wave * 0.35) * waveMult * coopCountMult * breathMult), Math.floor((20 + wave * 2) * coopHPMult), 140 + wave * 3, 8, 15);
        spawn('zerg_roach', Math.floor((3 + wave * 0.25) * waveMult * coopCountMult * breathMult), Math.floor((60 + wave * 5) * coopHPMult), 75 + wave * 2, 25, 30);

        // Spitters from wave 5+
        if (wave >= 5) {
            const spitterCount = Math.floor((3 + wave * 0.3) * waveMult * coopCountMult * breathMult);
            this.spawnSpitter(spitterCount, wave);
        }

        // Mini-boss: Ultra every 5 waves (but NOT on boss waves — boss handles its own)
        if (isMiniBossWave && !isBossWave) {
            const ultraHp = Math.floor((120 + wave * 15) * coopHPMult);
            const ultraCount = Math.max(1, Math.floor((1 + Math.floor(wave / 15)) * coopCountMult * breathMult));
            spawn('zerg_ultra', ultraCount, ultraHp, 55, 40 + wave, 100);
        }

        // Boss wave: every 10 waves — two-phase fight
        // Phase 1: clear all normal zergs → Phase 2: boss spawns → kill boss → next wave
        if (isBossWave) {
            this._bossWaveState = 'clearing';
            this.waveTimerEvent.paused = true;  // Pause auto-spawn until boss is defeated
            this.showWaveAnnounce(`⚠ BOSS WAVE ${wave} — Clear all zergs! ⚠`);
        }

        GameData.p1Score += 25;
        GameData.p2Score += 25;
    }

    // ═══════════════════════════════════════════════════
    //  BOSS WAVE STATE MACHINE
    // ═══════════════════════════════════════════════════

    /** Check if all non-boss zergs are dead on a boss wave — trigger boss spawn */
    checkBossWaveClear() {
        if (this._bossWaveState !== 'clearing') return;
        const allDead = this.zergGroup.getChildren().every(z => !z.active || z.hp <= 0);
        if (allDead) {
            this._bossWaveState = 'boss_incoming';
            this.showWaveAnnounce('⚠ BOSS INCOMING! ⚠');
            this.playSound('wave_start');
            this.time.delayedCall(3000, () => {
                if (this._bossWaveState === 'boss_incoming') {
                    this.spawnBossWave();
                }
            });
        }
    }

    /** Spawn the boss after clearing wave zergs */
    spawnBossWave() {
        this._bossWaveState = 'boss_fight';
        const wave = GameData.waveNumber;
        // Co-op boss has +50% HP
        const bossHpMult = GameData.gameMode === 'twoPlayer' ? 1.5 : 1.0;
        // Boss HP: 10x scaling — wave 10 = 5000, wave 50 = 17000, wave 99 = 31700
        const bossHp = Math.floor((2000 + wave * 300) * bossHpMult);
        // Boss damage scales with wave
        const bossDmg = 15 + wave * 2;
        // Spread count: wave 10 = 1, wave 20 = 2, wave 30 = 3...
        const spreadCount = Math.max(1, Math.floor(wave / 10));

        const { x, y } = this.randomEdge();
        const z = this.zergGroup.create(x, y, 'zerg_ultra');
        if (!z) return;
        this.physics.world.enable(z);
        z.setDepth(8).setScale(1.3);
        z.hp = bossHp;
        z.maxHp = bossHp;
        z.setData('damage', 30);
        z.setData('rangedDamage', bossDmg);
        z.setData('type', 'ultra_boss');
        z.setData('points', 200);
        z.setData('spreadCount', spreadCount);
        z.setData('bossDmg', bossDmg);
        z._hitCooldown = {};
        z._fireTimer = 1000;
        z.body.setSize(72, 56);
        z.body.enable = true;

        this._bossZerg = z;

        const target = this.nearestTank(x, y);
        if (target) {
            const a = Phaser.Math.Angle.Between(x, y, target.x, target.y);
            z.setVelocity(Math.cos(a) * 55, Math.sin(a) * 55);
        }

        // Show boss HP bar
        document.getElementById('boss-hp-bar').style.display = 'flex';
        document.getElementById('boss-hp-fill').style.width = '100%';
        document.getElementById('boss-hp-label').textContent = `BOSS WAVE ${wave}`;

        this.showWaveAnnounce(`BOSS ENGAGED!`);
        this._alarmBeep();               // Short 3-beep alarm (replaces long sfx_boss_warning.wav)
        this.startBGM();                 // Loop boss battle music
        this.playSound('explosion_large');
        this.cameras.main.shake(200, 0.01);
    }

    /** Boss killed — clean up and resume next wave */
    onBossKilled() {
        this._bossWaveState = 'boss_down';
        const bossX = this._bossZerg ? this._bossZerg.x : 400;
        const bossY = this._bossZerg ? this._bossZerg.y : 300;
        this._bossZerg = null;

        // Hide boss HP bar
        document.getElementById('boss-hp-bar').style.display = 'none';

        // Victory announcement
        this.showWaveAnnounce('BOSS DEFEATED! ☠');
        this.stopBGM();                  // Stop boss music
        this.cameras.main.flash(300, 255, 200, 0);
        this.playSound('explosion_large');

        // Clear any remaining zergs
        const remaining = this.zergGroup.getChildren().filter(z => z.active && z.hp > 0);
        remaining.forEach(z => {
            z.hp = 0;
            this.spawnExplosion(z.x, z.y);
            z.destroy();
        });

        // ── Boss guaranteed drops ──
        this.time.delayedCall(500, () => {
            this.spawnPowerup(bossX - 30, bossY, 'damage');    // Weapon EXP (gold cannon)
            this.spawnPowerup(bossX + 30, bossY, 'nuke');      // Nuke
            this.spawnPowerup(bossX, bossY - 20, 'heal');      // Heal
        });

        // Resume wave timer after short delay
        this.time.delayedCall(2500, () => {
            if (this._matchEnding) return;
            this._bossWaveState = null;
            if (this.waveTimerEvent) this.waveTimerEvent.paused = false;
        });
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
        // ── Red Damage Boost (cannon shell icon) ──
        if (!this.textures.exists('orb_damage')) {
            const c1 = document.createElement('canvas');
            c1.width = 32; c1.height = 32;
            const ctx1 = c1.getContext('2d');
            // Glow ring
            const glow1 = ctx1.createRadialGradient(16, 16, 6, 16, 16, 16);
            glow1.addColorStop(0, 'rgba(255,60,30,0.6)');
            glow1.addColorStop(1, 'rgba(255,60,30,0)');
            ctx1.fillStyle = glow1;
            ctx1.beginPath(); ctx1.arc(16, 16, 16, 0, Math.PI * 2); ctx1.fill();
            // Shell body
            ctx1.fillStyle = '#ff3333';
            ctx1.beginPath(); ctx1.ellipse(16, 16, 7, 11, 0, 0, Math.PI * 2); ctx1.fill();
            // Shell tip
            ctx1.fillStyle = '#ffcc00';
            ctx1.beginPath(); ctx1.arc(16, 6, 4, 0, Math.PI * 2); ctx1.fill();
            // Highlight
            ctx1.fillStyle = 'rgba(255,255,255,0.5)';
            ctx1.beginPath(); ctx1.arc(14, 13, 3, 0, Math.PI * 2); ctx1.fill();
            this.textures.addCanvas('orb_damage', c1);
        }

        // ── Yellow Nuke (radiation symbol) ──
        if (!this.textures.exists('orb_nuke')) {
            const c2 = document.createElement('canvas');
            c2.width = 32; c2.height = 32;
            const ctx2 = c2.getContext('2d');
            // Glow
            const glow2 = ctx2.createRadialGradient(16, 16, 4, 16, 16, 16);
            glow2.addColorStop(0, 'rgba(255,220,40,0.8)');
            glow2.addColorStop(1, 'rgba(255,200,0,0)');
            ctx2.fillStyle = glow2;
            ctx2.beginPath(); ctx2.arc(16, 16, 16, 0, Math.PI * 2); ctx2.fill();
            // Outer ring
            ctx2.strokeStyle = '#ffcc00';
            ctx2.lineWidth = 2;
            ctx2.beginPath(); ctx2.arc(16, 16, 12, 0, Math.PI * 2); ctx2.stroke();
            // Inner dot
            ctx2.fillStyle = '#ffcc00';
            ctx2.beginPath(); ctx2.arc(16, 16, 5, 0, Math.PI * 2); ctx2.fill();
            // Segments
            for (let i = 0; i < 3; i++) {
                const a = (i * 2 * Math.PI) / 3 - Math.PI / 2;
                ctx2.fillStyle = '#ff8800';
                ctx2.beginPath();
                ctx2.moveTo(16, 16);
                ctx2.arc(16, 16, 11, a - 0.35, a + 0.35);
                ctx2.closePath();
                ctx2.fill();
            }
            // Bright center
            ctx2.fillStyle = '#fff8cc';
            ctx2.beginPath(); ctx2.arc(16, 16, 3, 0, Math.PI * 2); ctx2.fill();
            this.textures.addCanvas('orb_nuke', c2);
        }

        // ── Blue Swarm Missile (missile icon — replaces shield) ──
        if (!this.textures.exists('orb_swarm')) {
            const c3 = document.createElement('canvas');
            c3.width = 32; c3.height = 32;
            const ctx3 = c3.getContext('2d');
            // Glow
            const glow3 = ctx3.createRadialGradient(16, 16, 5, 16, 16, 16);
            glow3.addColorStop(0, 'rgba(60,140,255,0.7)');
            glow3.addColorStop(1, 'rgba(60,140,255,0)');
            ctx3.fillStyle = glow3;
            ctx3.beginPath(); ctx3.arc(16, 16, 16, 0, Math.PI * 2); ctx3.fill();
            // Missile body (diagonal up-right)
            ctx3.save();
            ctx3.translate(16, 16);
            ctx3.rotate(-Math.PI / 4);
            ctx3.fillStyle = '#4488ff';
            ctx3.fillRect(-5, -10, 10, 20);
            // Nose cone
            ctx3.fillStyle = '#ff4400';
            ctx3.beginPath(); ctx3.moveTo(-5, -10); ctx3.lineTo(5, -10); ctx3.lineTo(0, -16); ctx3.closePath(); ctx3.fill();
            // Fins
            ctx3.fillStyle = '#2266cc';
            ctx3.beginPath(); ctx3.moveTo(-5, 5); ctx3.lineTo(-11, 9); ctx3.lineTo(-5, 9); ctx3.closePath(); ctx3.fill();
            ctx3.beginPath(); ctx3.moveTo(5, 5); ctx3.lineTo(11, 9); ctx3.lineTo(5, 9); ctx3.closePath(); ctx3.fill();
            // Exhaust flame
            const flameGrad = ctx3.createLinearGradient(0, 8, 0, 16);
            flameGrad.addColorStop(0, '#ffcc00');
            flameGrad.addColorStop(1, 'rgba(255,100,0,0)');
            ctx3.fillStyle = flameGrad;
            ctx3.beginPath(); ctx3.moveTo(-3, 10); ctx3.lineTo(3, 10); ctx3.lineTo(0, 16); ctx3.closePath(); ctx3.fill();
            // Highlight
            ctx3.fillStyle = 'rgba(255,255,255,0.3)';
            ctx3.fillRect(-3, -8, 2, 12);
            ctx3.restore();
            this.textures.addCanvas('orb_swarm', c3);
        }

        // ── Green Heal (cross icon) ──
        if (!this.textures.exists('orb_heal')) {
            const c4 = document.createElement('canvas');
            c4.width = 32; c4.height = 32;
            const ctx4 = c4.getContext('2d');
            // Glow
            const glow4 = ctx4.createRadialGradient(16, 16, 5, 16, 16, 16);
            glow4.addColorStop(0, 'rgba(60,255,80,0.7)');
            glow4.addColorStop(1, 'rgba(60,255,80,0)');
            ctx4.fillStyle = glow4;
            ctx4.beginPath(); ctx4.arc(16, 16, 16, 0, Math.PI * 2); ctx4.fill();
            // Green cross
            ctx4.fillStyle = '#44ff44';
            ctx4.fillRect(10, 4, 12, 24);  // vertical bar
            ctx4.fillRect(4, 10, 24, 12);  // horizontal bar
            // Highlight
            ctx4.fillStyle = 'rgba(255,255,255,0.4)';
            ctx4.fillRect(11, 4, 4, 24);
            ctx4.fillRect(4, 11, 24, 4);
            this.textures.addCanvas('orb_heal', c4);
        }
    }

    generateEnemyBulletTexture() {
        if (this.textures.exists('enemy_bullet')) return;
        const canvas = document.createElement('canvas');
        canvas.width = 12; canvas.height = 12;
        const ctx = canvas.getContext('2d');
        const cx = 6, cy = 6;
        const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, 6);
        grad.addColorStop(0, 'rgba(200,255,60,0.95)');
        grad.addColorStop(0.4, '#88cc00');
        grad.addColorStop(0.8, 'rgba(80,160,20,0.6)');
        grad.addColorStop(1, 'rgba(40,100,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
        // Bright core
        ctx.fillStyle = '#eeff88';
        ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
        this.textures.addCanvas('enemy_bullet', canvas);
    }

    generateSwarmMissileTexture() {
        if (this.textures.exists('swarm_missile')) return;
        const canvas = document.createElement('canvas');
        canvas.width = 16; canvas.height = 20;
        const ctx = canvas.getContext('2d');
        // Missile body
        ctx.fillStyle = '#ff6600';
        ctx.fillRect(5, 2, 6, 14);
        // Nose
        ctx.fillStyle = '#ff3300';
        ctx.beginPath(); ctx.moveTo(5, 2); ctx.lineTo(11, 2); ctx.lineTo(8, -2); ctx.closePath(); ctx.fill();
        // Fins
        ctx.fillStyle = '#cc4400';
        ctx.beginPath(); ctx.moveTo(5, 12); ctx.lineTo(2, 17); ctx.lineTo(5, 14); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(11, 12); ctx.lineTo(14, 17); ctx.lineTo(11, 14); ctx.closePath(); ctx.fill();
        // Flame
        const flame = ctx.createLinearGradient(0, 14, 0, 22);
        flame.addColorStop(0, '#ffcc00'); flame.addColorStop(1, 'rgba(255,100,0,0)');
        ctx.fillStyle = flame;
        ctx.beginPath(); ctx.moveTo(5, 14); ctx.lineTo(11, 14); ctx.lineTo(8, 20); ctx.closePath(); ctx.fill();
        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(6, 3, 2, 10);
        this.textures.addCanvas('swarm_missile', canvas);
    }

    spawnPowerup(x, y, forcedType) {
        const types = ['damage', 'swarm', 'nuke', 'heal'];
        const type = forcedType || types[Phaser.Math.Between(0, types.length - 1)];
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
            case 'heal':
                tank.hp = Math.min(tank.maxHp, tank.hp + 30);
                this.showFloatingText(tank.x, tank.y - 24, '+30 HP', '#44ff44');
                break;
            case 'damage':
                // Weapon evolution: collect exp to level up (1→5)
                tank.weaponExp = (tank.weaponExp || 0) + 1;
                const table = tank._weaponExpTable || [0, 3, 6, 11, 19];
                const currentLevel = tank.weaponLevel || 1;

                // Check if we can level up
                if (currentLevel < 5 && tank.weaponExp >= table[currentLevel]) {
                    tank.weaponLevel = currentLevel + 1;
                    tank.weaponNextExp = table[currentLevel + 1] || 999;
                    const levelNames = ['', 'DUAL CANNON', 'SPREAD SHOT', 'PIERCE CANNON', 'MAX LASER'];
                    this.showFloatingText(tank.x, tank.y - 30, `⬆ ${levelNames[tank.weaponLevel]}!`, '#ff8844');
                } else if (currentLevel < 5) {
                    const needed = table[currentLevel] - tank.weaponExp;
                    this.showFloatingText(tank.x, tank.y - 24, `EXP +1 (${needed} to Lv${currentLevel + 1})`, '#ffaa44');
                } else {
                    this.showFloatingText(tank.x, tank.y - 24, 'WEAPON MAX!', '#ff4400');
                }
                break;
            case 'swarm':
                // Swarm missile launcher — 15s of auto-tracking missiles
                tank.swarmTimer = 15000;
                tank.swarmActive = true;
                tank._swarmFireTimer = 0;
                this.showFloatingText(tank.x, tank.y - 24, 'SWARM MISSILES!', '#4488ff');
                break;
            case 'nuke':
                if ((tank.nukeCharges || 0) < (tank.maxNukes || 3)) {
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
        // Kill all on-screen zerg (nuke-killed zergs drop no power-ups — no chain reaction)
        const zergs = this.zergGroup.getChildren();
        for (const z of zergs) {
            if (!z.active || z.hp <= 0) continue;
            z.setData('lastHitBy', player);
            z._nuked = true;  // Flag to prevent power-up drops
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
    //  SURVIVAL TIMER (counts UP from 0)
    // ═══════════════════════════════════════════════════

    onSurvivalTick() {
        if (this.paused) return;
        GameData.survivalTime++;
    }

    endMatch(result) {
        if (this._matchEnding) return;
        this._matchEnding = true;
        this.stopBGM();
        this.survivalTimerEvent?.destroy();
        this.waveTimerEvent?.destroy();
        this.shieldRegenEvent?.destroy();

        // Capture final stats before cleanup
        const p1 = this.tank1;
        const p2 = this.tank2;
        const survivalSec = GameData.survivalTime || 0;
        const survivalStr = `${Math.floor(survivalSec / 60)}:${(survivalSec % 60).toString().padStart(2, '0')}`;

        const stats = {
            p1: p1 ? {
                name: GameData.p1Name,
                kills: p1.kills || 0,
                maxStreak: p1.maxStreak || 0,
                weaponLevel: p1.weaponLevel || 1,
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
                weaponLevel: p2.weaponLevel || 1,
                nukes: p2.nukeCharges || 0,
                score: GameData.p2Score,
                alive: p2.alive,
                hp: Math.max(0, p2.hp || 0),
                shield: p2.shield || 0,
            } : null,
            waves: GameData.waveNumber,
            survivalTime: survivalStr,
            survivalSec: survivalSec,
            mode: GameData.gameMode,
        };

        // Tech points earned this run — per-player independent settlement
        const p1Kills = p1 ? (p1.kills || 0) : 0;
        const p2Kills = p2 ? (p2.kills || 0) : 0;
        const p1Earned = Math.floor(stats.waves * p1Kills / 10);
        const p2Earned = (GameData.gameMode === 'twoPlayer') ? Math.floor(stats.waves * p2Kills / 10) : 0;

        if (window.getTechTree) {
            window.getTechTree('p1').techPoints += p1Earned;
            window.saveTechTree('p1');
            if (GameData.gameMode === 'twoPlayer') {
                window.getTechTree('p2').techPoints += p2Earned;
                window.saveTechTree('p2');
            }
        }
        const totalP1 = window.getTechTree ? window.getTechTree('p1').techPoints : p1Earned;
        const totalP2 = window.getTechTree ? window.getTechTree('p2').techPoints : p2Earned;

        document.getElementById('hud').style.display = 'none';

        const overlay = document.getElementById('gameover-overlay');
        const title = document.getElementById('gameover-title');
        const statsEl = document.getElementById('gameover-stats');

        // Row helpers
        const singleRow = (label, val) =>
            `<tr><td class="stat-label">${label}</td><td class="stat-p1">${val !== null && val !== undefined ? val : '—'}</td></tr>`;
        const coopRow = (label, p1Val, p2Val) => {
            const p1s = p1Val !== null && p1Val !== undefined ? String(p1Val) : '—';
            const p2s = p2Val !== null && p2Val !== undefined ? String(p2Val) : '—';
            return `<tr><td class="stat-label">${label}</td><td class="stat-p1">${p1s}</td><td class="stat-p2">${p2s}</td></tr>`;
        };

        if (result === 'single_lose') {
            // Single player death → leaderboard
            title.textContent = `💀 ${GameData.p1Name} DEFEATED!`;
            title.style.color = '#ff2222';
            const weaponNames = ['', 'Basic', 'Dual', 'Spread', 'Pierce', 'MAX'];
            statsEl.innerHTML = `
                <p style="font-size:18px;margin-bottom:12px;">The Zerg overran your defenses</p>
                <table class="score-table">
                    <tr><th>Stat</th><th>Value</th></tr>
                    ${singleRow('Survival Time', stats.survivalTime)}
                    ${singleRow('Waves Survived', stats.waves)}
                    ${singleRow('Kills', stats.p1.kills)}
                    ${singleRow('Max Streak', stats.p1.maxStreak)}
                    ${singleRow('Weapon Lv', weaponNames[stats.p1.weaponLevel] + ' Lv' + stats.p1.weaponLevel)}
                    ${singleRow('Nukes Held', stats.p1.nukes)}
                    ${singleRow('Final Score', stats.p1.score)}
                </table>
                <p style="font-size:16px;color:#ffcc00;margin-top:12px;">🔬 Tech Points Earned: +${p1Earned}</p>
                <p style="font-size:14px;color:#aaa;">(Wave ${stats.waves} × ${p1Kills} kills / 10)</p>
                <p style="font-size:14px;color:#c9a44c;">Total (P1): ${totalP1} pts</p>
            `;
        } else {
            // Two-player co-op: both dead → leaderboard
            const p1AliveTag = stats.p1.alive ? ' ✅' : ' 💀';
            const p2AliveTag = stats.p2.alive ? ' ✅' : ' 💀';
            const bothDead = !stats.p1.alive && !stats.p2.alive;

            if (bothDead) {
                title.textContent = '💀 ANNIHILATED!';
                title.style.color = '#ff2222';
            } else if (stats.p1.alive && stats.p2.alive) {
                title.textContent = '⚔️ MATCH ENDED';
                title.style.color = '#ffcc00';
            } else {
                title.textContent = '💀 TANK DOWN!';
                title.style.color = '#ff8844';
            }

            statsEl.innerHTML = `
                <p style="font-size:18px;margin-bottom:8px;">Survival Time: ${stats.survivalTime}</p>
                <table class="score-table">
                    <tr><th>Stat</th><th class="stat-p1">${stats.p1.name}${p1AliveTag}</th><th class="stat-p2">${stats.p2.name}${p2AliveTag}</th></tr>
                    ${coopRow('Kills', stats.p1.kills, stats.p2.kills)}
                    ${coopRow('Max Streak', stats.p1.maxStreak, stats.p2.maxStreak)}
                    ${coopRow('Waves Faced', stats.waves, stats.waves)}
                    ${coopRow('Weapon Lv', weaponNames[stats.p1.weaponLevel] + ' Lv' + stats.p1.weaponLevel, weaponNames[stats.p2.weaponLevel] + ' Lv' + stats.p2.weaponLevel)}
                    ${coopRow('Nukes Held', stats.p1.nukes, stats.p2.nukes)}
                    ${coopRow('HP Remaining', stats.p1.hp, stats.p2.hp)}
                    ${coopRow('Shield', stats.p1.shield, stats.p2.shield)}
                    ${coopRow('Final Score', stats.p1.score, stats.p2.score)}
                </table>
                <p style="font-size:16px;color:#ffcc00;margin-top:12px;">🔬 P1 Tech Points: +${p1Earned} (Total: ${totalP1})</p>
                <p style="font-size:16px;color:#ffcc00;">🔬 P2 Tech Points: +${p2Earned} (Total: ${totalP2})</p>
                <p style="font-size:14px;color:#aaa;">(Wave ${stats.waves} — P1: ${p1Kills} kills, P2: ${p2Kills} kills)</p>
            `;
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
        // In co-op, check if both dead → end match
        if (GameData.gameMode === 'twoPlayer') {
            const bothDead = !this.tank1.alive && !this.tank2.alive;
            if (bothDead && !this._matchEnding) {
                this.endMatch('twoPlayer');
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
            if (this._bossWaveState === 'boss_fight') this.startBGM();
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
            s('p2-score', '');
        }
        s('wave-display', `WAVE ${GameData.waveNumber}`);

        // Survival time counting UP from 0
        const surv = GameData.survivalTime || 0;
        const m = Math.floor(surv / 60);
        const sec = surv % 60;
        s('timer-display', `${m}:${sec.toString().padStart(2, '0')}`);

        // Show game mode
        if (GameData.gameMode === 'twoPlayer') {
            s('round-display', 'CO-OP SURVIVAL');
        } else {
            s('round-display', 'SOLO SURVIVAL');
        }

        // Per-player Nuke count + Swarm timer
        const p1Nukes = this.tank1 ? (this.tank1.nukeCharges || 0) : 0;
        const p1Swarm = this.tank1 ? Math.ceil((this.tank1.swarmTimer || 0) / 1000) : 0;
        s('p1-nuke', `☢ x${p1Nukes}`);
        s('p1-swarm', p1Swarm > 0 ? `🚀 ${p1Swarm}s` : '');

        if (GameData.gameMode === 'twoPlayer') {
            const p2Nukes = this.tank2 ? (this.tank2.nukeCharges || 0) : 0;
            const p2Swarm = this.tank2 ? Math.ceil((this.tank2.swarmTimer || 0) / 1000) : 0;
            s('p2-nuke', `☢ x${p2Nukes}`);
            s('p2-swarm', p2Swarm > 0 ? `🚀 ${p2Swarm}s` : '');
            // Simplified center display — just wave info, no duplication
            s('nuke-display', '');
        } else {
            const p2Nukes = this.tank2 ? (this.tank2.nukeCharges || 0) : 0;
            s('p2-nuke', '');
            s('p2-swarm', '');
            s('nuke-display', '');  // cleaned up — info now on player panels
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

        // Enemy bullet bodies (red)
        this.enemyBullets.getChildren().forEach(b => {
            if (!b.active || !b.body) return;
            this.debugGfx.lineStyle(1, 0xff0000, 0.6);
            this.debugGfx.strokeRect(b.body.x, b.body.y, b.body.width, b.body.height);
        });
    }
}
