import { Entity } from './entity.js';
import { Vector } from '../utils/math.js';
import { Tilemap } from '../core/tilemap.js';

export class Player extends Entity {
    constructor(x, y) {
        super(x, y);
        this.speed = 200;
        this.direction = new Vector(0, 0);
        this.weaponMode = 'NORMAL';
        this.weaponTimer = 0;
        this.dashCooldown = 0;
        this.isDashing = false;
        this.ammo = 20;
        this.maxAmmo = 20;
        this.health = 100;
        this.maxHealth = 100;
        this.hitFlashTimer = 0;
        this.muzzleFlashTimer = 0;
    }

    update(deltaTime, input, tilemap, engine) {
        this.velocity.x = 0;
        this.velocity.y = 0;

        if (this.dashCooldown > 0) {
            this.dashCooldown -= deltaTime;
        }

        if (this.weaponMode === 'RAPID') {
            this.weaponTimer -= deltaTime;
            if (this.weaponTimer <= 0) {
                this.weaponMode = 'NORMAL';
            }
        }

        // Dash logic
        if (input.isJustPressedCode('ShiftLeft') || input.isJustPressedCode('ShiftRight')) {
            if (this.dashCooldown <= 0) {
                this.triggerDash(engine);
            }
        }

        if (this.isDashing) {
            // Dashing movement is handled in dash duration (simplified here)
            // For now, let's just give it a boost
            this.velocity.x = this.direction.x * this.speed * 3;
            this.velocity.y = this.direction.y * this.speed * 3;
        } else {
            if (input.isPressed('ArrowUp') || input.isPressed('KeyW')) {
                this.velocity.y = -this.speed;
            }
            if (input.isPressed('ArrowDown') || input.isPressed('KeyS')) {
                this.velocity.y = this.speed;
            }
            if (input.isPressed('ArrowLeft') || input.isPressed('KeyA')) {
                this.velocity.x = -this.speed;
            }
            if (input.isPressed('ArrowRight') || input.isPressed('KeyD')) {
                this.velocity.x = this.speed;
            }
        }

        if (this.hitFlashTimer > 0) {
            this.hitFlashTimer -= deltaTime;
        }
        if (this.muzzleFlashTimer > 0) {
            this.muzzleFlashTimer -= deltaTime;
        }

        // Update direction
        if (this.velocity.x !== 0 || this.velocity.y !== 0) {
            this.direction = new Vector(this.velocity.x, this.velocity.y).normalize();
        }

        // Check X movement collision
        const nextX = this.position.x + this.velocity.x * deltaTime;
        if (!this.checkTileCollision(nextX, this.position.y, tilemap)) {
            this.position.x = nextX;
        } else if (this.velocity.x !== 0) {
            this.velocity.x = 0;
        }

        // Check Y movement collision
        const nextY = this.position.y + this.velocity.y * deltaTime;
        if (!this.checkTileCollision(this.position.x, nextY, tilemap)) {
            this.position.y = nextY;
        } else if (this.velocity.y !== 0) {
            this.velocity.y = 0;
        }

        // Debug NaN positions
        if (isNaN(this.position.x) || isNaN(this.position.y)) {
            console.error('Player position is NaN:', this.position.x, this.position.y);
        }

        // End dash (simplified: dash lasts for a brief moment if speed is high)
        if (this.isDashing && Math.abs(this.velocity.x) > this.speed * 2) {
            this.isDashing = false;
            this.dashCooldown = 1.5; // 1.5s cooldown
        }
    }

    triggerDash(engine) {
        this.isDashing = true;
        this.hitFlashTimer = 0.2;
        if (engine) {
            engine.dashTimeScaleTimer = 0.2;
        }
        // Note: direction should be captured when dash starts to avoid issues with changing input
        // But for simplicity we'll use current direction
        this.direction.x *= 2; // Boost in current direction
        this.direction.y *= 2;
    }

    setWeaponMode(mode, duration) {
        this.weaponMode = mode;
        this.weaponTimer = duration;
    }

    triggerMuzzleFlash() {
        this.muzzleFlashTimer = 0.05;
    }

    hit() {
        this.hitFlashTimer = 0.1;
    }

    checkTileCollision(x, y, tilemap) {
        if (!tilemap) return false;
        const halfW = this.width / 2;
        const halfH = this.height / 2;
        
        // Check 9 points: corners, mid-edges, and center
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

        ctx.save();
        if (this.hitFlashTimer > 0) {
            ctx.filter = 'brightness(5)';
        }
        if (this.isDashing) {
            ctx.filter = 'brightness(2) contrast(2)';
        }

        // Change color based on weapon mode
        if (this.weaponMode === 'RAPID') {
            ctx.fillStyle = '#00ff00';
            ctx.shadowColor = '#00ff00';
        } else {
            ctx.fillStyle = '#00ffff';
            ctx.shadowColor = '#00ffff';
        }

        ctx.fillRect(drawX, drawY, this.width, this.height);
        
        ctx.shadowBlur = 15;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX, drawY, this.width, this.height);
        ctx.shadowBlur = 0;
        ctx.restore();

        // Draw direction indicator (gun)
        const gunX = this.position.x - camera.x + this.width/2 + this.direction.x * 20;
        const gunY = this.position.y - camera.y + this.height/2 + this.direction.y * 20;

        if (this.muzzleFlashTimer > 0) {
            ctx.fillStyle = '#ffff00';
            ctx.beginPath();
            ctx.arc(gunX, gunY, 8, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = '#fff';
            ctx.fillRect(gunX - 5, gunY - 5, 10, 10);
        }
    }
}
