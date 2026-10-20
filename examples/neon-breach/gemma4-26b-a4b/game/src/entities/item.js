import { Entity } from './entity.js';

export class Item extends Entity {
    constructor(x, y, type) {
        super(x, y);
        this.type = type; // 'data', 'ammo', 'health'
        this.width = 20;
        this.height = 20;
        this.dead = false;
    }

    isDead() {
        return this.dead;
    }

    update(deltaTime) {
        super.update(deltaTime);
    }

    draw(ctx, camera) {
        const drawX = this.position.x - camera.x;
        const drawY = this.position.y - camera.y;

        ctx.save();
        ctx.shadowColor = this.type === 'data' ? '#00ffff' : (this.type === 'ammo' ? '#ffff00' : (this.type === 'health' ? '#ff00ff' : '#00ff00'));
        ctx.shadowBlur = 15;
        ctx.fillStyle = ctx.shadowColor;
        
        if (this.type === 'data') {
            ctx.beginPath();
            ctx.moveTo(drawX + this.width / 2, drawY);
            ctx.lineTo(drawX + this.width, drawY + this.height / 2);
            ctx.lineTo(drawX + this.width / 2, drawY + this.height);
            ctx.lineTo(drawX, drawY + this.height / 2);
            ctx.closePath();
            ctx.fill();
        } else if (this.type === 'ammo') {
            ctx.fillRect(drawX, drawY, this.width, this.height);
        } else if (this.type === 'health') {
            ctx.fillRect(drawX, drawY, this.width, this.height);
        } else if (this.type === 'weapon_upgrade') {
            ctx.beginPath();
            ctx.arc(drawX + this.width / 2, drawY + this.height / 2, this.width / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
}
