const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const currentScoreEl = document.getElementById('current-score');
const highScoreEl = document.getElementById('high-score');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');

const GROUND_Y = 220;
let highScore = localStorage.getItem('dino_high_score') || 0;
highScoreEl.innerText = String(highScore).padStart(5, '0');

let state = 'START'; // 'START', 'PLAYING', 'GAMEOVER'
let animationFrameId = null;
let lastTime = 0;
let score = 0;
let lastMilestone = 0;
let gameSpeed = 6;
let groundOffset = 0;

// Clouds & Ground details
let clouds = [
  { x: 200, y: 50, speed: 0.5 },
  { x: 500, y: 30, speed: 0.4 },
  { x: 750, y: 70, speed: 0.6 }
];

// Ground bumps
let bumps = [];
for (let i = 0; i < 20; i++) {
  bumps.push({
    x: Math.random() * 800,
    w: 2 + Math.random() * 6
  });
}

// Dino object
const dino = {
  x: 50,
  y: GROUND_Y - 44,
  baseWidth: 40,
  baseHeight: 44,
  width: 40,
  height: 44,
  vy: 0,
  gravity: 0.65,
  jumpStrength: -12.5,
  isGrounded: true,
  isDucking: false,
  legFrame: 0,
  legTimer: 0,

  reset() {
    this.y = GROUND_Y - 44;
    this.width = this.baseWidth;
    this.height = this.baseHeight;
    this.vy = 0;
    this.isGrounded = true;
    this.isDucking = false;
    this.legFrame = 0;
    this.legTimer = 0;
  },

  jump() {
    if (this.isGrounded && !this.isDucking) {
      this.vy = this.jumpStrength;
      this.isGrounded = false;
      if (window.sounds) window.sounds.playJump();
    }
  },

  duck(active) {
    if (!this.isGrounded) return;
    this.isDucking = active;
    if (active) {
      this.width = 54;
      this.height = 26;
      this.y = GROUND_Y - this.height;
    } else {
      this.width = this.baseWidth;
      this.height = this.baseHeight;
      this.y = GROUND_Y - this.height;
    }
  },

  update(dt) {
    // Jump physics
    if (!this.isGrounded) {
      this.vy += this.gravity;
      this.y += this.vy;
      if (this.y >= GROUND_Y - this.height) {
        this.y = GROUND_Y - this.height;
        this.vy = 0;
        this.isGrounded = true;
      }
    }

    // Running animation step
    this.legTimer += dt;
    if (this.legTimer > 80) {
      this.legTimer = 0;
      this.legFrame = (this.legFrame + 1) % 2;
    }
  },

  draw() {
    ctx.fillStyle = '#535353';

    if (this.isDucking) {
      // Ducking pose
      // Body
      ctx.fillRect(this.x, this.y + 6, 42, 16);
      // Head/snout stretched forward
      ctx.fillRect(this.x + 36, this.y + 4, 18, 14);
      // Eye
      ctx.fillStyle = '#fbfbfb';
      ctx.fillRect(this.x + 48, this.y + 6, 2, 2);
      ctx.fillStyle = '#535353';
      // Legs
      if (this.legFrame === 0) {
        ctx.fillRect(this.x + 12, this.y + 22, 5, 4);
        ctx.fillRect(this.x + 28, this.y + 22, 6, 4);
      } else {
        ctx.fillRect(this.x + 8, this.y + 22, 6, 4);
        ctx.fillRect(this.x + 24, this.y + 22, 5, 4);
      }
      return;
    }

    // Normal standing/running pose
    const x = this.x;
    const y = this.y;

    // Head
    ctx.fillRect(x + 20, y, 20, 16);
    // Snout
    ctx.fillRect(x + 34, y + 6, 6, 10);
    // Eye
    ctx.fillStyle = '#fbfbfb';
    ctx.fillRect(x + 28, y + 3, 3, 3);
    ctx.fillStyle = '#535353';

    // Body
    ctx.fillRect(x + 10, y + 14, 20, 20);
    // Back / tail
    ctx.fillRect(x + 2, y + 18, 10, 12);
    ctx.fillRect(x, y + 22, 4, 6);

    // Short arm
    ctx.fillRect(x + 30, y + 22, 6, 3);
    ctx.fillRect(x + 34, y + 24, 2, 4);

    // Legs
    if (!this.isGrounded) {
      // Jumping pose: legs tucked
      ctx.fillRect(x + 14, y + 34, 4, 6);
      ctx.fillRect(x + 22, y + 34, 4, 4);
    } else {
      if (this.legFrame === 0) {
        // Left down, right bent
        ctx.fillRect(x + 12, y + 34, 4, 10);
        ctx.fillRect(x + 12, y + 42, 7, 2);

        ctx.fillRect(x + 22, y + 34, 4, 6);
      } else {
        // Right down, left bent
        ctx.fillRect(x + 22, y + 34, 4, 10);
        ctx.fillRect(x + 22, y + 42, 7, 2);

        ctx.fillRect(x + 12, y + 34, 4, 6);
      }
    }
  }
};

