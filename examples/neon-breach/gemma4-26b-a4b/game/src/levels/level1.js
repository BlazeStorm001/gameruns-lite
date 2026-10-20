import { Player } from '../entities/player.js';
import { Enemy, SniperEnemy, ChargerEnemy } from '../entities/enemy.js';
import { Item } from '../entities/item.js';
import { Tilemap } from '../core/tilemap.js';

const TILE_SIZE = 32;
const MAP_WIDTH = 50;
const MAP_HEIGHT = 50;

export function Level1() {
    console.log('Level1 loaded');
    const tilemap = new Tilemap(MAP_WIDTH, MAP_HEIGHT, TILE_SIZE);
    const data = Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(0));

    // Perimeter walls
    for (let i = 0; i < MAP_WIDTH; i++) {
        data[0][i] = 1;
        data[MAP_HEIGHT - 1][i] = 1;
    }
    for (let i = 0; i < MAP_HEIGHT; i++) {
        data[i][0] = 1;
        data[i][MAP_WIDTH - 1] = 1;
    }

    // Room 1 Walls (Top left)
    for (let x = 5; x < 15; x++) {
        data[5][x] = 1;
        data[15][x] = 1;
    }
    for (let y = 5; y < 15; y++) {
        data[y][5] = 1;
        data[y][15] = 1;
    }

    // Room 2 Walls (Bottom right)
    for (let x = 35; x < 45; x++) {
        data[35][x] = 1;
        data[45][x] = 1;
    }
    for (let y = 35; y < 45; y++) {
        data[y][35] = 1;
        data[y][45] = 1;
    }

    // Corridor
    for (let x = 15; x < 35; x++) {
        data[5][x] = 1;
        data[45][x] = 1;
    }
    for (let y = 15; y < 35; y++) {
        data[y][15] = 1;
        data[y][35] = 1;
    }

    // Add some random obstacles
    for (let i = 0; i < 15; i++) {
        const x = Math.floor(Math.random() * (MAP_WIDTH - 2)) + 1;
        const y = Math.floor(Math.random() * (MAP_HEIGHT - 2)) + 1;
        if (data[y][x] === 0) data[y][x] = 1;
    }

    tilemap.setLayer(0, data);

    return {
        tilemap: tilemap,
        entities: [
            new Player(100, 100),
            new Enemy(400, 100),
            new Enemy(800, 400),
            new Enemy(400, 400),
            new SniperEnemy(250, 300),
            new SniperEnemy(550, 100),
            new ChargerEnemy(500, 500),
            new Item(200, 200, 'data'),
            new Item(300, 200, 'data'),
            new Item(400, 200, 'data'),
            new Item(450, 450, 'ammo'),
            new Item(450, 100, 'ammo'),
            new Item(150, 400, 'health'),
            new Item(400, 50, 'ammo'),
            new Item(600, 600, 'weapon_upgrade'),
        ],
        totalData: 3
    };
}
