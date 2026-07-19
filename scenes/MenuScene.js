/**
 * MenuScene — Title screen, player naming, and game mode selection.
 */
export class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MenuScene' });
    }

    create() {
        const cam = this.cameras.main;
        const cx = cam.centerX;
        const cy = cam.centerY;

        // Background
        this.add.image(cx, cy, 'bg_starfield').setAlpha(0.5);

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
        this.add.text(cx, cy + 40, 'DISPLAY MODE:', {
            fontSize: '16px',
            fontFamily: 'Courier New',
            color: '#aaa',
        }).setOrigin(0.5);

        this.sharedBtn = this.add.text(cx - 100, cy + 75, 'SHARED ARENA', {
            fontSize: '16px',
            fontFamily: 'Courier New',
            color: '#fff',
            backgroundColor: '#333',
            padding: { x: 12, y: 6 },
        }).setInteractive({ useHandCursor: true });
        this.sharedBtn.on('pointerdown', () => this.selectMode('shared'));
        this.sharedBtn.on('pointerover', () => this.sharedBtn.setStyle({ backgroundColor: '#555' })).setOrigin(0.5);
        this.sharedBtn.on('pointerout', () => this.sharedBtn.setStyle({ backgroundColor: '#333' })).setOrigin(0.5);

        this.splitBtn = this.add.text(cx + 100, cy + 75, 'SPLIT SCREEN', {
            fontSize: '16px',
            fontFamily: 'Courier New',
            color: '#aaa',
            backgroundColor: '#222',
            padding: { x: 12, y: 6 },
        }).setInteractive({ useHandCursor: true });
        this.splitBtn.on('pointerdown', () => this.selectMode('split'));
        this.splitBtn.on('pointerover', () => this.splitBtn.setStyle({ backgroundColor: '#444' })).setOrigin(0.5);
        this.splitBtn.on('pointerout', () => this.splitBtn.setStyle({ backgroundColor: '#222' })).setOrigin(0.5);

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

        // Select shared by default
        this.selectMode('shared');

        // Store editing state
        this.editing = null;
        this.editTarget = null;
    }

    startEditing(textObj, player) {
        this.editing = player;
        this.editTarget = textObj;
        textObj.setText('_');
        this.input.keyboard.once('keydown', (event) => {
            if (event.key.length === 1 && /[a-zA-Z0-9]/.test(event.key)) {
                const newName = event.key.toUpperCase() + (player === 'p1' ? GameData.p2Name : GameData.p1Name).slice(1);
                textObj.setText(player === 'p1' ? newName : newName);
                if (player === 'p1') GameData.p1Name = newName;
                else GameData.p2Name = newName;
            }
            this.editing = null;
        });
    }

    selectMode(mode) {
        GameData.displayMode = mode;
        if (mode === 'shared') {
            this.sharedBtn.setStyle({ backgroundColor: '#555', color: '#fff' });
            this.splitBtn.setStyle({ backgroundColor: '#222', color: '#aaa' });
        } else {
            this.splitBtn.setStyle({ backgroundColor: '#444', color: '#fff' });
            this.sharedBtn.setStyle({ backgroundColor: '#333', color: '#aaa' });
        }
    }

    startGame() {
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

        this.scene.start('GameScene');
    }
}
