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
    survivalTime: 0,
    displayMode: 'shared',
    gameMode: 'single',
    coopFailed: false,
    coopRoundsSurvived: 0,
    totalRounds: 100,     // configurable; set by MenuScene based on mode

    // Customizable key bindings (defaults, overridden by localStorage)
    keyBindings: {
        p1Up: 'W', p1Down: 'S', p1Left: 'A', p1Right: 'D',
        p1Fire: 'SPACE', p1Shield: 'E', p1Nuke: 'Q',
        p2Up: 'UP', p2Down: 'DOWN', p2Left: 'LEFT', p2Right: 'RIGHT',
        p2Fire: 'ENTER', p2Shield: 'I', p2Nuke: 'U',
    },
};

// ── Tech Tree (meta-progression, persisted in localStorage) ──
// Each player has their own independent tech tree

function makeTechTree() {
    return {
        attack: 0,      // Lv0-20, each +3 base damage (15→75 max)
        armor: 0,       // Lv0-10, each +15 HP (100→250 max)
        fireRate: 0,    // Lv0-5,  each -60ms fire interval (500→200ms max)
        nukeCap: 0,     // Lv0-3,  each +1 nuke capacity (3→6 max)
        shieldCap: 0,   // Lv0-5,  each +5 shield max (30→55 max)
        swarmDur: 0,    // Lv0-5,  each +3s swarm duration (15→30s max)
        techPoints: 0,  // available tech points to spend
    };
}

const TechTreeP1 = makeTechTree();
const TechTreeP2 = makeTechTree();

// Backward-compatible reference — points to P1 by default
const TechTree = TechTreeP1;

/** Get the tech tree for a specific player */
function getTechTree(player) {
    return player === 'p2' ? TechTreeP2 : TechTreeP1;
}

// Tech tree upgrade costs — geometric growth (2× per level)
const TECH_COSTS = {
    attack:    level => Math.floor(50 * Math.pow(2, level)),     // 50 → 100 → 200 → 400 → 800
    armor:     level => Math.floor(40 * Math.pow(2, level)),     // 40 → 80 → 160 → 320 → 640
    fireRate:  level => Math.floor(75 * Math.pow(2, level)),     // 75 → 150 → 300 → 600 → 1200
    nukeCap:   level => Math.floor(400 * Math.pow(2, level)),     // 400 → 800 → 1600
    shieldCap: level => Math.floor(60 * Math.pow(2, level)),     // 60 → 120 → 240 → 480 → 960
    swarmDur:  level => Math.floor(50 * Math.pow(2, level)),     // 50 → 100 → 200 → 400 → 800
};

const TECH_MAX = { attack: 20, armor: 10, fireRate: 5, nukeCap: 3, shieldCap: 5, swarmDur: 5 };
const TECH_LABELS = {
    attack: 'Attack Power', armor: 'Armor (HP)', fireRate: 'Fire Rate',
    nukeCap: 'Nuke Capacity', shieldCap: 'Shield Capacity', swarmDur: 'Swarm Duration',
};
const TECH_ICONS = { attack: '⚔', armor: '🛡', fireRate: '⏱', nukeCap: '☢', shieldCap: '🔰', swarmDur: '🚀' };

// Load tech trees from localStorage
function loadTechTree(player) {
    const tree = getTechTree(player);
    try {
        const saved = localStorage.getItem(`tankVszerg_techtree_${player}`);
        if (saved) {
            const parsed = JSON.parse(saved);
            Object.assign(tree, parsed);
        }
    } catch (_) { /* use defaults */ }
}
loadTechTree('p1');
loadTechTree('p2');

// Migrate old single-tree saves
if (TechTreeP1.techPoints === 0 && TechTreeP2.techPoints === 0) {
    try {
        const old = localStorage.getItem('tankVszerg_techtree');
        if (old) {
            const parsed = JSON.parse(old);
            Object.assign(TechTreeP1, parsed);
            // Copy to P2 as well so returning players keep progress
            Object.assign(TechTreeP2, parsed);
            saveTechTree('p1');
            saveTechTree('p2');
            localStorage.removeItem('tankVszerg_techtree');  // clean up old key
        }
    } catch (_) { /* no old data */ }
}

/** Save tech tree to localStorage */
function saveTechTree(player) {
    const tree = getTechTree(player);
    try {
        localStorage.setItem(`tankVszerg_techtree_${player}`, JSON.stringify(tree));
    } catch (_) { /* localStorage not available */ }
}

/** Attempt to upgrade a tech — returns true on success */
function upgradeTech(player, key) {
    const tree = getTechTree(player);
    const level = tree[key];
    if (level >= TECH_MAX[key]) return false;
    const cost = TECH_COSTS[key](level);
    if (tree.techPoints < cost) return false;
    tree.techPoints -= cost;
    tree[key]++;
    saveTechTree(player);
    return true;
}

