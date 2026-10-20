import { Vector } from '../utils/math.js';

export class Entity {
    constructor(x, y) {
        this.position = new Vector(x, y);
        this.velocity = new Vector(0, 0);
        this.width = 32;
        this.height = 32;
        this.radius = 16;
        this.visible = true;
        this.dead = false;
    }

    update(deltaTime) {
        this.position.x += this.velocity.x * deltaTime;
        this.position.y += this.velocity.y * deltaTime;
    }

    die() {
        this.dead = true;
    }

    isDead() {
        return this.dead;
    }

    draw(ctx, camera) {
        // To be implemented by subclasses
    }
}
