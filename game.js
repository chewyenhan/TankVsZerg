/**
 * Tank vs Zerg — Phaser.js Side-Scrolling Defense
 * Main bootstrap file. Creates the Phaser.Game instance and registers scenes.
 */

// Global game data shared across scenes
const GameData = {
    p1Name: 'Player 1',
    p2Name: 'Player 2',
    p1RoundsWon: 0,
    p2RoundsWon: 0,
    currentRound: 1,
    p1HP: 100,
    p2HP: 100,
    p1Score: 0,
    p2Score: 0,
    p1Streak: 0,
    p2Streak: 0,
    waveNumber: 0,
    roundTimer: 180,
    displayMode: 'shared',
};
window.GameData = GameData;

// Scene imports
import { BootScene } from './scenes/BootScene.js';
import { PreloadScene } from './scenes/PreloadScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'game-container',
    backgroundColor: '#1a1a2e',
    physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 }, debug: false },
    },
    scene: [BootScene, PreloadScene, MenuScene, GameScene, GameOverScene],
    render: { antialias: true, pixelArt: false },
};

const game = new Phaser.Game(config);
window.game = game;

// Make canvas focusable for keyboard input
game.events.on('ready', () => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
        canvas.setAttribute('tabindex', '0');
        canvas.focus();
        // Re-focus on any click to ensure keyboard input works
        canvas.addEventListener('click', () => canvas.focus());
    }
});

// DOM button handlers
window.resumeGame = function () {
    const gs = game.scene.getScene('GameScene');
    if (gs && gs.togglePause) gs.togglePause();
};
window.forfeitRound = function (player) {
    const gs = game.scene.getScene('GameScene');
    if (gs && gs.forfeit) gs.forfeit(player || 'p1');
};
window.rematch = function () {
    document.getElementById('gameover-overlay').style.display = 'none';
    const gs = game.scene.getScene('GameScene');
    if (gs && gs.startNewRound) gs.startNewRound();
};
window.returnToMenu = function () {
    document.getElementById('gameover-overlay').style.display = 'none';
    document.getElementById('hud').style.display = 'none';
    game.scene.start('MenuScene');
};