window.TechTree = TechTree;
window.TechTreeP1 = TechTreeP1;
window.TechTreeP2 = TechTreeP2;
window.getTechTree = getTechTree;
window.upgradeTech = upgradeTech;
window.saveTechTree = saveTechTree;
window.TECH_COSTS = TECH_COSTS;
window.TECH_MAX = TECH_MAX;
window.TECH_LABELS = TECH_LABELS;
window.TECH_ICONS = TECH_ICONS;

// Load saved keybindings from localStorage
try {
    const saved = localStorage.getItem('tankVszerg_keybindings');
    if (saved) {
        const parsed = JSON.parse(saved);
        Object.assign(GameData.keyBindings, parsed);
    }
} catch (_) { /* use defaults */ }

/** Save current keybindings to localStorage */
GameData.saveKeyBindings = function () {
    try {
        localStorage.setItem('tankVszerg_keybindings', JSON.stringify(this.keyBindings));
    } catch (_) { /* localStorage not available */ }
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
    render: { antialias: false, pixelArt: true },
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
    document.getElementById('hud').style.display = 'block';
    game.scene.stop('GameScene');
    game.scene.start('GameScene');
};
// ── Keybinding UI ──
const KEYBIND_LABELS = {
    p1Up: 'Move Up', p1Down: 'Move Down', p1Left: 'Move Left', p1Right: 'Move Right',
    p1Fire: 'Fire / Auto-Aim', p1Shield: 'Shield Boost', p1Nuke: 'Nuke',
    p2Up: 'Move Up', p2Down: 'Move Down', p2Left: 'Move Left', p2Right: 'Move Right',
    p2Fire: 'Fire / Auto-Aim', p2Shield: 'Shield Boost', p2Nuke: 'Nuke',
};

let _listeningKey = null;  // Which binding is being rebound right now

window.openKeybinds = function () {
    const overlay = document.getElementById('keybind-overlay');
    const grid = document.getElementById('keybind-grid');

    // Build grid rows dynamically
    const p1Keys = ['p1Up', 'p1Down', 'p1Left', 'p1Right', 'p1Fire', 'p1Shield', 'p1Nuke'];
    const p2Keys = ['p2Up', 'p2Down', 'p2Left', 'p2Right', 'p2Fire', 'p2Shield', 'p2Nuke'];

    // Clear existing rows (keep header)
    const rows = grid.querySelectorAll('.keybind-row');
    rows.forEach(r => r.remove());

    for (let i = 0; i < 7; i++) {
        const p1k = p1Keys[i];
        const p2k = p2Keys[i];

        const row = document.createElement('div');
        row.className = 'keybind-row';
        row.style.cssText = 'display:contents;';

        // P1 label
        const l1 = document.createElement('span');
        l1.className = 'keybind-row-label';
        l1.textContent = KEYBIND_LABELS[p1k];
        // P1 button
        const b1 = document.createElement('button');
        b1.className = 'keybind-btn';
        b1.textContent = GameData.keyBindings[p1k];
        b1.dataset.bindKey = p1k;
        b1.onclick = () => startListening(b1, p1k);

        // P2 label
        const l2 = document.createElement('span');
        l2.className = 'keybind-row-label';
        l2.textContent = KEYBIND_LABELS[p2k];
        // P2 button
        const b2 = document.createElement('button');
        b2.className = 'keybind-btn';
        b2.textContent = GameData.keyBindings[p2k];
        b2.dataset.bindKey = p2k;
        b2.onclick = () => startListening(b2, p2k);

        row.append(l1, b1, document.createElement('span'));  // spacer
        row.append(l2, b2, document.createElement('span'));  // spacer
        grid.appendChild(row);
    }

    overlay.style.display = 'flex';

    // Global keydown listener for rebinding
    window._keybindListener = function (e) {
        if (!_listeningKey) return;
        e.preventDefault();
        e.stopPropagation();

        // Map key to display name
        let keyName = e.key.toUpperCase();
        if (keyName === ' ') keyName = 'SPACE';
        if (keyName === 'ARROWUP') keyName = 'UP';
        if (keyName === 'ARROWDOWN') keyName = 'DOWN';
        if (keyName === 'ARROWLEFT') keyName = 'LEFT';
        if (keyName === 'ARROWRIGHT') keyName = 'RIGHT';
        if (keyName === 'ESCAPE') keyName = 'ESC';
        if (keyName === 'SHIFT') keyName = e.location === 2 ? 'RSHIFT' : 'SHIFT';
        if (keyName === 'CONTROL') return;  // Skip modifier-only
        if (keyName === 'ALT') return;
        if (keyName === 'TAB') return;
        if (keyName === 'CAPSLOCK') return;

        // Update binding
        GameData.keyBindings[_listeningKey] = keyName;
        // Update button text
        const btn = document.querySelector(`[data-bind-key="${_listeningKey}"]`);
        if (btn) {
            btn.textContent = keyName;
            btn.classList.remove('listening');
        }
        _listeningKey = null;
        window.removeEventListener('keydown', window._keybindListener);
    };
    window.addEventListener('keydown', window._keybindListener);
};

