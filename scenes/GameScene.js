/**
 * GameScene — Main gameplay. Handles tanks, zerg, bullets, waves, collisions, scoring.
 *
 * Player ID convention: 'p1' / 'p2' (string, used everywhere consistently)
 */
export class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
    }

    create(data) {
        // Reset round state
        GameData.waveNumber = 0;
        GameData.roundTimer = 180;

        // Show HUD
        document.getElementById('hud').style.display = 'block';
        document.getElementById('wave-announce').style.display = 'none';
        document.getElementById('gameover-overlay').style.display = 'none';

        // Split screen
        if (GameData.displayMode === 'split') {
            this.cameras.main.setViewport(0, 0, 400, 600);
            if (!this.cameras.cameras[1]) {
                this.cameras.add(400, 0, 400, 600);
            }
            this.cameras.cameras[1].setScrollFactor(0);
        }

        // Background
        this.bg = this.add.tileSprite(400, 300, 800, 600, 'bg_starfield');

        // --- Create tanks (player ID is 'p1'/'p2' string) ---
        this.tank1 = this.createTank(150, 300, 'tank_p1', 'p1');
        this.tank2 = this.createTank(650, 300, 'tank_p2', 'p2');

        // --- Bullet pools ---
        this.bulletsP1 = this.physics.add.group({ maxSize: 30, runChildUpdate: true });
        this.bulletsP2 = this.physics.add.group({ maxSize: 30, runChildUpdate: true });

        // --- Zerg group (NO self-collision — zerg overlap each other) ---
        this.zergGroup = this.physics.add.group();

        // --- Particles ---
        this.emitter = this.add.particles(0, 0, 'explosion', {
            speed: { min: 50, max: 150 },
            scale: { start: 0.6, end: 0 },
            alpha: { start: 1, end: 0 },
            lifespan: 400,
            emitting: false,
            tint: [0xff4400, 0xffaa00, 0xff2200],
        });

        // --- Collisions ---
        this.setupCollisions();

        // --- Input ---
        this.keys = this.input.keyboard.addKeys({
            p1Up: 'W', p1Down: 'S', p1Left: 'A', p1Right: 'D',
            p1Fire: 'SPACE', p1Burst: 'SHIFT', p1Shield: 'E',
            p2Up: 'UP', p2Down: 'DOWN', p2Left: 'LEFT', p2Right: 'RIGHT',
            p2Fire: 'ENTER', p2Burst: 'RSHIFT', p2Shield: 'I',
            escape: 'ESCAPE',
        });

        // --- Timers ---
        this.roundTimerEvent = this.time.addEvent({
            delay: 1000, callback: this.onRoundTick, callbackScope: this, loop: true,
        });
        this.waveTimerEvent = this.time.addEvent({
            delay: 15000, callback: this.spawnWave, callbackScope: this, loop: true,
        });
        this.shieldRegenEvent = this.time.addEvent({
            delay: 1000, callback: this.regenShields, callbackScope: this, loop: true,
        });

        // --- Create animations ---
        this.createAnimIfNeeded('zerg_lings', 'walk_zerg_lings', 6);
        this.createAnimIfNeeded('zerg_roach', 'walk_zerg_roach', 6);
        this.createAnimIfNeeded('zerg_hydra', 'fly_zerg_hydra', 4);
        this.createAnimIfNeeded('zerg_drone', 'fly_zerg_drone', 4);
        this.createAnimIfNeeded('zerg_ultra', 'stomp_zerg_ultra', 3);

        // --- State ---
        this.paused = false;
        this._roundEnding = false;
        this._debugOnce = true;

        // Initial wave
        this.time.delayedCall(2000, () => this.spawnWave());

        this.showWaveAnnounce(`ROUND ${GameData.currentRound}`);
        this.updateHUD();
    }

    createTank(x, y, texture, playerId) {
        const tank = this.physics.add.sprite(x, y, texture);
        tank.setCollideWorldBounds(true);
        tank.setScale(1.2);
        tank.setDepth(10);
        tank.player = playerId;       // 'p1' or 'p2'
        tank.hp = 100;
        tank.maxHp = 100;
        tank.shield = 0;
        tank.maxShield = 30;
        tank.invincible = 1500;       // 1.5s spawn protection
        tank.alive = true;
        tank.score = 0;
        tank.kills = 0;
        tank.streak = 0;
        tank.maxStreak = 0;

        tank.hpBar = this.add.graphics().setDepth(11);
        tank.shieldBar = this.add.graphics().setDepth(11);

        return tank;
    }

    setupCollisions() {
        // NOTE: NO zerg-zerg collider — they overlap to reach tanks
        this.physics.add.overlap(this.bulletsP1, this.zergGroup, this.bulletHitZerg, null, this);
        this.physics.add.overlap(this.bulletsP2, this.zergGroup, this.bulletHitZerg, null, this);
        this.physics.add.overlap(this.zergGroup, this.tank1, this.zergHitTank, null, this);
        this.physics.add.overlap(this.zergGroup, this.tank2, this.zergHitTank, null, this);
        this.physics.add.overlap(this.bulletsP1, this.tank2, this.bulletHitEnemy, null, this);
        this.physics.add.overlap(this.bulletsP2, this.tank1, this.bulletHitEnemy, null, this);
    }

    update(_time, delta) {
        if (this.paused) return;

        const dt = delta / 1000;
        this.bg.tilePositionX -= 20 * dt;

        this.handleTank(this.tank1, this.keys, 'p1', delta);
        this.handleTank(this.tank2, this.keys, 'p2', delta);

        this.drawHPBars();
        this.updateHUD();

        // Pause
        if (Phaser.Input.Keyboard.JustDown(this.keys.escape)) {
            this.togglePause();
        }

        // Death check
        if (this.tank1.hp <= 0 && this.tank1.alive) {
            this.tank1.alive = false;
            this.onTankDeath(this.tank1, 'p1');
            GameData.p2RoundsWon++;
        }
        if (this.tank2.hp <= 0 && this.tank2.alive) {
            this.tank2.alive = false;
            this.onTankDeath(this.tank2, 'p2');
            GameData.p1RoundsWon++;
        }

        // Round end
        if (!this.tank1.alive || !this.tank2.alive || GameData.roundTimer <= 0) {
            this.endRound();
        }
    }

    /** Handle movement + shooting for one tank */
    handleTank(tank, keys, player, delta) {
        if (!tank || !tank.alive) return;

        const speed = 200;
        let vx = 0, vy = 0;

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

        // Diagonal normalization
        if (vx !== 0 && vy !== 0) {
            vx *= 0.707;
            vy *= 0.707;
        }
        tank.setVelocity(vx, vy);

        // Face movement direction
        if (vx !== 0 || vy !== 0) {
            tank.rotation = Math.atan2(vy, vx);
        }

        // Cooldowns
        tank._fireTimer = Math.max(0, (tank._fireTimer || 0) - delta);
        tank._burstTimer = Math.max(0, (tank._burstTimer || 0) - delta);

        // Main fire
        const fireKey = player === 'p1' ? keys.p1Fire : keys.p2Fire;
        if (fireKey.isDown && (tank._fireTimer || 0) <= 0) {
            this.fireBullet(tank, player === 'p1' ? this.bulletsP1 : this.bulletsP2, player);
            tank._fireTimer = 500;
            this.playSound(player === 'p1' ? 'fire_red' : 'fire_blue');
        }

        // Burst fire (costs shield)
        const burstKey = player === 'p1' ? keys.p1Burst : keys.p2Burst;
        if (burstKey.isDown && (tank._burstTimer || 0) <= 0 && tank.shield >= 5) {
            this.fireBurst(tank, player);
            tank._burstTimer = 200;
            tank.shield = Math.max(0, tank.shield - 5);
            this.playSound('burst');
        }

        // Shield boost
        const shieldKey = player === 'p1' ? keys.p1Shield : keys.p2Shield;
        if (Phaser.Input.Keyboard.JustDown(shieldKey) && tank.shield < tank.maxShield) {
            tank.shield = Math.min(tank.maxShield, tank.shield + 15);
            tank.invincible = Math.max(tank.invincible, 500);
            this.playSound('shield');
            const color = player === 'p1' ? [100, 200, 255] : [100, 150, 255];
            this.cameras.main.flash(200, ...color, false);
        }

        // Invincibility countdown
        if (tank.invincible > 0) tank.invincible -= delta;
    }

    fireBullet(tank, bulletGroup, player) {
        const tex = player === 'p1' ? 'bullet_red' : 'bullet_blue';
        const bullet = bulletGroup.get(tank.x, tank.y, tex);
        if (!bullet) return;

        const angle = tank.rotation;
        const speed = 400;
        const damage = 15;

        bullet.setData('damage', damage);
        bullet.setData('owner', player);   // 'p1' or 'p2'
        bullet.setActive(true).setVisible(true);
        bullet.setPosition(tank.x + Math.cos(angle) * 20, tank.y + Math.sin(angle) * 20);
        bullet.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
        bullet.setDepth(5);

        // Auto-deactivate after 3s
        this.time.delayedCall(3000, () => {
            if (bullet.active) {
                bullet.setActive(false).setVisible(false);
                bullet.body.stop();
            }
        });

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

            bullet.setData('damage', 8);
            bullet.setData('owner', player);
            bullet.setActive(true).setVisible(true);
            bullet.setPosition(tank.x + Math.cos(angle) * 20, tank.y + Math.sin(angle) * 20);
            bullet.setVelocity(Math.cos(angle) * 350, Math.sin(angle) * 350);
            bullet.setDepth(5);

            this.time.delayedCall(3000, () => {
                if (bullet.active) {
                    bullet.setActive(false).setVisible(false);
                    bullet.body.stop();
                }
            });
        }
    }

    // --- COLLISION HANDLERS ---

    bulletHitZerg(bullet, zerg) {
        if (!bullet.active || !zerg.active || zerg.hp === undefined) return;

        const damage = bullet.getData('damage') || 15;
        const owner = bullet.getData('owner') || 'p1';
        zerg.hp -= damage;
        // Track who actually damaged this zerg (for kill credit)
        zerg.setData('lastHitBy', owner);

        bullet.setActive(false).setVisible(false);
        bullet.body.stop();
        this.spawnHitEffect(zerg.x, zerg.y, 0x44ff44);

        if (zerg.hp <= 0) {
            this.destroyZerg(zerg);
        }
    }

    bulletHitEnemy(bullet, tank) {
        if (!bullet.active || !tank.alive || tank.hp === undefined) return;

        const owner = bullet.getData('owner');        // 'p1' or 'p2'
        // Guard: bullet owner same as tank → friendly fire, skip
        if (owner === tank.player) return;

        const damage = bullet.getData('damage') || 15;
        let remaining = damage;

        // Shield absorbs
        if (tank.shield > 0) {
            const absorbed = Math.min(tank.shield, remaining);
            tank.shield -= absorbed;
            remaining -= absorbed;
        }

        // HP damage (skip if invincible)
        if (remaining > 0 && (tank.invincible || 0) <= 0) {
            tank.hp -= remaining;
            tank.hp = Math.max(0, tank.hp);

            this.cameras.main.shake(100, 0.01);
            this.spawnHitEffect(tank.x, tank.y, 0xff4400);
        }

        bullet.setActive(false).setVisible(false);
        bullet.body.stop();

        // Attacker score — owner is 'p1' or 'p2'
        const attacker = owner === 'p1' ? this.tank1 : this.tank2;
        if (attacker && attacker.alive) {
            attacker.score += Math.ceil(damage / 10) * 5;
        }
    }

    zergHitTank(zerg, tank) {
        if (!tank.alive || tank.hp === undefined) return;
        if ((tank.invincible || 0) > 0) return;

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

        // Knockback
        const angle = Phaser.Math.Angle.Between(zerg.x, zerg.y, tank.x, tank.y);
        tank.setVelocity(Math.cos(angle) * 100, Math.sin(angle) * 100);

        this.spawnHitEffect(tank.x, tank.y, 0xff2200);
    }

    destroyZerg(zerg) {
        const points = zerg.getData('points') || 10;
        // Use actual last hitter for credit, not random
        const killer = zerg.getData('lastHitBy') || 'p1';

        this.spawnExplosion(zerg.x, zerg.y);
        zerg.destroy();

        const attacker = killer === 'p1' ? this.tank1 : this.tank2;
        if (attacker && attacker.alive) {
            attacker.score += points;
            attacker.kills = (attacker.kills || 0) + 1;

            // Streak tracking
            const otherTank = killer === 'p1' ? this.tank2 : this.tank1;
            if (otherTank) otherTank.streak = 0;
            attacker.streak = (attacker.streak || 0) + 1;
            if (attacker.streak > (attacker.maxStreak || 0)) attacker.maxStreak = attacker.streak;
            if (attacker.streak % 10 === 0) attacker.score += 50;
        }
    }

    onTankDeath(tank, playerId) {
        this.spawnExplosion(tank.x, tank.y);
        tank.setVisible(false);
        if (tank.hpBar) tank.hpBar.destroy();
        if (tank.shieldBar) tank.shieldBar.destroy();
        this.playSound('explosion_large');
        this.cameras.main.flash(500, 255, 0, 0);
    }

    spawnExplosion(x, y) {
        this.emitter.explode(8, x, y);
        this.cameras.main.shake(150, 0.02);
    }

    spawnHitEffect(x, y) {
        this.emitter.explode(2, x, y);
    }

    // --- Wave spawning ---
    spawnWave() {
        GameData.waveNumber++;
        const wave = GameData.waveNumber;
        this.showWaveAnnounce(`WAVE ${wave}`);

        const spawn = (tex, count, hp, spd, dmg, pts) => {
            for (let i = 0; i < count; i++) {
                const { x, y } = this.randomEdge();
                const z = this.zergGroup.create(x, y, tex);
                if (!z) continue;
                z.setDepth(8);
                z.hp = hp;
                z.setData('damage', dmg);
                z.setData('points', pts);

                // Move toward nearest tank
                const target = this.nearestTank(x, y);
                if (target) {
                    const angle = Phaser.Math.Angle.Between(x, y, target.x, target.y);
                    z.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
                }

                // Walk/fly animation
                const animKey = (tex === 'zerg_lings' || tex === 'zerg_roach') ? 'walk_' + tex :
                                (tex === 'zerg_hydra' || tex === 'zerg_drone') ? 'fly_' + tex :
                                (tex === 'zerg_ultra') ? 'stomp_' + tex : null;
                if (animKey && this.anims.exists(animKey)) {
                    z.play(animKey);
                }

                // Re-target periodically
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

        if (wave === 1) spawn('zerg_lings', 4, 20, 150, 10, 10);
        else if (wave === 2) { spawn('zerg_lings', 3, 20, 150, 10, 10); spawn('zerg_hydra', 2, 40, 80, 8, 20); }
        else if (wave === 3) { spawn('zerg_lings', 3, 20, 150, 10, 10); spawn('zerg_hydra', 2, 40, 80, 8, 20); spawn('zerg_drone', 3, 30, 120, 5, 15); }
        else if (wave % 5 === 0) {
            spawn('zerg_lings', 3, 20, 150, 10, 10);
            spawn('zerg_hydra', 2, 40, 80, 8, 20);
            spawn('zerg_drone', 3, 30, 120, 5, 15);
            spawn('zerg_roach', 2, 80, 60, 20, 30);
            spawn('zerg_ultra', 1, 150, 40, 30, 100);
        } else if (wave <= 5) {
            spawn('zerg_lings', 3, 20, 150, 10, 10);
            spawn('zerg_hydra', 2, 40, 80, 8, 20);
            spawn('zerg_drone', 3, 30, 120, 5, 15);
            spawn('zerg_roach', Math.floor(wave / 2), 80, 60, 20, 30);
        } else {
            const scale = Math.floor((wave - 5) / 2) + 1;
            spawn('zerg_lings', 3, 20, 150, 10, 10);
            spawn('zerg_hydra', 2, 40, 80, 8, 20);
            spawn('zerg_drone', 3, 30, 120, 5, 15);
            spawn('zerg_roach', Math.min(scale * 2, 6), 80, 60, 20, 30);
            if (wave % 3 === 0) spawn('zerg_ultra', 1, 150, 40, 30, 100);
        }

        // Survival bonus
        GameData.p1Score += 25;
        GameData.p2Score += 25;
    }

    randomEdge() {
        const side = Phaser.Math.Between(0, 3);
        switch (side) {
            case 0: return { x: Phaser.Math.Between(0, 800), y: -20 };
            case 1: return { x: 820, y: Phaser.Math.Between(0, 600) };
            case 2: return { x: Phaser.Math.Between(0, 800), y: 620 };
            default: return { x: -20, y: Phaser.Math.Between(0, 600) };
        }
    }

    nearestTank(x, y) {
        const t1 = this.tank1 && this.tank1.alive ? this.tank1 : null;
        const t2 = this.tank2 && this.tank2.alive ? this.tank2 : null;
        if (!t1 && !t2) return null;
        if (!t1) return t2;
        if (!t2) return t1;
        const d1 = Phaser.Math.Distance.Between(x, y, t1.x, t1.y);
        const d2 = Phaser.Math.Distance.Between(x, y, t2.x, t2.y);
        return d1 < d2 ? t1 : t2;
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
        [this.tank1, this.tank2].forEach(tank => {
            if (tank && tank.alive && tank.shield < tank.maxShield) {
                tank.shield = Math.min(tank.maxShield, tank.shield + 1);
            }
        });
    }

    onRoundTick() {
        if (this.paused) return;
        GameData.roundTimer--;
        if (GameData.roundTimer <= 0) this.endRound();
    }

    endRound() {
        if (this._roundEnding) return;
        this._roundEnding = true;

        this.roundTimerEvent.destroy();
        this.waveTimerEvent.destroy();
        this.shieldRegenEvent.destroy();

        if (this.tank1) GameData.p1Score += this.tank1.score || 0;
        if (this.tank2) GameData.p2Score += this.tank2.score || 0;

        if (GameData.p1RoundsWon >= 2 || GameData.p2RoundsWon >= 2 || GameData.currentRound >= 3) {
            this.endMatch();
        } else {
            this.time.delayedCall(2000, () => this.startNewRound());
        }
    }

    startNewRound() {
        GameData.currentRound++;
        GameData.waveNumber = 0;
        GameData.roundTimer = 180;
        this._roundEnding = false;

        this.zergGroup.clear(true, true);

        [this.tank1, this.tank2].forEach(tank => {
            if (!tank) return;
            tank.setPosition(tank.player === 'p1' ? 150 : 650, 300);
            tank.setActive(true).setVisible(true);
            tank.alive = true;
            tank.hp = 100;
            tank.shield = 0;
            tank.invincible = 1500;
            tank.score = 0;
            tank.kills = 0;
            tank.streak = 0;
            tank._fireTimer = 0;
            tank._burstTimer = 0;
            if (tank.hpBar) tank.hpBar.clear();
            if (tank.shieldBar) tank.shieldBar.clear();
        });

        this.roundTimerEvent = this.time.addEvent({
            delay: 1000, callback: this.onRoundTick, callbackScope: this, loop: true,
        });
        this.waveTimerEvent = this.time.addEvent({
            delay: 15000, callback: this.spawnWave, callbackScope: this, loop: true,
        });
        this.shieldRegenEvent = this.time.addEvent({
            delay: 1000, callback: this.regenShields, callbackScope: this, loop: true,
        });

        // Spawn first wave earlier in new round
        this.time.delayedCall(2000, () => this.spawnWave());

        this.showWaveAnnounce(`ROUND ${GameData.currentRound}`);
        this.updateHUD();
    }

    endMatch() {
        this.roundTimerEvent?.destroy();
        this.waveTimerEvent?.destroy();
        this.shieldRegenEvent?.destroy();

        document.getElementById('hud').style.display = 'none';

        const overlay = document.getElementById('gameover-overlay');
        const title = document.getElementById('gameover-title');
        const stats = document.getElementById('gameover-stats');

        let winner, color;
        if (GameData.p1RoundsWon > GameData.p2RoundsWon) {
            winner = `🏆 ${GameData.p1Name} WINS!`; color = '#ff4444';
        } else if (GameData.p2RoundsWon > GameData.p1RoundsWon) {
            winner = `🏆 ${GameData.p2Name} WINS!`; color = '#4488ff';
        } else {
            winner = "IT'S A DRAW!"; color = '#cccccc';
        }

        title.textContent = winner;
        title.style.color = color;
        stats.innerHTML = `
            <p>Rounds: P1 [${GameData.p1RoundsWon}] — P2 [${GameData.p2RoundsWon}]</p>
            <p>Final Scores: P1 [${GameData.p1Score}] — P2 [${GameData.p2Score}]</p>
        `;

        overlay.style.display = 'flex';
    }

    forfeit(player) {
        // player is 'p1' or 'p2' — only kill the forfeiting player's tank
        const tank = player === 'p1' ? this.tank1 : this.tank2;
        if (tank && tank.alive) {
            tank.hp = 0;
            tank.alive = false;
            this.onTankDeath(tank, player);
            if (player === 'p1') GameData.p2RoundsWon++;
            else GameData.p1RoundsWon++;
        }
        document.getElementById('pause-overlay').style.display = 'none';
        this.paused = false;
        this.scene.resume();
        this.endRound();
    }

    togglePause() {
        this.paused = !this.paused;
        const overlay = document.getElementById('pause-overlay');
        if (this.paused) {
            overlay.style.display = 'flex';
            this.scene.pause();
        } else {
            overlay.style.display = 'none';
            this.scene.resume();
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
        s('p2-score', `Score: ${GameData.p2Score}`);
        s('wave-display', `WAVE ${GameData.waveNumber}`);

        const m = Math.floor(GameData.roundTimer / 60);
        const sec = GameData.roundTimer % 60;
        s('timer-display', `${m}:${sec.toString().padStart(2, '0')}`);
        s('round-display', `ROUND ${GameData.currentRound} | ${GameData.p1RoundsWon} — ${GameData.p2RoundsWon}`);
    }

    drawHPBars() {
        [this.tank1, this.tank2].forEach(tank => {
            if (!tank || !tank.alive || tank.hp === undefined) return;
            const pct = tank.hp / tank.maxHp;
            const shPct = tank.shield / tank.maxShield;

            tank.hpBar.clear();
            tank.hpBar.fillStyle(0x000000, 0.7);
            tank.hpBar.fillRect(tank.x - 25, tank.y - 30, 50, 6);
            tank.hpBar.fillStyle(pct > 0.5 ? 0x44ff44 : pct > 0.25 ? 0xffaa00 : 0xff2200, 1);
            tank.hpBar.fillRect(tank.x - 25, tank.y - 30, 50 * pct, 6);

            tank.shieldBar.clear();
            tank.shieldBar.fillStyle(0x000000, 0.5);
            tank.shieldBar.fillRect(tank.x - 25, tank.y - 36, 50, 4);
            tank.shieldBar.fillStyle(0x44ddff, 1);
            tank.shieldBar.fillRect(tank.x - 25, tank.y - 36, 50 * shPct, 4);
        });
    }

    playSound(type) {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            const t = audioCtx.currentTime;

            switch (type) {
                case 'fire_red':
                    osc.frequency.value = 200; gain.gain.setValueAtTime(0.1, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1); break;
                case 'fire_blue':
                    osc.frequency.value = 300; gain.gain.setValueAtTime(0.1, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1); break;
                case 'burst':
                    osc.frequency.value = 150; gain.gain.setValueAtTime(0.08, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15); break;
                case 'shield':
                    osc.frequency.value = 800; gain.gain.setValueAtTime(0.05, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2); break;
                case 'explosion':
                    osc.type = 'sawtooth'; osc.frequency.value = 80;
                    gain.gain.setValueAtTime(0.15, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3); break;
                case 'explosion_large':
                    osc.type = 'sawtooth'; osc.frequency.value = 50;
                    gain.gain.setValueAtTime(0.2, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5); break;
                default:
                    osc.frequency.value = 440; gain.gain.setValueAtTime(0.05, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
            }
            osc.start(t);
            osc.stop(t + 0.5);
        } catch (_) { /* audio not available */ }
    }
}
