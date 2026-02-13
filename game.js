/**
 * SOUNDLESS - COMPLETE REDESIGN (Classic Horror Edition)
 * Core Philosophy: Atmospheric survival, stillness is power, 3-room progression.
 */

class AudioEngine {
    constructor() {
        this.ctx = null;
        this.master = null;
        this.ambience = null;
    }

    async init() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.master.gain.value = 0.5;
        this.startDrone();
    }

    startDrone() {
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(45, this.ctx.currentTime);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(120, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.master);
        osc.start();
    }

    playSound(freq, vol, duration, type = 'sine') {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1, this.ctx.currentTime + duration);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playScream() {
        this.playSound(2000, 0.6, 1.2, 'sawtooth');
        this.playSound(40, 0.8, 1.5, 'triangle');
        // Add a distorted glitch burst
        for (let i = 0; i < 5; i++) {
            this.playSound(Math.random() * 500 + 50, 0.4, 0.3, 'square');
        }
    }

    playHeartbeat(intensity) {
        if (Math.random() > 0.1) return;
        this.playSound(60, intensity * 0.4, 0.1);
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.audio = new AudioEngine();

        this.state = 'MENU'; // MENU, PLAYING, FADING, GAMEOVER, WIN
        this.roomIndex = 0; // 0: Forest, 1: Tunnel, 2: Cabin
        this.noise = 0;
        this.moveTimer = 0;

        this.player = {
            x: 0, y: 0,
            targetX: null, targetY: null,
            angle: 0,
            radius: 15,
            isMoving: false,
            isRunning: false,
            speed: 2.2,
            runSpeed: 4.5
        };

        this.rooms = [
            { name: "THE DARK FOREST", flavor: "Find the lantern to unlock the path." },
            { name: "THE WHISPERING TUNNEL", flavor: "Voices in the dark... stay silent." },
            { name: "THE CABIN DOORSTEP", flavor: "Complete the ritual of silence." }
        ];

        this.ghost = { active: false, x: 0, y: 0, opacity: 0, speed: 5 }; // Base speed
        this.lantern = { x: 0, y: 0, collected: false, radius: 45 };
        this.house = { x: 0, y: 0, active: false };
        this.keys = {};

        this.bossTime = 0;
        this.bossRequired = 30;

        // Init Events
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('keydown', e => this.keys[e.key.toLowerCase()] = true);
        window.addEventListener('keyup', e => this.keys[e.key.toLowerCase()] = false);
        this.canvas.addEventListener('mousedown', e => this.handleInput(e));
        this.canvas.addEventListener('mousemove', e => { if (this.isMouseDown) this.handleInput(e); });
        document.getElementById('start-btn').onclick = () => this.start();

        // Touch Support for Mobile
        this.canvas.addEventListener('touchstart', e => this.handleTouch(e), { passive: false });
        this.canvas.addEventListener('touchmove', e => this.handleTouch(e), { passive: false });
        this.canvas.addEventListener('touchend', () => this.isMouseDown = false);

        this.resize();
        this.loop();
    }

    handleTouch(e) {
        e.preventDefault();
        if (this.state !== 'PLAYING' && this.state !== 'BOSS') return;
        this.isMouseDown = true;
        const touch = e.touches[0];
        this.player.targetX = touch.clientX;
        this.player.targetY = touch.clientY;
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.setupRoom();
    }

    setupRoom() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        // Players starts left, goes right
        this.player.x = 100;
        this.player.y = h / 2;
        this.player.targetX = null;

        this.lantern.collected = false;
        // Random lantern position in middle-right
        this.lantern.x = w * 0.6 + (Math.random() - 0.5) * 100;
        this.lantern.y = h * 0.5 + (Math.random() - 0.5) * 200;

        if (this.roomIndex === 2) {
            this.house.x = w * 0.85;
            this.house.y = h / 2;
            this.house.active = true;
        } else {
            this.house.active = false;
        }

        this.ghost.active = false;
        this.ghost.opacity = 0;

        document.getElementById('location-text').innerText = this.rooms[this.roomIndex].name;
    }

    async start() {
        await this.audio.init();
        document.getElementById('menu-overlay').classList.add('hidden');
        this.state = 'PLAYING';
    }

    handleInput(e) {
        if (this.state !== 'PLAYING') return;
        this.isMouseDown = true;
        this.player.targetX = e.clientX;
        this.player.targetY = e.clientY;
    }

    update() {
        if (this.state !== 'PLAYING') return;

        this.player.isRunning = this.keys['shift'];
        this.player.isMoving = false;

        // --- MOVEMENT ---
        let moveX = 0, moveY = 0;
        if (this.isMouseDown && this.player.targetX !== null) {
            const dx = this.player.targetX - this.player.x;
            const dy = this.player.targetY - this.player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 5) {
                const s = this.player.isRunning ? this.player.runSpeed : this.player.speed;
                moveX = (dx / dist) * s;
                moveY = (dy / dist) * s;
                this.player.angle = Math.atan2(dy, dx);
                this.player.isMoving = true;
            }
        } else {
            if (this.keys['w']) moveY -= 1;
            if (this.keys['s']) moveY += 1;
            if (this.keys['a']) moveX -= 1;
            if (this.keys['d']) moveX += 1;
            if (moveX !== 0 || moveY !== 0) {
                const s = this.player.isRunning ? this.player.runSpeed : this.player.speed;
                const mag = Math.sqrt(moveX * moveX + moveY * moveY);
                moveX = (moveX / mag) * s;
                moveY = (moveY / mag) * s;
                this.player.angle = Math.atan2(moveY, moveX);
                this.player.isMoving = true;
            }
        }

        this.player.x += moveX;
        this.player.y += moveY;

        // Boundaries
        this.player.x = Math.max(this.player.radius, this.player.x);
        this.player.y = Math.max(this.player.radius, Math.min(this.canvas.height - this.player.radius, this.player.y));

        // --- NOISE RULES ---
        if (this.player.isMoving) {
            this.moveTimer += 1 / 60;
            // DIFFICULTY SCALING: 
            // Room 0: 0.2 input, 6s safety
            // Room 1: 0.4 input, 4s safety
            // Room 2: 0.7 input, 2s safety
            const noiseGain = 0.2 + (this.roomIndex * 0.25);
            const moveLimit = 6 - (this.roomIndex * 1.5);

            let input = this.player.isRunning ? 1.8 : noiseGain;
            if (this.moveTimer > moveLimit) input += 2.5;
            this.noise = Math.min(100, this.noise + input);
        } else {
            this.moveTimer = 0;
            this.noise = Math.max(0, this.noise - 1.5);
        }

        if (this.noise > 40) this.audio.playHeartbeat(this.noise / 100);

        // --- GHOST LOGIC ---
        // Spawn ghost probability scales with difficulty
        const spawnChance = 0.03 + (this.roomIndex * 0.04);
        const noiseBarrier = 70 - (this.roomIndex * 15); // Easier to spawn in R3

        if (this.player.isMoving && !this.ghost.active && (this.noise > noiseBarrier || this.moveTimer > (6 - this.roomIndex * 1.5))) {
            if (Math.random() < spawnChance) {
                this.ghost.active = true;
                this.ghost.speed = 5.5 + (this.roomIndex * 1.5); // R1: 5.5, R2: 7, R3: 8.5 (V. FAST)
                const dist = 500;
                const a = Math.random() * Math.PI * 2;
                this.ghost.x = this.player.x + Math.cos(a) * dist;
                this.ghost.y = this.player.y + Math.sin(a) * dist;
            }
        }

        if (this.ghost.active) {
            const dx = this.player.x - this.ghost.x;
            const dy = this.player.y - this.ghost.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (this.player.isMoving) {
                this.ghost.opacity = Math.min(1, this.ghost.opacity + 0.03);
                this.ghost.x += (dx / dist) * this.ghost.speed;
                this.ghost.y += (dy / dist) * this.ghost.speed;
                // Collision
                if (dist < 30 && this.ghost.opacity > 0.6) this.triggerJumpscare();
            } else {
                // Safe if still
                this.ghost.opacity -= 0.02;
                if (this.ghost.opacity <= 0) this.ghost.active = false;
            }
        }

        // --- PROGRESSION ---
        // Collect Lantern
        if (!this.lantern.collected) {
            const dx = this.player.x - this.lantern.x;
            const dy = this.player.y - this.lantern.y;
            if (Math.sqrt(dx * dx + dy * dy) < 60) {
                this.lantern.collected = true;
                this.audio.playSound(440, 0.3, 0.5);
            }
        }

        // Transition Room
        if (this.lantern.collected && this.player.x > this.canvas.width - 20) {
            if (this.roomIndex < 2) {
                this.nextRoom();
            }
        }

        // Final Ritual
        if (this.house.active) {
            const dx = this.player.x - this.house.x;
            const dy = this.player.y - this.house.y;
            if (Math.sqrt(dx * dx + dy * dy) < 100) {
                if (this.noise < 10) {
                    this.bossTime += 1 / 60;
                    if (this.bossTime >= this.bossRequired) this.win();
                } else {
                    this.bossTime = 0;
                }
            }
        }

        this.updateHUD();
    }

    updateHUD() {
        const bar = document.getElementById('noise-bar-inner');
        bar.style.width = `${this.noise}%`;
        document.getElementById('noise-percent').innerText = `${Math.round(this.noise)}%`;

        const status = document.getElementById('status-text');
        if (this.ghost.active) {
            status.innerText = "ACTIVE PURSUIT";
            status.style.color = "var(--danger)";
        } else if (this.noise > 40) {
            status.innerText = "DETECTED";
            status.style.color = "#ffaa00";
        } else {
            status.innerText = "DORMANT";
            status.style.color = "var(--primary)";
        }

        if (this.state === 'BOSS_TRIAL') {
            // Show BOSS HUD
        }
    }

    nextRoom() {
        this.state = 'FADING';
        const fade = document.getElementById('fade-overlay');
        fade.classList.remove('hidden');
        setTimeout(() => {
            this.roomIndex++;
            this.setupRoom();
            fade.classList.add('hidden');
            this.state = 'PLAYING';
        }, 1000);
    }

    triggerJumpscare() {
        if (this.state === 'GAMEOVER') return;
        this.state = 'GAMEOVER';
        this.audio.playScream();
        document.getElementById('jumpscare-overlay').classList.add('active');

        // Intense screen flash & vibration
        document.body.style.backgroundColor = "#ff0000";
        document.body.style.animation = "intense 0.04s infinite";

        // Add actual physical shake to the canvas
        const canvas = document.getElementById('gameCanvas');
        canvas.style.filter = "invert(1) contrast(200%)";

        setTimeout(() => {
            document.body.style.animation = "";
            document.body.style.backgroundColor = "";
            canvas.style.filter = "";
            document.getElementById('jumpscare-overlay').classList.remove('active');
            document.getElementById('game-over-overlay').classList.remove('hidden');
        }, 1200);
    }

    win() {
        this.state = 'WIN';
        const title = document.getElementById('end-title');
        title.innerText = "HOME AT LAST";
        title.style.background = "var(--primary)";
        title.style.webkitBackgroundClip = "text";
        document.getElementById('end-msg').innerText = "You survived the silence.";
        document.getElementById('game-over-overlay').classList.remove('hidden');
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // --- AMBIENT PARTICLES ---
        this.drawFog();

        // --- LANTERN ---
        if (!this.lantern.collected) {
            this.drawLantern(this.lantern.x, this.lantern.y);
        } else if (this.roomIndex < 2) {
            // Draw Door
            this.drawGate();
        }

        // --- HOUSE ---
        if (this.house.active) {
            this.drawHouse(this.house.x, this.house.y);
        }

        // --- PLAYER ---
        this.drawPlayer();

        // --- GHOST ---
        if (this.ghost.active) {
            this.drawGhost();
        }
    }

    drawPlayer() {
        const { x, y, angle, isMoving, isRunning } = this.player;
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(angle + Math.PI / 2);

        const walk = isMoving ? Math.sin(Date.now() / (isRunning ? 50 : 100)) * 5 : 0;
        const breathe = Math.sin(Date.now() / 400) * 2;

        // Shadow
        this.ctx.fillStyle = "rgba(0,0,0,0.5)";
        this.ctx.beginPath(); this.ctx.ellipse(0, 5, 12, 6, 0, 0, Math.PI * 2); this.ctx.fill();

        // Realistic Coat / Body
        const grad = this.ctx.createLinearGradient(-10, 0, 10, 0);
        grad.addColorStop(0, '#111'); grad.addColorStop(0.5, '#222'); grad.addColorStop(1, '#111');
        this.ctx.fillStyle = grad;
        this.ctx.beginPath(); this.ctx.roundRect(-10, -12 + breathe, 20, 26, 6); this.ctx.fill();

        // Head
        this.ctx.fillStyle = "#d4af37"; // Golden hair hint
        this.ctx.beginPath(); this.ctx.arc(0, -20 + breathe, 7, 0, Math.PI * 2); this.ctx.fill();
        this.ctx.fillStyle = "#e0c0a0"; // Skin
        this.ctx.beginPath(); this.ctx.arc(0, -18 + breathe, 6, 0, Math.PI * 2); this.ctx.fill();

        // Legs
        this.ctx.strokeStyle = "#000";
        this.ctx.lineWidth = 6;
        this.ctx.beginPath(); this.ctx.moveTo(-5, 10); this.ctx.lineTo(-6, 22 + walk); this.ctx.stroke();
        this.ctx.beginPath(); this.ctx.moveTo(5, 10); this.ctx.lineTo(6, 22 - walk); this.ctx.stroke();

        this.ctx.restore();
    }

    drawLantern(x, y) {
        const t = Date.now();
        const pulse = Math.sin(t / 200) * 5 + 15;
        const glow = this.ctx.createRadialGradient(x, y, 0, x, y, pulse * 4);
        glow.addColorStop(0, 'rgba(0, 255, 204, 0.4)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        this.ctx.fillStyle = glow;
        this.ctx.beginPath(); this.ctx.arc(x, y, pulse * 4, 0, Math.PI * 2); this.ctx.fill();

        this.ctx.fillStyle = "#00ffcc";
        this.ctx.shadowBlur = 15; this.ctx.shadowColor = "#00ffcc";
        this.ctx.fillRect(x - 4, y - 10, 8, 20);
        this.ctx.shadowBlur = 0;
    }

    drawGate() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const grad = this.ctx.createLinearGradient(w - 50, 0, w, 0);
        grad.addColorStop(0, 'rgba(0, 255, 204, 0)');
        grad.addColorStop(1, 'rgba(0, 255, 204, 0.2)');
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(w - 100, 0, 100, h);

        this.ctx.strokeStyle = "rgba(0, 255, 204, 0.5)";
        this.ctx.setLineDash([10, 10]);
        this.ctx.beginPath(); this.ctx.moveTo(w - 10, 0); this.ctx.lineTo(w - 10, h); this.ctx.stroke();
        this.ctx.setLineDash([]);
    }

    drawHouse(x, y) {
        this.ctx.save();
        this.ctx.translate(x, y);

        // Cabin Glow
        const t = Date.now();
        const flicker = Math.sin(t / 50) * 5 + 40;
        const g = this.ctx.createRadialGradient(0, 20, 0, 0, 20, flicker * 2);
        g.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        this.ctx.fillStyle = g;
        this.ctx.beginPath(); this.ctx.arc(0, 20, flicker * 2, 0, Math.PI * 2); this.ctx.fill();

        // Ritual Circle (If player near)
        if (this.bossTime > 0) {
            this.ctx.strokeStyle = "var(--primary)";
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(0, 25, 80, 0, (this.bossTime / this.bossRequired) * Math.PI * 2);
            this.ctx.stroke();
        }

        this.ctx.fillStyle = "#fff";
        this.ctx.beginPath();
        this.ctx.moveTo(-40, 40); this.ctx.lineTo(40, 40); this.ctx.lineTo(40, 0); this.ctx.lineTo(0, -40); this.ctx.lineTo(-40, 0);
        this.ctx.closePath(); this.ctx.fill();
        this.ctx.fillStyle = "#000"; this.ctx.fillRect(-10, 15, 20, 25);
        this.ctx.restore();
    }

    drawGhost() {
        const { x, y, opacity } = this.ghost;
        this.ctx.save();
        this.ctx.globalAlpha = opacity;
        this.ctx.translate(x, y);

        const float = Math.sin(Date.now() / 200) * 10;
        this.ctx.fillStyle = "rgba(255, 0, 85, 0.3)";
        this.ctx.beginPath();
        this.ctx.moveTo(-30, 30);
        this.ctx.quadraticCurveTo(0, -60, 30, 30);
        this.ctx.lineTo(30, 60 + float);
        this.ctx.lineTo(-30, 60 + float);
        this.ctx.fill();

        this.ctx.fillStyle = "red";
        this.ctx.shadowBlur = 10; this.ctx.shadowColor = "red";
        this.ctx.beginPath(); this.ctx.arc(-10, -5, 4, 0, Math.PI * 2); this.ctx.fill();
        this.ctx.beginPath(); this.ctx.arc(10, -5, 4, 0, Math.PI * 2); this.ctx.fill();
        this.ctx.restore();
    }

    drawFog() {
        this.ctx.fillStyle = "rgba(255, 255, 255, 0.01)";
        for (let i = 0; i < 5; i++) {
            const x = (Math.sin(Date.now() / 2000 + i) * 100) + (this.canvas.width / 2);
            const y = (Math.cos(Date.now() / 3000 + i) * 100) + (this.canvas.height / 2);
            this.ctx.beginPath();
            this.ctx.arc(x, y, 400, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    loop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
}

window.onload = () => new Game();
