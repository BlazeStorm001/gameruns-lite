export class Tilemap {
    constructor(width, height, tileSize) {
        this.width = width;
        this.height = height;
        this.tileSize = tileSize;
        this.layers = [[]]; // 2D array of layer data
    }

    setLayer(layerIndex, data) {
        this.layers[layerIndex] = data;
    }

    getTile(layerIndex, x, y) {
        if (layerIndex < 0 || layerIndex >= this.layers.length) return null;
        const tileX = Math.floor(x / this.tileSize);
        const tileY = Math.floor(y / this.tileSize);
        if (tileX < 0 || tileX >= this.width || tileY < 0 || tileY >= this.height) return null;
        return this.layers[layerIndex][tileY][tileX];
    }

    draw(ctx, camera) {
        for (let layer of this.layers) {
            for (let y = 0; y < this.height; y++) {
                for (let x = 0; x < this.width; x++) {
                    const tile = layer[y][x];
                    if (tile === 0) continue; // 0 = empty

                    const drawX = x * this.tileSize - camera.x;
                    const drawY = y * this.tileSize - camera.y;

                    if (tile === 1) { // Wall
                        ctx.fillStyle = '#333';
                        ctx.fillRect(drawX, drawY, this.tileSize, this.tileSize);
                        ctx.strokeStyle = '#555';
                        ctx.strokeRect(drawX, drawY, this.tileSize, this.tileSize);
                    } else if (tile === 2) { // Floor
                        ctx.fillStyle = '#111';
                        ctx.fillRect(drawX, drawY, this.tileSize, this.tileSize);
                    }
                }
            }
        }
    }
}
