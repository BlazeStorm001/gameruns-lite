import { Player } from '../entities/player.js';
import { Enemy, SniperEnemy } from '../entities/enemy.js';
import { Item } from '../entities/item.js';
import { Tilemap } from '../core/tilemap.js';

const TILE_SIZE = 32;
const MAP_WIDTH = 30;
const MAP_HEIGHT = 30;

export function Level2() {
    const tilemap = new Tilemap(MAP_WIDTH, MAP_HEIGHT, TILE_SIZE);
    const entities = [];

    // Floor and Walls
    const data = Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(2));

    // Outer walls
    for (let i = 0; i < MAP_WIDTH; i++) {
        data[0][i] = 1;
        data[MAP_HEIGHT - 1][i] = 1;
    }
    for (let i = 0; i < MAP_HEIGHT; i++) {
        data[i][0] = 1;
        data[i][MAP_WIDTH - 1] = 1;
    }

    // Some rooms/obstacles
    for (let x = 10; x < 15; x++) {
        for (let y = 10; y < 15; y++) {
            data[y][x] = 1;
        }
    }
    for (let x = 20; x < 25; x++) {
        for (let y = 20; y < 25; y++) {
            data[y][x] = 1;
        }
    }

    tilemap.setLayer(0, data);

    // Entities
    entities.push(new Player(50, 50));
    entities.push(new Enemy(150, 50));
    entities.push(new SniperEnemy(200, 200));
    entities.push(new Enemy(50, 200));
    entities.push(new Item(250, 250, 'data'));
    entities.push(new Item(50, 250, 'ammo'));
    entities.push(new Item(250, 50, 'health'));

    return {
        tilemap: tilemap,
        entities: entities,
        totalData: 5
    };
}
