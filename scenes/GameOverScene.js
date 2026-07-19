/**
 * GameOverScene — Displays match winner, stats, rematch/menu buttons.
 * Rendered entirely in Phaser (no DOM overlay needed, though HUD overlay exists).
 */
export class GameOverScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameOverScene' });
    }

    create(data) {
        const cam = this.cameras.main;
        const cx = cam.centerX;
        const cy = cam.centerY;

        // Background
        this.add.image(cx, cy, 'bg_starfield').setAlpha(0.3);

        // Darken overlay
        const overlay = this.add.graphics();
        overlay.fillStyle(0x000000, 0.7);
        overlay.fillRect(0, 0, cam.width, cam.height);

        // Determine winner
        let winner, winnerColor;
        if (GameData.p1RoundsWon >= 2) {
            winner = GameData.p1Name;
            winnerColor = '#ff4444';
        } else if (GameData.p2RoundsWon >= 2) {
            winner = GameData.p2Name;
            winnerColor = '#4488ff';
        } else {
            // Timer ran out — higher score wins
            if (GameData.p1Score > GameData.p2Score) {
                winner = GameData.p1Name;
                winnerColor = '#ff4444';
            } else if (GameData.p2Score > GameData.p1Score) {
                winner = GameData.p2Name;
                winnerColor = '#4488ff';
            } else {
                winner = 'DRAW';
                winnerColor = '#cccccc';
            }
        }

        // Title
        this.add.text(cx, cy - 180, winner === 'DRAW' ? "IT'S A DRAW!" : `${winner} WINS!`, {
            fontSize: '48px',
            fontFamily: 'Courier New',
            color: winnerColor,
            fontStyle: 'bold',
        }).setOrigin(0.5);

        // Round score
        this.add.text(cx, cy - 120, `Rounds: P1 [${GameData.p1RoundsWon}] — P2 [${GameData.p2RoundsWon}]`, {
            fontSize: '20px',
            fontFamily: 'Courier New',
            color: '#f4ecd8',
        }).setOrigin(0.5);

        // Stats
        const stats = [
            `P1 (${GameData.p1Name}): ${GameData.p1Score} pts | ${this.getTotalKills('p1')} kills | Max streak: ${GameData.p1Streak}`,
            `P2 (${GameData.p2Name}): ${GameData.p2Score} pts | ${this.getTotalKills('p2')} kills | Max streak: ${GameData.p2Streak}`,
        ];
        stats.forEach((s, i) => {
            this.add.text(cx, cy - 60 + i * 30, s, {
                fontSize: '16px',
                fontFamily: 'Courier New',
                color: i === 0 ? '#ff8888' : '#88aaff',
            }).setOrigin(0.5);
        });

        // Buttons
        this.createButton(cx - 120, cy + 80, 'REMATCH', 0xc9a44c, () => {
            overlay.destroy();
            this.scene.restart('GameScene', { rematch: true });
        });
        this.createButton(cx + 120, cy + 80, 'MENU', 0x666666, () => {
            overlay.destroy();
            this.scene.start('MenuScene');
        });
    }

    createButton(x, y, text, color, callback) {
        const btn = this.add.text(x, y, text, {
            fontSize: '20px',
            fontFamily: 'Courier New',
            color: '#000',
            backgroundColor: '#' + color.toString(16).padStart(6, '0'),
            padding: { x: 20, y: 10 },
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => btn.setScale(1.05));
        btn.on('pointerout', () => btn.setScale(1));
        btn.on('pointerdown', callback);
    }

    getTotalKills(player) {
        // Placeholder — actual kill count stored in GameScene
        return player === 'p1' ? GameData.p1Score / 10 : GameData.p2Score / 10;
    }
}
