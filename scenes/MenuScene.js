/**
 * MenuScene — Title screen, player naming, and game mode selection.
 */
export class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MenuScene' });
    }

    create() {
        console.log('[MenuScene] Creating...');
        const cam = this.cameras.main;
        const cx = cam.centerX;
        const cy = cam.centerY;

        // Background
        this.add.image(cx, cy, 'bg_starfield').setAlpha(0.5);

        console.log('[MenuScene] Title text created');

        // Title
        this.add.text(cx, cy - 200, 'TANK vs ZERG', {
            fontSize: '56px',
            fontFamily: 'Courier New',
            color: '#c9a44c',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        this.add.text(cx, cy - 150, 'SIDE-SCROLLING DEFENSE', {
            fontSize: '20px',
            fontFamily: 'Courier New',
            color: '#f4ecd8',
        }).setOrigin(0.5);

        // Decorative line
        const line = this.add.graphics();
        line.lineStyle(2, 0xc9a44c, 1);
        line.lineBetween(cx - 200, cy - 120, cx + 200, cy - 120);

        // Player 1 name input
        this.add.text(cx - 200, cy - 60, 'PLAYER 1 (RED):', {
            fontSize: '18px',
            fontFamily: 'Courier New',
            color: '#ff4444',
        });
        this.p1Input = this.add.text(cx + 50, cy - 60, GameData.p1Name, {
            fontSize: '18px',
            fontFamily: 'Courier New',
            color: '#ffffff',
            backgroundColor: '#000000',
            padding: { x: 8, y: 4 },
        }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
        this.p1Input.on('pointerdown', () => this.startEditing(this.p1Input, 'p1'));

        // Player 2 name input
        this.add.text(cx - 200, cy - 20, 'PLAYER 2 (BLUE):', {
            fontSize: '18px',
            fontFamily: 'Courier New',
            color: '#4488ff',
        });
        this.p2Input = this.add.text(cx + 50, cy - 20, GameData.p2Name, {
            fontSize: '18px',
            fontFamily: 'Courier New',
            color: '#ffffff',
            backgroundColor: '#000000',
            padding: { x: 8, y: 4 },
        }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
        this.p2Input.on('pointerdown', () => this.startEditing(this.p2Input, 'p2'));

        // Mode selection
        this.add.text(cx, cy + 40, 'GAME MODE:', {
            fontSize: '16px',
            fontFamily: 'Courier New',
            color: '#aaa',
        }).setOrigin(0.5);

        // SINGLE PLAYER button (left)
        const btnSingle = this.add.container(cx - 120, cy + 75);
        const bgSingle = this.add.rectangle(0, 0, 150, 40, 0x555555).setInteractive({ useHandCursor: true });
        const txtSingle = this.add.text(0, 0, 'SINGLE PLAYER', {
            fontSize: '16px',
            fontFamily: 'Courier New',
            color: '#fff',
        }).setOrigin(0.5);
        btnSingle.add([bgSingle, txtSingle]);
        bgSingle.on('pointerdown', () => this.selectGameMode('single'));
        bgSingle.on('pointerover', () => bgSingle.setFillStyle(0x666666));
        bgSingle.on('pointerout', () => { if (GameData.gameMode !== 'single') bgSingle.setFillStyle(0x333333); else bgSingle.setFillStyle(0x555555); });

        // 2 PLAYER button (center)
        const btnTwo = this.add.container(cx, cy + 75);
        const bgTwo = this.add.rectangle(0, 0, 150, 40, 0x333333).setInteractive({ useHandCursor: true });
        const txtTwo = this.add.text(0, 0, '2 PLAYER', {
            fontSize: '16px',
            fontFamily: 'Courier New',
            color: '#aaa',
        }).setOrigin(0.5);
        btnTwo.add([bgTwo, txtTwo]);
        bgTwo.on('pointerdown', () => this.selectGameMode('twoPlayer'));
        bgTwo.on('pointerover', () => bgTwo.setFillStyle(0x444444));
        bgTwo.on('pointerout', () => { if (GameData.gameMode !== 'twoPlayer') bgTwo.setFillStyle(0x333333); else bgTwo.setFillStyle(0x555555); });

        this.btnSingle = btnSingle;
        this.btnTwo = btnTwo;

        this.displayModeBtn = this.add.text(cx + 120, cy + 75, 'SHARED ARENA', {
            fontSize: '16px',
            fontFamily: 'Courier New',
            color: '#aaa',
            backgroundColor: '#222',
            padding: { x: 12, y: 6 },
        }).setInteractive({ useHandCursor: true });
        this.displayModeBtn.on('pointerdown', () => this.selectDisplayMode());
        this.displayModeBtn.on('pointerover', () => this.displayModeBtn.setStyle({ backgroundColor: '#444' })).setOrigin(0.5);
        this.displayModeBtn.on('pointerout', () => this.displayModeBtn.setStyle({ backgroundColor: '#222' })).setOrigin(0.5);

        // Start button
        this.startBtn = this.add.text(cx, cy + 140, 'START GAME', {
            fontSize: '28px',
            fontFamily: 'Courier New',
            color: '#000',
            backgroundColor: '#c9a44c',
            padding: { x: 24, y: 10 },
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        this.startBtn.on('pointerdown', () => this.startGame());
        this.startBtn.on('pointerover', () => this.startBtn.setStyle({ backgroundColor: '#e0bc60' })).setOrigin(0.5);
        this.startBtn.on('pointerout', () => this.startBtn.setStyle({ backgroundColor: '#c9a44c' })).setOrigin(0.5);

        // Controls info
        this.add.text(cx, cy + 220, 'P1: WASD + SPACE | P2: ARROWS + ENTER | ESC: Pause', {
            fontSize: '12px',
            fontFamily: 'Courier New',
            color: '#666',
        }).setOrigin(0.5);

        // Select single player by default
        this.selectGameMode('single');

        // Store editing state
        this.editing = null;
        this.editTarget = null;

        // Default to single player
        GameData.gameMode = 'single';
    }

    selectGameMode(mode) {
        GameData.gameMode = mode;
        const bgSingle = this.btnSingle.getAt(0);
        const txtSingle = this.btnSingle.getAt(1);
        const bgTwo = this.btnTwo.getAt(0);
        const txtTwo = this.btnTwo.getAt(1);
        if (mode === 'single') {
            bgSingle.setFillStyle(0x555555);
            txtSingle.setColor('#fff');
            bgTwo.setFillStyle(0x333333);
            txtTwo.setColor('#aaa');
        } else {
            bgTwo.setFillStyle(0x555555);
            txtTwo.setColor('#fff');
            bgSingle.setFillStyle(0x333333);
            txtSingle.setColor('#aaa');
        }
    }

    selectDisplayMode() {
        if (GameData.displayMode === 'shared') {
            GameData.displayMode = 'split';
        } else {
            GameData.displayMode = 'shared';
        }
    }

    startEditing(textObj, player) {
        this.editing = player;
        this.editTarget = textObj;
        textObj.setText('_');
        this.input.keyboard.once('keydown', (event) => {
            if (event.key.length === 1 && /[a-zA-Z0-9]/.test(event.key)) {
                const newName = event.key.toUpperCase() + (player === 'p1' ? GameData.p1Name : GameData.p2Name).slice(1);
                textObj.setText(player === 'p1' ? newName : newName);
                if (player === 'p1') GameData.p1Name = newName;
                else GameData.p2Name = newName;
            }
            this.editing = null;
        });
    }

    startGame() {
        // Resume audio (needs user gesture)
        if (window.__gameAudioCtx && window.__gameAudioCtx.state === 'suspended') {
            window.__gameAudioCtx.resume().catch(() => {});
        }

        // Reset round state
        GameData.p1HP = 100;
        GameData.p2HP = 100;
        GameData.p1Shield = 0;
        GameData.p2Shield = 0;
        GameData.p1Score = 0;
        GameData.p2Score = 0;
        GameData.p1Streak = 0;
        GameData.p2Streak = 0;
        GameData.currentRound = 1;
        GameData.p1RoundsWon = 0;
        GameData.p2RoundsWon = 0;
        GameData.waveNumber = 0;
        GameData.roundTimer = 180;
        GameData.coopFailed = false;
        GameData.coopRoundsSurvived = 0;

        // Configurable: 100 rounds for both single and co-op modes
        GameData.totalRounds = GameData.gameMode === 'single' ? 100 : 100;

        this.scene.start('GameScene');
    }
}
