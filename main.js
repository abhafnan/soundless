import { AudioManager } from './audio-manager.js';

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.audio = new AudioManager();

        // Game State
        this.state = 'MENU'; // MENU, PLAYING, BOSS, GAMEOVER, WIN
        this.score = 0;
        this.targetScore = 5;
        this.noise = 0;
        this.noiseThreshold = 70;
        this.monstersStronger = 1;

        // Player
        this.player = {
            x: 0,
            y: 0,
            radius: 15,
            speed: 2,
            runSpeed: 5,
            isMoving: false,
            isRunning: false
        };

        // Entities
        this.monsters = [];
        this.checkpoints = [];

        // Boss Mechanic
        this.bossTimer = 30;
        this.bossSilenceTime = 0;

        // Controls
        this.keys = {};

        // Bindings
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('keydown', (e) => this.keys[e.key.toLowerCase()] = true);
        window.addEventListener('keyup', (e) => this.keys[e.key.toLowerCase()] = false);

        document.getElementById('start-btn').addEventListener('click', () => this.start());
        document.getElementById('restart-btn').addEventListener('click', () => location.reload());

        this.resize();
        this.initWorld();
        this.loop();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.player.x = this.canvas.width / 2;
        this.player.y = this.canvas.height / 2;
    }

    initWorld() {
        this.checkpoints = [];
        for (let i = 0; i < this.targetScore; i++) {
            this.spawnCheckpoint();
        }
    }

    spawnCheckpoint() {
        this.checkpoints.push({
            x: Math.random() * (this.canvas.width - 100) + 50,
            y: Math.random() * (this.canvas.height - 100) + 50,
            radius: 20,
            collected: false
        });
    }

    async start() {
        const micEnabled = document.getElementById('mic-enable').checked;
        if (micEnabled) {
            await this.audio.init();
        }

        document.getElementById('menu-overlay').classList.add('hidden');
        this.state = 'PLAYING';
    }

    update() {
        if (this.state !== 'PLAYING' && this.state !== 'BOSS') return;

        // 1. Noise Calculation
        let currentNoiseInput = 0;

        // Movement noise
        this.player.isMoving = this.keys['w'] || this.keys['a'] || this.keys['s'] || this.keys['d'];
        this.player.isRunning = this.keys['shift'];

        if (this.player.isMoving) {
            currentNoiseInput += this.player.isRunning ? 40 : 5;
        }

        // Mic noise
        if (this.audio.micEnabled) {
            const micVol = this.audio.update();
            currentNoiseInput += micVol;

            // Whisper power-up (Visual pulse and slow down monsters)
            if (this.audio.isWhispering) {
                this.monstersStronger = 0.5;
            } else {
                this.monstersStronger = 1 + (this.noise / 50);
            }
        } else {
            this.monstersStronger = 1 + (this.noise / 50);
        }

        // Decay noise, but input builds it
        if (currentNoiseInput > 0) {
            this.noise = Math.min(100, this.noise + currentNoiseInput * 0.1);
        } else {
            this.noise = Math.max(0, this.noise - 0.5);
        }

        // 2. Player Movement
        const speed = this.player.isRunning ? this.player.runSpeed : this.player.speed;
        if (this.keys['w']) this.player.y -= speed;
        if (this.keys['s']) this.player.y += speed;
        if (this.keys['a']) this.player.x -= speed;
        if (this.keys['d']) this.player.x += speed;

        // Boundary check
        this.player.x = Math.max(this.player.radius, Math.min(this.canvas.width - this.player.radius, this.player.x));
        this.player.y = Math.max(this.player.radius, Math.min(this.canvas.height - this.player.radius, this.player.y));

        // 3. Monster Logic
        // Spawn monster if noise is too high
        if (this.noise > this.noiseThreshold && Math.random() < 0.02) {
            this.spawnMonster();
        }

        this.monsters.forEach((m, index) => {
            // Monsters move towards player if player makes noise
            if (this.noise > 10) {
                const dx = this.player.x - m.x;
                const dy = this.player.y - m.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // Base speed + noise factor
                const mSpeed = (0.5 + (this.noise / 40)) * this.monstersStronger;
                m.x += (dx / dist) * mSpeed;
                m.y += (dy / dist) * mSpeed;

                // Collision with player
                if (dist < this.player.radius + m.radius) {
                    this.gameOver();
                }
            } else {
                // Idle movement
                m.x += (Math.random() - 0.5) * 0.5;
                m.y += (Math.random() - 0.5) * 0.5;
            }
        });

        // 4. Checkpoint Collection
        this.checkpoints.forEach(cp => {
            if (!cp.collected) {
                const dx = this.player.x - cp.x;
                const dy = this.player.y - cp.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < this.player.radius + cp.radius) {
                    cp.collected = true;
                    this.score++;
                    if (this.score >= this.targetScore && this.state === 'PLAYING') {
                        this.triggerBoss();
                    }
                }
            }
        });

        // 5. Boss Logic (Silent twist)
        if (this.state === 'BOSS') {
            if (this.noise < 5) {
                this.bossSilenceTime += 1 / 60; // Assuming 60fps
                if (this.bossSilenceTime >= 30) {
                    this.win();
                }
            } else {
                // If you make noise, timer resets!
                this.bossSilenceTime = 0;
            }
            this.updateBossUI();
        }

        this.updateUI();
    }

    spawnMonster() {
        const side = Math.floor(Math.random() * 4);
        let x, y;
        if (side === 0) { x = Math.random() * this.canvas.width; y = -50; }
        else if (side === 1) { x = Math.random() * this.canvas.width; y = this.canvas.height + 50; }
        else if (side === 2) { x = -50; y = Math.random() * this.canvas.height; }
        else { x = this.canvas.width + 50; y = Math.random() * this.canvas.height; }

        this.monsters.push({
            x, y,
            radius: 12,
            type: 'stalker'
        });
    }

    triggerBoss() {
        this.state = 'BOSS';
        this.monsters = []; // Clear small monsters
        document.getElementById('boss-timer-container').classList.remove('hidden');
        document.getElementById('message-display').innerText = "THE VOID IS AWAKE. REMAIN ABSOLUTELY SILENT.";
        document.getElementById('message-display').classList.remove('hidden');
    }

    updateUI() {
        const noiseBar = document.getElementById('noise-bar-inner');
        const noisePercent = document.getElementById('noise-percent');
        const statusEl = document.getElementById('player-status');
        const scoreEl = document.getElementById('score');

        noiseBar.style.width = `${this.noise}%`;
        noisePercent.innerText = `${Math.round(this.noise)}%`;
        scoreEl.innerText = `${this.score}/${this.targetScore}`;

        if (this.noise > 70) {
            statusEl.innerText = "DANGER";
            statusEl.className = "value danger";
            document.querySelector('.noise-warning').style.opacity = 1;
        } else if (this.noise > 30) {
            statusEl.innerText = "NOISY";
            statusEl.className = "value warning";
            document.querySelector('.noise-warning').style.opacity = 0;
        } else {
            statusEl.innerText = "SILENT";
            statusEl.className = "value safe";
            document.querySelector('.noise-warning').style.opacity = 0;
        }
    }

    updateBossUI() {
        const timeLeft = Math.max(0, 30 - this.bossSilenceTime);
        document.getElementById('boss-timer-text').innerText = Math.ceil(timeLeft);

        const offset = 283 - (this.bossSilenceTime / 30) * 283;
        document.getElementById('timer-path-remaining').style.strokeDashoffset = offset;
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Ambient darkness pulse
        const pulse = Math.sin(Date.now() / 1000) * 0.05 + 0.1;
        this.ctx.fillStyle = `rgba(10, 0, 20, ${pulse})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw Checkpoints
        this.checkpoints.forEach(cp => {
            if (!cp.collected) {
                const grad = this.ctx.createRadialGradient(cp.x, cp.y, 0, cp.x, cp.y, cp.radius * 2);
                grad.addColorStop(0, 'rgba(0, 255, 204, 0.8)');
                grad.addColorStop(1, 'rgba(0, 255, 204, 0)');
                this.ctx.fillStyle = grad;
                this.ctx.beginPath();
                this.ctx.arc(cp.x, cp.y, cp.radius * 1.5, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });

        // Draw Monsters
        this.monsters.forEach(m => {
            this.ctx.fillStyle = 'rgba(255, 0, 80, 0.8)';
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = 'red';
            this.ctx.beginPath();
            this.ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
            this.ctx.fill();

            // Static effect
            for (let i = 0; i < 3; i++) {
                this.ctx.strokeStyle = `rgba(255,255,255,${Math.random() * 0.5})`;
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                this.ctx.moveTo(m.x - 15, m.y + (Math.random() - 0.5) * 20);
                this.ctx.lineTo(m.x + 15, m.y + (Math.random() - 0.5) * 20);
                this.ctx.stroke();
            }
        });
        this.ctx.shadowBlur = 0;

        // Draw Player
        const playerColor = this.audio.isWhispering ? '#00ffff' : '#ffffff';
        this.ctx.fillStyle = playerColor;
        this.ctx.shadowBlur = this.player.isRunning ? 20 : 5;
        this.ctx.shadowColor = '#fff';
        this.ctx.beginPath();
        this.ctx.arc(this.player.x, this.player.y, this.player.radius, 0, Math.PI * 2);
        this.ctx.fill();

        // Player noise ripple
        if (this.noise > 5) {
            this.ctx.strokeStyle = `rgba(255, 255, 255, ${1 - this.noise / 100})`;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(this.player.x, this.player.y, this.player.radius + (Date.now() % 1000) / 10, 0, Math.PI * 2);
            this.ctx.stroke();
        }

        // Boss Entity Visual
        if (this.state === 'BOSS') {
            this.drawBoss();
        }
    }

    drawBoss() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;

        // Giant pulsating void
        const size = 150 + Math.sin(Date.now() / 500) * 20;
        const grad = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, size);
        grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
        grad.addColorStop(0.5, 'rgba(20, 0, 40, 0.8)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, size, 0, Math.PI * 2);
        this.ctx.fill();

        // Static particles around boss
        for (let i = 0; i < 50; i++) {
            this.ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.2})`;
            this.ctx.fillRect(
                centerX + (Math.random() - 0.5) * size * 2,
                centerY + (Math.random() - 0.5) * size * 2,
                2, 2
            );
        }
    }

    gameOver() {
        this.state = 'GAMEOVER';
        document.getElementById('game-over-overlay').classList.remove('hidden');
        document.getElementById('game-over-title').innerText = "YOU WERE HEARD";
        document.getElementById('game-over-msg').innerText = "The Echo Stalkers found you in the noise.";
    }

    win() {
        this.state = 'WIN';
        document.getElementById('game-over-overlay').classList.remove('hidden');
        document.getElementById('game-over-title').innerText = "SILENCE ACHIEVED";
        document.getElementById('game-over-title').style.color = "var(--safe-color)";
        document.getElementById('game-over-msg').innerText = "The Void has stabilized. You have survived the Soundless World.";
        document.getElementById('restart-btn').innerText = "RESTART JOURNEY";
    }

    loop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
}

new Game();
