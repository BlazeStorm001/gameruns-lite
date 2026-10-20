import { Entity } from './entity.js';
import { Vector } from '../utils/math.js';
import { Projectile } from './projectile.js';

export const EnemyState = {
    PATROL: 'PATROL',
    CHASE: 'CHASE'
};

export class Enemy extends Entity {
    constructor(x, y) {
        super(x, y);
        this.speed = 60;
        this.direction = new Vector(1, 0);
        this.visionRange = 250;
        this.visionAngle = Math.PI / 3; // 60 degrees
        this.state = EnemyState.PATROL;
        this.health = 3;
        this.hitFlashTimer = 0;
    }

    update(deltaTime, tilemap, player, engine) {
        if (this.hitFlashTimer > 0) {
            this.hitFlashTimer -= deltaTime;
        }

        let canSeePlayer = false;
        if (player && this.checkDetection(player)) {
            this.state = EnemyState.CHASE;
            canSeePlayer = true;
        } else {
            this.state = EnemyState.PATROL;
        }

        if (this.state === EnemyState.CHASE && player) {
            const toPlayer = player.position.sub(this.position);
            this.direction = toPlayer.normalize();
            this.speed = 80;
            
            // Sniper shooting logic
            if (this.constructor.name === 'SniperEnemy') {
                this.shootTimer -= deltaTime;
                if (this.shootTimer <= 0) {
                    this.shoot(player, engine);
                    this.shootTimer = this.shootInterval;
                }
            }
        } else {
            // Simple patrol: move back and forth
            this.speed = 60;
            
            // Check if we should turn around (hit a wall or edge)
            const nextX = this.position.x + this.direction.x * this.speed * deltaTime;
            const nextY = this.position.y + this.direction.y * this.speed * deltaTime;

            if (this.checkTileCollision(nextX, this.position.y, tilemap)) {
                this.direction.x *= -1;
            } else if (this.checkTileCollision(this.position.x, nextY, tilemap)) {
                this.direction.y *= -1;
            }
        }

        this.velocity.x = this.direction.x * this.speed;
        this.velocity.y = this.direction.y * this.speed;

        super.update(deltaTime);
    }

    shoot(player, engine) {
        const dir = player.position.sub(this.position).normalize();
        const bullet = new Projectile(this.position.x, this.position.y, dir);
        engine.entities.push(bullet);
        engine.particleSystem.emit(this.position.x, this.position.y, '#ffff00', 5);
        engine.shake(2);
    }

    checkDetection(player) {
        const toPlayer = player.position.sub(this.position);
        const distance = toPlayer.magnitude();
        if (distance > this.visionRange) return false;

        const angleToPlayer = Math.atan2(toPlayer.y, toPlayer.x);
        const enemyAngle = Math.atan2(this.direction.y, this.direction.x);
        let angleDiff = Math.abs(angleToPlayer - enemyAngle);
        if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;

        return angleDiff < this.visionAngle / 2;
    }

    checkTileCollision(x, y, tilemap) {
        if (!tilemap) return false;
        const halfW = this.width / 2;
        const halfH = this.height / 2;

        const points = [
            { x: x - halfW, y: y - halfH },
            { x: x + halfW, y: y - halfH },
            { x: x - halfW, y: y + halfH },
            { x: x + halfW, y: y + halfH },
            { x: x, y: y - halfH },
            { x: x, y: y + halfH },
            { x: x - halfW, y: y },
            { x: x + halfW, y: y },
            { x: x, y: y }
        ];

        for (const point of points) {
            const tile = tilemap.getTile(0, point.x, point.y);
            if (tile === 1) return true;
        }
        return false;
    }

    draw(ctx, camera) {
        const drawX = this.position.x - camera.x;
        const drawY = this.position.y - camera.y;

        this.drawVisionCone(ctx, camera);

        ctx.fillStyle = this.state === EnemyState.CHASE ? '#ff0000' : '#ff0044';
        ctx.fillRect(drawX, drawY, this.width, this.height);
        
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.state === EnemyState.CHASE ? '#ff0000' : '#ff0044';
        ctx.strokeStyle = this.state === EnemyState.CHASE ? '#ff0000' : '#ff0044';
        ctx.lineWidth = this.state === EnemyState.CHASE ? 3 : 2;
        ctx.strokeRect(drawX, drawY, this.width, this.height);
        ctx.shadowBlur = 0;

        if (this.hitFlashTimer > 0) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.fillRect(drawX, drawY, this.width, this.height);
        }
    }

    drawVisionCone(ctx, camera) {
        const drawX = this.position.x - camera.x;
        const drawY = this.position.y - camera.y;
        const centerX = drawX + this.width / 2;
        const centerY = drawY + this.height / 2;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);

        const startAngle = Math.atan2(this.direction.y, this.direction.x) - this.visionAngle / 2;
        const endAngle = Math.atan2(this.direction.y, this.direction.x) + this.visionAngle / 2;

        ctx.arc(centerX, centerY, this.visionRange, startAngle, endAngle);
        ctx.closePath();

        ctx.fillStyle = this.state === EnemyState.CHASE ? 'rgba(255, 0, 0, 0.3)' : 'rgba(255, 0, 68, 0.2)';
        ctx.fill();
        ctx.restore();
    }
}

export class SniperEnemy extends Enemy {
    constructor(x, y) {
        super(x, y);
        this.speed = 30;
        this.visionRange = 400;
        this.visionAngle = Math.PI / 8; // 22.5 degrees
        this.shootTimer = 0;
        this.shootInterval = 2; // seconds
    }
}

export class TankEnemy extends Enemy {
    constructor(x, y) {
        super(x, y);
        this.speed = 20;
        this.health = 10;
        this.visionRange = 300;
    }
}

export class ChargerEnemy extends Enemy {
    constructor(x, y) {
        super(x, y);
        this.speed = 40;
        this.health = 2;
        this.visionRange = 350;
        this.chargeTimer = 0;
    }

    update(deltaTime, tilemap, player, engine) {
        this.chargeTimer -= deltaTime;
        if (this.chargeTimer <= 0) {
            // Switch between patrolling and charging
            this.chargeTimer = Math.random() * 3 + 2;
        }

        if (this.chargeTimer > 1 && player) {
            // Charge towards player
            const toPlayer = player.position.sub(this.position);
            if (toPlayer.magnitude() < this.visionRange) {
                this.direction = toPlayer.normalize();
                this.speed = 150;
            } else {
                this.speed = 40;
            }
        } else {
            this.speed = 40;
        }

        super.update(deltaTime, tilemap, player, engine);
    }
}