// Obstacles
let obstacles = [];
let obstacleSpawnTimer = 0;
let nextSpawnInterval = 1200;

function createObstacle() {
  const isBird = score > 150 && Math.random() < 0.28;

  if (isBird) {
    // Bird obstacle (flying low or medium)
    const birdHeightMode = Math.random() < 0.5 ? 40 : 70; // 40 = requires duck, 70 = can jump/duck under
    return {
      type: 'bird',
      x: canvas.width + 20,
      y: GROUND_Y - birdHeightMode,
      width: 32,
      height: 20,
      wingState: 0,
      wingTimer: 0
    };
  } else {
    // Cactus (single, double, or small/tall)
    const cactusType = Math.floor(Math.random() * 3);
    if (cactusType === 0) {
      // Small single
      return { type: 'cactus', x: canvas.width + 20, y: GROUND_Y - 34, width: 16, height: 34 };
    } else if (cactusType === 1) {
      // Tall single
      return { type: 'cactus', x: canvas.width + 20, y: GROUND_Y - 46, width: 20, height: 46 };
    } else {
      // Double cactus cluster
      return { type: 'cactus', x: canvas.width + 20, y: GROUND_Y - 36, width: 34, height: 36 };
    }
  }
}

function drawCactus(ob) {
  ctx.fillStyle = '#535353';
  // Main trunk
  ctx.fillRect(ob.x + ob.width / 2 - 4, ob.y, 8, ob.height);

  // Side arms
  if (ob.width > 20) {
    // Left arm
    ctx.fillRect(ob.x, ob.y + 10, 4, 14);
    ctx.fillRect(ob.x, ob.y + 18, 8, 4);
    // Right arm
    ctx.fillRect(ob.x + ob.width - 5, ob.y + 6, 4, 14);
    ctx.fillRect(ob.x + ob.width - 9, ob.y + 14, 8, 4);
  } else {
    // Single arm
    ctx.fillRect(ob.x + 1, ob.y + 10, 3, 10);
    ctx.fillRect(ob.x + 1, ob.y + 16, 6, 3);
  }
}

function drawBird(ob) {
  ctx.fillStyle = '#535353';
  // Bird body
  ctx.fillRect(ob.x + 8, ob.y + 6, 18, 8);
  // Head & Beak
  ctx.fillRect(ob.x + 2, ob.y + 4, 8, 8);
  ctx.fillRect(ob.x, ob.y + 7, 3, 3);

  // Wings animated
  if (ob.wingState === 0) {
    // Wings up
    ctx.fillRect(ob.x + 12, ob.y - 6, 6, 12);
  } else {
    // Wings down
    ctx.fillRect(ob.x + 12, ob.y + 10, 6, 10);
  }
}

// Collisions with tight hitboxes
function checkCollision(dino, ob) {
  // Give dino and obstacle slight inward padding to make hitboxes forgiving and accurate
  const padDino = 4;
  const padOb = 3;

  return (
    dino.x + padDino < ob.x + ob.width - padOb &&
    dino.x + dino.width - padDino > ob.x + padOb &&
    dino.y + padDino < ob.y + ob.height - padOb &&
    dino.y + dino.height > ob.y + padOb
  );
}

