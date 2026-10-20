import { Engine, GameState } from './core/engine.js';
import { Input } from './core/input.js';
import { Level1 } from './levels/level1.js';
import { Level2 } from './levels/level2.js';

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.input = new Input();
        this.engine = new Engine(this.canvas, this.ctx, this.input);
        this.levels = [Level1, Level2];
        this.currentLevelIndex = 0;
        
        this.engine.onWin = () => {
            this.nextLevel();
        };
    }

    start() {
        console.log('GAME STARTING TEST');
        this.engine.init();
        this.currentLevelIndex = 0;
        this.loadLevel(this.levels[this.currentLevelIndex]);
        this.engine.start();
        const overlay = document.getElementById('overlay');
        if (overlay) overlay.style.display = 'none';
    }

    restart() {
        this.input.reset();
        const overlay = document.getElementById('overlay');
        if (overlay) overlay.style.display = 'flex';
        this.currentLevelIndex = 0;
        this.loadLevel(this.levels[this.currentLevelIndex]);
        this.engine.restart();
        this.engine.start();
    }

    nextLevel() {
        this.currentLevelIndex++;
        if (this.currentLevelIndex < this.levels.length) {
            setTimeout(() => {
                this.loadLevel(this.levels[this.currentLevelIndex]);
            }, 3000);
        } else {
            // Game Won!
            this.engine.gameOver = true;
            this.engine.state = GameState.GAME_WIN;
        }
    }

    loadLevel(levelDataOrFn) {
        this.input.reset();
        const overlay = document.getElementById('overlay');
        if (overlay) overlay.style.display = 'flex';
        const levelData = typeof levelDataOrFn === 'function' ? levelDataOrFn() : levelDataOrFn;
        this.engine.loadLevel(levelData);
    }
}

const game = new Game();
window.game = game;
console.log('GAME ASSIGNED TO WINDOW');

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !game.engine.running) {
        game.start();
        const overlay = document.getElementById('overlay');
        if (overlay) overlay.style.display = 'none';
    }
    if (e.code === 'KeyR' && (game.engine.gameOver || game.engine.gameWin)) {
        game.restart();
        const overlay = document.getElementById('overlay');
        if (overlay) overlay.style.display = 'none';
    }
    if (e.code === 'Digit2') {
        game.loadLevel(game.levels[1]);
    }
});

window.addEventListener('resize', () => {
    game.engine.resize();
});

// Expose for game_test
window.__gameTest = {
    async reset(seed) {
        game.restart();
        // Wait for the setTimeout in restart() to trigger and the level to load
        await new Promise(resolve => setTimeout(resolve, 50));
        return new Promise(resolve => requestAnimationFrame(resolve));
    },
    async step(frames) {
        for (let i = 0; i < frames; i++) {
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
    },
    async act(action, payload) {
        if (action === 'keydown') {
            const event = new KeyboardEvent('keydown', { code: payload.code });
            window.dispatchEvent(event);
        } else if (action === 'keyup') {
            const event = new KeyboardEvent('keyup', { code: payload.code });
            window.dispatchEvent(event);
        } else if (action === 'move') {
            // payload: { dx: number, dy: number }
            // Simulates movement by pressing keys
            const keys = [];
            if (payload.dy < 0) keys.push('KeyW');
            if (payload.dy > 0) keys.push('KeyS');
            if (payload.dx < 0) keys.push('KeyA');
            if (payload.dx > 0) keys.push('KeyD');
            
            for (const code of keys) {
                window.dispatchEvent(new KeyboardEvent('keydown', { code }));
            }
        } else if (action === 'stop') {
            const keys = ['KeyW', 'KeyS', 'KeyA', 'KeyD'];
            for (const code of keys) {
                window.dispatchEvent(new KeyboardEvent('keyup', { code }));
            }
        }
    },
    async snapshot() {
        return {
            playerX: game.engine.entities.find(e => e.constructor.name === 'Player')?.position.x,
            playerY: game.engine.entities.find(e => e.constructor.name === 'Player')?.position.y,
            health: game.engine.entities.find(e => e.constructor.name === 'Player')?.health,
            ammo: game.engine.entities.find(e => e.constructor.name === 'Player')?.ammo,
            dataCollected: game.engine.dataCollected,
            totalData: game.engine.totalData,
            gameOver: game.engine.gameOver,
            gameWin: game.engine.gameWin,
            score: game.engine.score,
            currentLevelIndex: game.currentLevelIndex
        };
    }
};
