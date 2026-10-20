export class Particle {
    constructor(x, y, color, velocity, lifeTime, type = 'standard') {
        this.x = x;
        this.y = y;
        this.color = color;
        this.velocity = velocity;
        this.lifeTime = lifeTime;
        this.maxLifeTime = lifeTime;
        this.type = type;
        this.scale = 1;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 10;
    }

    update(deltaTime) {
        this.x += this.velocity.x * deltaTime;
        this.y += this.velocity.y * deltaTime;
        this.lifeTime -= deltaTime;
        this.scale = Math.max(0, (this.lifeTime / this.maxLifeTime));
        this.rotation += this.rotationSpeed * deltaTime;

        if (this.type === 'glitch') {
            this.x += (Math.random() - 0.5) * 10;
        } else if (this.type === 'spark') {
            this.velocity.x *= 0.95;
            this.velocity.y *= 0.95;
        }
    }

    draw(ctx, camera) {
        if (this.scale <= 0) return;
        const alpha = Math.min(1, this.scale);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        
        const drawX = this.x - camera.x;
        const drawY = this.y - camera.y;

        if (this.type === 'glitch') {
            ctx.fillRect(drawX - this.velocity.x * 0.2 * this.scale, drawY - this.velocity.y * 0.2 * this.scale, 6 * this.scale, 2 * this.scale);
        } else if (this.type === 'spark') {
            ctx.beginPath();
            ctx.arc(drawX, drawY, 2 * this.scale, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillRect(drawX - this.velocity.x * 0.1 * this.scale, drawY - this.velocity.y * 0.1 * this.scale, 3 * this.scale, 3 * this.scale);
        }
        ctx.restore();
        ctx.globalAlpha = 1.0;
    }

    isDead() {
        return this.lifeTime <= 0;
    }
}

export class FloatingText {
    constructor(x, y, text, color = '#fff') {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.lifeTime = 1.0;
        this.maxLifeTime = 1.0;
        this.velocity = { x: (Math.random() - 0.5) * 40, y: -50 };
    }

    update(deltaTime) {
        this.x += this.velocity.x * deltaTime;
        this.y += this.velocity.y * deltaTime;
        this.lifeTime -= deltaTime;
        this.velocity.y += 20 * deltaTime; // Gravity effect
    }

    draw(ctx, camera) {
        const alpha = Math.max(0, this.lifeTime / this.maxLifeTime);
        const drawX = this.x - camera.x;
        const drawY = this.y - camera.y;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.font = `bold ${20 * alpha}px "Courier New"`;
        ctx.textAlign = 'center';
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fillText(this.text, drawX, drawY);
        ctx.restore();
        ctx.globalAlpha = 1.0;
    }

    isDead() {
        return this.lifeTime <= 0;
    }
}

export class ParticleSystem {
    constructor() {
        this.particles = [];
        this.floatingTexts = [];
    }

    emit(x, y, color, count = 10, type = 'standard') {
        for (let i = 0; i < count; i++) {
            const velocity = {
                x: (Math.random() - 0.5) * 200,
                y: (Math.random() - 0.5) * 200
            };
            this.particles.push(new Particle(x, y, color, velocity, 0.5 + Math.random() * 0.5, type));
        }
    }

    emitBurst(x, y, color, count = 20) {
        for (let i = 0; i < count; i++) {
            const velocity = {
                x: (Math.random() - 0.5) * 400,
                y: (Math.random() - 0.5) * 400
            };
            this.particles.push(new Particle(x, y, color, velocity, 0.8 + Math.random() * 0.4, 'spark'));
        }
    }

    emitText(x, y, text, color = '#fff') {
        this.floatingTexts.push(new FloatingText(x, y, text, color));
    }

    update(deltaTime) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update(deltaTime);
            if (this.particles[i].isDead()) {
                this.particles.splice(i, 1);
            }
        }
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            this.floatingTexts[i].update(deltaTime);
            if (this.floatingTexts[i].isDead()) {
                this.floatingTexts.splice(i, 1);
            }
        }
    }

    draw(ctx, camera) {
        for (const particle of this.particles) {
            particle.draw(ctx, camera);
        }
        for (const text of this.floatingTexts) {
            text.draw(ctx, camera);
        }
    }
}
