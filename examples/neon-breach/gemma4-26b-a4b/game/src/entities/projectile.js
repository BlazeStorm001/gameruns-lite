import { Entity } from './entity.js';
import { Vector } from '../utils/math.js';

export class Projectile extends Entity {
    constructor(x, y, direction) {
        super(x, y);
        this.direction = direction.clone ? direction.clone() : { x: direction.x, y: direction.y };
        this.speed = 500; // Pixels per second
        this.lifeTime = 2; // seconds
        this.width = 5;
        this.height = 5;
    }

    update(deltaTime) {
        this.velocity.x = this.direction.x * this.speed;
        this.velocity.y = this.direction.y * this.speed;
        super.update(deltaTime);
        this.lifeTime -= deltaTime;
    }

    isDead() {
        return this.lifeTime <= 0;
    }

    draw(ctx, camera) {
        const drawX = this.position.x - camera.x;
        const drawY = this.position.y - camera.y;

        ctx.fillStyle = '#ffff00';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ffff00';
        ctx.fillRect(drawX - this.width/2, drawY - this.height/2, this.width, this.height);
        ctx.shadowBlur = 0;
    }
}
