import { Entity } from '../entities/entity.js';
import { Projectile } from '../entities/projectile.js';
import { audio } from './audio.js';
import { Collision } from '../utils/collision.js';
import { ParticleSystem } from './particles.js';

export const GameState = {
    MENU: 'MENU',
    PLAYING: 'PLAYING',
    GAME_OVER: 'GAME_OVER',
    GAME_WIN: 'GAME_WIN'
};

export class Engine {
    constructor(canvas, ctx, input) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.input = input;
        this.state = GameState.MENU;
        this.running = false;
        this.lastTime = 0;
        this.entities = [];
        this.level = null;
        this.camera = { x: 0, y: 0, width: 0, height: 0 };
        this.score = 0;
        this.dataCollected = 0;
        this.totalData = 1;
        this.combo = 0;
        this.comboTimer = 0;
        this.gameOver = false;
        this.gameWin = false;
        this.onWin = null;
        this.particleSystem = new ParticleSystem();
        this.shakeAmount = 0;
        this.glitchTimer = 0;
        this.damageFlashTimer = 0;
        this.timeScale = 1;
        this.dashTimeScaleTimer = 0;
        this.highScore = parseInt(localStorage.getItem('neonBreachHighScore')) || 0;
    }

    shake(amount = 5) {
        this.shakeAmount = amount;
        this.glitchTimer = 0.2;
    }

    init() {
        console.log('Initializing Engine...');
        this.resize();
        this.camera.width = this.canvas.width;
        this.camera.height = this.canvas.height;
        console.log('Engine initialized');
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.camera.width = this.canvas.width;
        this.camera.height = this.canvas.height;
    }

    loadLevel(levelData) {
        this.input.reset();
        this.entities = [...levelData.entities];
        this.dataCollected = 0;
        this.score = 0;
        this.combo = 0;
        this.comboTimer = 0;
        this.gameOver = false;
        this.gameWin = false;
        this.totalData = levelData.totalData || 1;
        this.state = GameState.PLAYING;
    }

    start() {
        if (this.state === GameState.PLAYING && this.running) return;
        if (this.state === GameState.MENU) {
            this.state = GameState.PLAYING;
        }
        this.running = true;
        this.lastTime = performance.now();
        requestAnimationFrame(this.loop.bind(this));
    }

    restart() {
        this.running = false;
        this.state = GameState.MENU;
    }

    loop(currentTime) {
        if (!this.running) return;

        const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
        this.lastTime = currentTime;

        if (this.state === GameState.PLAYING) {
            this.update(deltaTime);
            this.draw();
        } else if (this.state === GameState.MENU) {
            this.drawMenu();
        } else if (this.state === GameState.GAME_OVER || this.state === GameState.GAME_WIN) {
            this.drawOverlay(this.state === GameState.GAME_OVER ? 'MISSION FAILED' : 'MISSION SUCCESS', this.state === GameState.GAME_OVER ? '#ff0044' : '#00ffff', `Final Score: ${this.score}`);
        }

        requestAnimationFrame(this.loop.bind(this));
    }

    update(deltaTime) {
        if (this.gameOver || this.gameWin) return;

        if (this.dashTimeScaleTimer > 0) {
            this.dashTimeScaleTimer -= deltaTime;
            this.timeScale = 0.4;
        } else {
            this.timeScale = 1.0;
        }

        if (this.shakeAmount > 0) {
            this.shakeAmount *= Math.max(0, deltaTime * 10);
            if (this.shakeAmount < 0.1) this.shakeAmount = 0;
        }
        if (this.glitchTimer > 0) {
            this.glitchTimer -= deltaTime;
        }
        if (this.damageFlashTimer > 0) {
            this.damageFlashTimer -= deltaTime;
        }

        const player = this.entities.find(e => e.constructor.name === 'Player');
        if (!player) return;

        // Player shooting
        if (player.weaponMode === 'NORMAL') {
            if (this.input.isJustPressedCode('Space') && player.ammo > 0) {
                player.ammo--;
                player.triggerMuzzleFlash();
                const bullet = new Projectile(player.position.x + player.width/2, player.position.y + player.height/2, player.direction);
                this.entities.push(bullet);
                this.particleSystem.emit(player.position.x, player.position.y, '#fff', 5);
                this.shake(3);
                audio.playShoot();
            }
        } else if (player.weaponMode === 'RAPID') {
            if (this.input.isPressed('Space') && player.ammo > 0 && Math.random() < 0.5) {
                player.ammo -= 0.2;
                if (player.ammo < 0) player.ammo = 0;
                player.triggerMuzzleFlash();
                const bullet = new Projectile(player.position.x + player.width/2, player.position.y + player.height/2, player.direction);
                this.entities.push(bullet);
                this.particleSystem.emit(player.position.x, player.position.y, '#fff', 2);
                this.shake(1);
                audio.playShoot();
            }
        }

        // Update all entities
        for (const entity of this.entities) {
            const name = entity.constructor.name;
            if (name === 'Player') {
                entity.update(deltaTime * this.timeScale, this.input, this.level ? this.level.tilemap : null, this);
            } else if (name === 'Enemy' || name === 'SniperEnemy' || name === 'ChargerEnemy') {
                entity.update(deltaTime * this.timeScale, this.level ? this.level.tilemap : null, player, this);
            } else {
                entity.update(deltaTime * this.timeScale);
            }
        }

        // Collision detection
        this.handleCollisions(player);
        // Projectile collision detection
        this.handleProjectileCollisions();

        // Remove dead entities
        this.entities = this.entities.filter(e => !e.isDead());

        // Check player damage indicator
        if (player.hitFlashTimer > 0) {
            this.particleSystem.emitBurst(player.position.x, player.position.y, '#ff0044', 5, 'glitch');
        }

        // Camera follow (smooth)
        const targetCamX = player.position.x - this.camera.width / 2;
        const targetCamY = player.position.y - this.camera.height / 2;
        this.camera.x += (targetCamX - this.camera.x) * 0.1;
        this.camera.y += (targetCamY - this.camera.y) * 0.1;

        // Check game state
        if (player.health <= 0) {
            if (!this.gameOver) {
                this.gameOver = true;
                this.state = GameState.GAME_OVER;
                audio.playDeath();
                if (this.score > this.highScore) {
                    this.highScore = this.score;
                    localStorage.setItem('neonBreachHighScore', this.highScore.toString());
                }
            }
        }
        if (this.dataCollected >= this.totalData) {
            if (!this.gameWin) {
                this.gameWin = true;
                this.state = GameState.GAME_WIN;
                if (this.onWin) this.onWin();
                if (this.score > this.highScore) {
                    this.highScore = this.score;
                    localStorage.setItem('neonBreachHighScore', this.highScore.toString());
                }
            }
        }

        if (this.comboTimer > 0) {
            this.comboTimer -= deltaTime;
            if (this.comboTimer <= 0) {
                this.combo = 0;
            }
        }

        if (this.gameOver || this.gameWin) {
            if (this.input.isJustPressedCode('KeyR')) {
                this.restart();
            }
        }

        // Update UI
        this.updateUI(player);
        
        // Update particles
        this.input.update();
        this.particleSystem.update(deltaTime);
    }

    handleCollisions(player) {
        for (const entity of this.entities) {
            if (entity === player) continue;

            // Collision with enemies
            if (entity.constructor.name === 'Enemy' || entity.constructor.name === 'SniperEnemy' || entity.constructor.name === 'ChargerEnemy') {
                // Check distance for vision cone detection
                const toPlayer = player.position.sub(entity.position);
                const distance = toPlayer.magnitude();
                if (distance < entity.visionRange) {
                    const angleToPlayer = Math.atan2(toPlayer.y, toPlayer.x);
                    const enemyAngle = Math.atan2(entity.direction.y, entity.direction.x);
                    let angleDiff = Math.abs(angleToPlayer - enemyAngle);
                    if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;

                    if (angleDiff < entity.visionAngle / 2) {
                        player.health -= 0.5; 
                        this.shake(2);
                        audio.playHit();
                        this.particleSystem.emitText(player.position.x, player.position.y, "-0.5", '#ff0044');
                    }
                }

                // Touch collision
                if (Collision.aabb(
                    { x: player.position.x, y: player.position.y, width: player.width, height: player.height },
                    { x: entity.position.x, y: entity.position.y, width: entity.width, height: entity.height }
                )) {
                    player.health -= 1;
                    this.particleSystem.emit(entity.position.x, entity.position.y, '#ff0000', 10);
                    this.damageFlashTimer = 0.2;
                    this.particleSystem.emitText(player.position.x, player.position.y, "-1", '#ff0000');
                    this.shake(5);
                    if (player.hit) player.hit();
                    audio.playHit();
                }
            }

            // Collision with items
            if (entity.constructor.name === 'Item') {
                if (Collision.aabb(
                    { x: player.position.x, y: player.position.y, width: player.width, height: player.height },
                    { x: entity.position.x, y: entity.position.y, width: entity.width, height: entity.height }
                )) {
                    if (entity.type === 'data') {
                        this.dataCollected++;
                        this.particleSystem.emit(entity.position.x, entity.position.y, '#00ffff', 20);
                        audio.playCollect();
                    } else if (entity.type === 'ammo') {
                        player.ammo += 5;
                        this.particleSystem.emit(entity.position.x, entity.position.y, '#ffff00', 20);
                        audio.playCollect();
                    } else if (entity.type === 'health') {
                        player.health = Math.min(player.maxHealth, player.health + 30);
                        this.particleSystem.emit(entity.position.x, entity.position.y, '#ff00ff', 20);
                        this.shake(2);
                        audio.playCollect();
                    } else if (entity.type === 'weapon_upgrade') {
                        player.setWeaponMode('RAPID', 10);
                        this.particleSystem.emit(entity.position.x, entity.position.y, '#00ff00', 25);
                        this.particleSystem.emitText(entity.position.x, entity.position.y, "WEAPON UPGRADE!", "#00ff00");
                        audio.playCollect();
                    }
                    entity.die(); 
                }
            }
        }
    }

    handleProjectileCollisions() {
        for (const entity of this.entities) {
            if (entity.constructor.name === 'Projectile') {
                for (const e of this.entities) {
                    if ((e.constructor.name === 'Enemy' || e.constructor.name === 'SniperEnemy' || e.constructor.name === 'ChargerEnemy') && Collision.aabb(
                        { x: entity.position.x, y: entity.position.y, width: 10, height: 10 },
                        { x: e.position.x, y: e.position.y, width: e.width, height: e.height }
                    )) {
                        const damage = 1;
                        e.health -= damage;
                        e.hitFlashTimer = 0.2;
                        entity.lifeTime = 0;
                        this.particleSystem.emit(e.position.x, e.position.y, '#ff0044', 15, 'spark');
                        this.particleSystem.emitText(e.position.x, e.position.y, `${damage}`, '#ff0044');
                        if (e.health <= 0) {
                            e.die();
                            audio.playExplosion();
                            const scoreGain = 100 * (this.combo + 1);
                            this.score += scoreGain;
                            this.particleSystem.emitText(e.position.x, e.position.y, `+${scoreGain}`, '#ffff00');
                            this.combo++;
                            this.comboTimer = 3;
                            this.particleSystem.emit(e.position.x, e.position.y, '#ffff00', 30, 'spark');
                        }
                        this.shake(2);
                    }
                }
            }
        }
    }

    updateUI(player) {
        const healthEl = document.getElementById('health-bar');
        if (healthEl) healthEl.style.width = `${(player.health / player.maxHealth) * 100}%`;
        
        const ammoEl = document.getElementById('ammo-value');
        if (ammoEl) ammoEl.textContent = Math.floor(player.ammo);
        
        const dataValEl = document.getElementById('data-value');
        if (dataValEl) dataValEl.textContent = this.dataCollected;
        
        const dataTotalEl = document.getElementById('data-total');
        if (dataTotalEl) dataTotalEl.textContent = this.totalData;

        const scoreEl = document.getElementById('score-value');
        if (scoreEl) scoreEl.textContent = this.score;

        const comboEl = document.getElementById('combo-value');
        if (comboEl) {
            comboEl.textContent = this.combo > 1 ? `x${this.combo}` : '';
            comboEl.style.display = this.combo > 1 ? 'block' : 'none';
        }
    }

    draw() {
        const player = this.entities.find(e => e.constructor.name === 'Player');
        
        // Clear canvas
        this.ctx.fillStyle = '#050505';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.save();

        // Apply shake
        if (this.shakeAmount > 0) {
            this.ctx.translate(
                (Math.random() - 0.5) * this.shakeAmount,
                (Math.random() - 0.5) * this.shakeAmount
            );
        }

        // Glitch effect
        if (this.glitchTimer > 0) {
            this.ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
        }

        // Draw tilemap
        if (this.level && this.level.tilemap) {
            this.level.tilemap.draw(this.ctx, this.camera);
        }

        // Draw entities
        for (const entity of this.entities) {
            entity.draw(this.ctx, this.camera);
        }

        // Draw particles
        this.particleSystem.draw(this.ctx, this.camera);

        // Apply darkness
        this.applyDarkness(player);

        this.ctx.restore();

        // Apply bloom to the whole scene (including light holes)
        this.applyBloom();

        // Draw scanlines on top
        this.drawScanlines();

        // Draw damage vignette
        if (this.damageFlashTimer > 0) {
            this.ctx.save();
            this.ctx.globalAlpha = this.damageFlashTimer;
            this.ctx.fillStyle = '#ff0000';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.restore();
        }
    }

    drawMenu() {
        this.ctx.fillStyle = '#050505';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Glitch effect for title
        if (this.glitchTimer > 0) {
            this.ctx.fillStyle = '#ff00ff';
            this.ctx.font = '64px "Courier New"';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('NEON BREACH', this.canvas.width/2 + (Math.random() - 0.5) * 15, this.canvas.height/2 - 40);
        }

        this.ctx.fillStyle = '#00ffff';
        this.ctx.font = '64px "Courier New"';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('NEON BREACH', this.canvas.width/2, this.canvas.height/2 - 40);
        
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '24px "Courier New"';
        this.ctx.fillText('Press Space to Start', this.canvas.width/2, this.canvas.height/2 + 40);
        
        this.drawScanlines();
    }

    applyDarkness(player) {
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'multiply';
        this.ctx.fillStyle = '#0a0a0f';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.globalCompositeOperation = 'destination-out';
        
        // Light around player
        if (player) {
            const px = player.position.x - this.camera.x + player.width/2;
            const py = player.position.y - this.camera.y + player.height/2;
            if (Number.isFinite(px) && Number.isFinite(py)) {
                const grad = this.ctx.createRadialGradient(px, py, 10, px, py, 250);
                grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
                grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                this.ctx.fillStyle = grad;
                this.ctx.beginPath();
                this.ctx.arc(px, py, 250, 0, Math.PI * 2);
                this.ctx.fill();
            } else {
                console.error('Darkness error: Non-finite player position', { px, py });
            }
        }

        // Light around enemies (their vision)
        for (const entity of this.entities) {
            if (entity.constructor.name === 'Enemy' || entity.constructor.name === 'SniperEnemy' || entity.constructor.name === 'ChargerEnemy') {
                const ex = entity.position.x - this.camera.x + entity.width/2;
                const ey = entity.position.y - this.camera.y + entity.height/2;
                const er = entity.visionRange;
                if (Number.isFinite(ex) && Number.isFinite(ey) && Number.isFinite(er)) {
                    const grad = this.ctx.createRadialGradient(ex, ey, 10, ex, ey, er);
                    grad.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
                    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                    this.ctx.fillStyle = grad;
                    this.ctx.beginPath();
                    this.ctx.arc(ex, ey, er, 0, Math.PI * 2);
                    this.ctx.fill();
                } else {
                    console.error('Darkness error: Non-finite enemy position', { ex, ey, er });
                }
            }
        }
        this.ctx.restore();
    }

    applyBloom() {
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'screen';
        this.ctx.filter = 'blur(4px)';
        this.ctx.drawImage(this.canvas, 0, 0);
        this.ctx.restore();
    }

    drawOverlay(text, color, subtext = 'Press R to Restart') {
        this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Glitch effect for text
        if (this.glitchTimer > 0) {
            this.ctx.fillStyle = '#ff00ff';
            this.ctx.font = '48px "Courier New"';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(text, this.canvas.width/2 + (Math.random() - 0.5) * 10, this.canvas.height/2 - 40);
            
            this.ctx.fillStyle = '#00ffff';
            this.ctx.fillText(text, this.canvas.width/2 + (Math.random() - 0.5) * 10, this.canvas.height/2 - 40);
        }

        this.ctx.fillStyle = color;
        this.ctx.font = '48px "Courier New"';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(text, this.canvas.width/2, this.canvas.height/2 - 40);
        this.ctx.font = '24px "Courier New"';
        this.ctx.fillText(subtext, this.canvas.width/2, this.canvas.height/2 + 20);
        
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '18px "Courier New"';
        this.ctx.fillText(`High Score: ${this.highScore}`, this.canvas.width/2, this.canvas.height/2 + 60);
    }

    drawScanlines() {
        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(0, 255, 255, 0.05)';
        this.ctx.lineWidth = 1;
        for (let i = 0; i < this.canvas.height; i += 4) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, i);
            this.ctx.lineTo(this.canvas.width, i);
            this.ctx.stroke();
        }
        this.ctx.restore();
    }
}