function startListening(btn, bindKey) {
    // Remove listening from all buttons
    document.querySelectorAll('.keybind-btn').forEach(b => b.classList.remove('listening'));
    btn.classList.add('listening');
    btn.textContent = '...';
    _listeningKey = bindKey;
}

window.closeKeybinds = function () {
    _listeningKey = null;
    if (window._keybindListener) {
        window.removeEventListener('keydown', window._keybindListener);
        window._keybindListener = null;
    }
    document.getElementById('keybind-overlay').style.display = 'none';
};

window.saveKeybinds = function () {
    GameData.saveKeyBindings();
    closeKeybinds();
};

// Wire up save button
document.addEventListener('DOMContentLoaded', () => {
    const saveBtn = document.getElementById('keybind-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveKeybinds);
});

// ── Tech Tree UI ──
let _techTreePlayer = 'p1';  // Which player's tree is currently shown
window._techTreePlayer = 'p1';  // Exposed for inline onclick handlers

window.openTechTree = function (player) {
    if (player) { _techTreePlayer = player; window._techTreePlayer = player; }
    const tree = getTechTree(_techTreePlayer);
    const overlay = document.getElementById('techtree-overlay');
    const grid = document.getElementById('techtree-grid');
    const ptsEl = document.getElementById('techtree-points');
    const tabP1 = document.getElementById('techtree-tab-p1');
    const tabP2 = document.getElementById('techtree-tab-p2');

    // Highlight active tab
    if (tabP1) tabP1.className = `techtree-tab ${_techTreePlayer === 'p1' ? 'active' : ''}`;
    if (tabP2) tabP2.className = `techtree-tab ${_techTreePlayer === 'p2' ? 'active' : ''}`;

    // Update points display
    ptsEl.textContent = `${_techTreePlayer === 'p2' ? 'P2' : 'P1'} · Available Points: ${tree.techPoints}`;

    // Build grid
    grid.innerHTML = '';
    const keys = ['attack', 'armor', 'fireRate', 'nukeCap', 'shieldCap', 'swarmDur'];

    for (const key of keys) {
        const level = tree[key];
        const max = TECH_MAX[key];
        const cost = level < max ? TECH_COSTS[key](level) : '—';
        const icon = TECH_ICONS[key];
        const label = TECH_LABELS[key];

        const row = document.createElement('div');
        row.className = 'techtree-row';
        row.innerHTML = `
            <span class="techtree-icon">${icon}</span>
            <span class="techtree-label">${label}</span>
            <span class="techtree-level">Lv ${level}/${max}</span>
            <button class="techtree-btn" data-key="${key}" ${level >= max ? 'disabled' : ''}>
                ${level >= max ? 'MAX' : `⬆ ${cost} pts`}
            </button>
        `;
        grid.appendChild(row);
    }

    // Wire up upgrade buttons
    grid.querySelectorAll('.techtree-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.key;
            if (upgradeTech(_techTreePlayer, key)) {
                openTechTree(); // Refresh
            }
        });
    });

    overlay.style.display = 'flex';
};

window.closeTechTree = function () {
    document.getElementById('techtree-overlay').style.display = 'none';
};

// ── Export / Import ──
window.exportTechTree = function (player) {
    const tree = getTechTree(player);
    const json = JSON.stringify(tree, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const date = new Date().toISOString().slice(0, 10);
    a.download = `tankvszerg_save_${player}_${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
};

window.importTechTree = function (player) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result);
                // Validate structure — must have at least one known key
                const valid = ['attack', 'armor', 'fireRate', 'nukeCap', 'shieldCap', 'swarmDur', 'techPoints']
                    .some(k => k in data);
                if (!valid) { alert('Invalid save file!'); return; }
                const tree = getTechTree(player);
                // Only copy known keys to avoid pollution
                for (const k of ['attack', 'armor', 'fireRate', 'nukeCap', 'shieldCap', 'swarmDur', 'techPoints']) {
                    if (k in data) tree[k] = data[k];
                }
                saveTechTree(player);
                openTechTree(player); // refresh UI
            } catch (err) { alert(`Import failed: ${err.message}`); }
        };
        reader.readAsText(file);
    };
    input.click();
};

window.returnToMenu = function () {
    document.getElementById('gameover-overlay').style.display = 'none';
    document.getElementById('hud').style.display = 'none';
    document.getElementById('pause-overlay').style.display = 'none';
    game.scene.stop('GameScene');
    game.scene.start('MenuScene');
};