function updateEnvironment(dt) {
  // Clouds
  clouds.forEach(c => {
    c.x -= c.speed;
    if (c.x < -60) {
      c.x = canvas.width + Math.random() * 80;
      c.y = 20 + Math.random() * 80;
    }
  });

  // Ground scroll
  groundOffset = (groundOffset + gameSpeed) % 800;

  // Bump positions
  bumps.forEach(b => {
    b.x -= gameSpeed;
    if (b.x < 0) {
      b.x = canvas.width + Math.random() * 50;
    }
  });
}

function drawEnvironment() {
  // Draw clouds
  ctx.fillStyle = '#c8c8c8';
  clouds.forEach(c => {
    ctx.fillRect(c.x, c.y, 40, 10);
    ctx.fillRect(c.x + 10, c.y - 6, 20, 6);
  });

  // Draw ground line
  ctx.strokeStyle = '#535353';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(canvas.width, GROUND_Y);
  ctx.stroke();

  // Draw tiny ground details
  ctx.fillStyle = '#777777';
  bumps.forEach(b => {
    ctx.fillRect(b.x, GROUND_Y + 4, b.w, 2);
  });
}

function resetGame() {
  score = 0;
  lastMilestone = 0;
  gameSpeed = 6;
  obstacles = [];
  obstacleSpawnTimer = 0;
  nextSpawnInterval = 1300;
  dino.reset();
  currentScoreEl.innerText = '00000';
  state = 'PLAYING';
  startScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
}

function gameOver() {
  state = 'GAMEOVER';
  if (window.sounds) window.sounds.playHit();
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('dino_high_score', highScore);
    highScoreEl.innerText = String(highScore).padStart(5, '0');
  }
  gameOverScreen.classList.remove('hidden');
}

function gameLoop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const dt = Math.min(timestamp - lastTime, 100);
  lastTime = timestamp;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawEnvironment();

  if (state === 'PLAYING') {
    updateEnvironment(dt);

    // Update score & speed
    score += Math.floor(dt * 0.05);
    currentScoreEl.innerText = String(score).padStart(5, '0');

    // Milestone sound every 100 points
    if (score >= lastMilestone + 100) {
      lastMilestone = Math.floor(score / 100) * 100;
      if (window.sounds) window.sounds.playScoreMilestone();
      gameSpeed += 0.25; // Gradual difficulty ramp
    }

    // Spawn obstacles
    obstacleSpawnTimer += dt;
    if (obstacleSpawnTimer > nextSpawnInterval) {
      obstacles.push(createObstacle());
      obstacleSpawnTimer = 0;
      // Random gap between spawns, decreases slightly with speed
      nextSpawnInterval = Math.max(750, 1400 - Math.random() * 500 - (gameSpeed * 20));
    }

    // Update obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const ob = obstacles[i];
      ob.x -= gameSpeed;

      if (ob.type === 'bird') {
        ob.wingTimer = (ob.wingTimer || 0) + dt;
        if (ob.wingTimer > 150) {
          ob.wingTimer = 0;
          ob.wingState = ob.wingState === 0 ? 1 : 0;
        }
      }

      // Check collision
      if (checkCollision(dino, ob)) {
        dino.draw();
        if (ob.type === 'cactus') drawCactus(ob);
        else drawBird(ob);
        gameOver();
        break;
      }

      // Remove off-screen obstacles
      if (ob.x + ob.width < -10) {
        obstacles.splice(i, 1);
      }
    }

    dino.update(dt);
  }

  // Draw obstacles
  obstacles.forEach(ob => {
    if (ob.type === 'cactus') drawCactus(ob);
    else drawBird(ob);
  });

  // Draw Dino
  dino.draw();

  animationFrameId = requestAnimationFrame(gameLoop);
}

// User input handling
function handleJumpAction() {
  if (state === 'START' || state === 'GAMEOVER') {
    resetGame();
  } else if (state === 'PLAYING') {
    dino.jump();
  }
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    handleJumpAction();
  } else if (e.code === 'ArrowDown') {
    e.preventDefault();
    if (state === 'PLAYING') {
      dino.duck(true);
    }
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowDown') {
    if (state === 'PLAYING') {
      dino.duck(false);
    }
  }
});

// Touch / Mouse support
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  handleJumpAction();
});

startBtn.addEventListener('click', () => {
  handleJumpAction();
});

restartBtn.addEventListener('click', () => {
  handleJumpAction();
});

// Kick off loop
animationFrameId = requestAnimationFrame(gameLoop);

