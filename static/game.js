const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// 画面設定
const SCREEN_WIDTH = canvas.width;
const SCREEN_HEIGHT = canvas.height;

// 色の定義
const COLORS = {
  BLACK: "#000000",
  WHITE: "#FFFFFF",
  RED: "#FF0000",
  PURPLE: "#800080",
  YELLOW: "#FFFF00",
  GREEN: "#00FF00",
  CYAN: "#00FFFF",
  ORANGE: "#FFA500",
  CRIMSON: "#DC143C", // 貫通弾の色
  LIGHT_BLUE: "#ADD8E6",
  LIME_GREEN: "#32CD32",
  DARK_GRAY: "#646464",
};

// --- グローバルゲーム状態 ---
let score = 0;
let gameOver = false;
let gameStartTime = 0;
let currentDifficultyLevel = 1;
const DIFFICULTY_INTERVAL = 30000;
const MAX_DIFFICULTY_LEVEL = 10;
let lastTime = 0; // deltaTime計算用

let bullets = [];
let enemies = [];
let freeRoamEnemies = [];
let explosionBullets = [];
let healthOrbs = [];

let currentEliteEnemy = null;
let currentBarrageEnemy = null;
let currentEliteRedEnemy = null;
let currentEliteGreenEnemy = null;

let lastShotTime = 0;
let lastEnemySpawnTime = 0;
let lastEliteEnemySpawnTime = 0;
let lastFreeroamSpawnTime = 0;
let lastBarrageSpawnTime = 0;
let lastEliteRedSpawnTime = 0;
let lastEliteGreenSpawnTime = 0;

// --- プレイヤー設定 ---
const player = {
  width: 20,
  height: 20,
  x: (SCREEN_WIDTH - 20) / 2,
  y: SCREEN_HEIGHT - 20 - 30,
  speed: 3.0 * 60,
  hp: 100,
  maxHp: 100,
  lastHitTime: 0,
  invincibilityDuration: 1000,
  // バフ状態
  shotsActive: false,
  shotsStartTime: 0,
  shotsDuration: 5000,
  shields: 0,
  shieldObjectSize: 30,
  shieldOffsetAngle: 0,
  pierceActive: false,
  pierceStartTime: 0,
  pierceDuration: 7000,
};

// 弾の設定
const bulletSettings = {
  width: 5,
  height: 15,
  speed: 12 * 60,
  cooldown: 100,
};

// 敵の設定
const enemySettings = {
  width: 30,
  height: 30,
  speedBase: 2.2 * 60,
  spawnIntervalBase: 1000,
  perWave: 4,
  spacing: 40,
};

const freeroamEnemySettings = {
  spawnIntervalBase: 2000,
  speedBase: 3.8 * 60,
};

// --- クラス定義 ---

// プレイヤーが発射する拡散弾 (★修正点)
class PlayerSpreadBullet {
  constructor(x, y, angleDeg, speed) {
    this.width = bulletSettings.width;
    this.height = bulletSettings.height;
    this.x = x;
    this.y = y;
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;
    this.vx = speed * Math.cos(angleRad);
    this.vy = speed * Math.sin(angleRad);
  }
  update(deltaTime) {
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
  }
  // 弾の色が変わるように修正
  draw() {
    ctx.fillStyle = player.pierceActive ? COLORS.CRIMSON : COLORS.WHITE;
    ctx.fillRect(this.x, this.y, this.width, this.height);
  }
}

// 隊列雑魚敵
class Enemy {
  constructor(x, y, width, height, speed, type = "straight") {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.speed = speed;
    this.type = type;
    this.originalX = x;
    this.waveAmplitude = 70;
    this.waveFrequency = 0.08;
    this.startTime = performance.now();
  }
  update(deltaTime) {
    const move = this.speed * deltaTime;
    if (this.type === "wave") {
      const elapsedTime = (performance.now() - this.startTime) / 1000.0;
      this.y += move;
      this.x = this.originalX + this.waveAmplitude * Math.sin(this.waveFrequency * elapsedTime * 10);
    } else {
      this.y += move;
    }
  }
  draw() {
    ctx.fillStyle = COLORS.RED;
    ctx.fillRect(this.x, this.y, this.width, this.height);
  }
}

// 自由飛行雑魚敵
class FreeRoamEnemy {
  constructor(startX, startY, speed) {
    this.width = 25;
    this.height = 25;
    this.x = startX;
    this.y = startY;
    this.speed = speed;
    this.targetX = Math.random() * (SCREEN_WIDTH - this.width);
    this.targetY = Math.random() * (SCREEN_HEIGHT / 2);
    this.targetTolerance = 10;
    this.mode = Math.random() < 0.5 ? "roam" : "chase";
    this.chaseTargetUpdateInterval = 1000;
    this.lastChaseTargetUpdate = performance.now();
    this.bullets = [];
    this.hasShot = false;
    this.shotDelay = 1000 + Math.random() * 1000;
    this.spawnTime = performance.now();
  }
  update(deltaTime) {
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < this.targetTolerance && this.mode === "roam") {
      this.targetX = Math.random() * (SCREEN_WIDTH - this.width);
      this.targetY = Math.random() * (SCREEN_HEIGHT / 2);
    }
    if (dist > 0) {
      const move = this.speed * deltaTime;
      this.x += (dx / dist) * move;
      this.y += (dy / dist) * move;
    }
    const currentTime = performance.now();
    if (!this.hasShot && currentTime - this.spawnTime > this.shotDelay) {
      this.shoot();
      this.hasShot = true;
    }
    this.bullets.forEach((b) => b.update(deltaTime));
    this.bullets = this.bullets.filter(
      (b) => b.y > -b.height && b.y < SCREEN_HEIGHT && b.x > -b.width && b.x < SCREEN_WIDTH
    );
  }
  shoot() {
    const bulletX = this.x + this.width / 2;
    const bulletY = this.y + this.height / 2;
    this.bullets.push(
      new GenericEnemyBullet(
        bulletX,
        bulletY,
        player.x + player.width / 2,
        player.y + player.height / 2,
        8,
        8,
        6 * 60,
        COLORS.CYAN,
        10
      )
    );
  }
  draw() {
    ctx.fillStyle = COLORS.CYAN;
    ctx.fillRect(this.x, this.y, this.width, this.height);
    this.bullets.forEach((b) => b.draw());
  }
}

// 汎用敵弾丸クラス
class GenericEnemyBullet {
  constructor(x, y, targetX, targetY, width, height, speed, color, damage) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.speed = speed;
    this.color = color;
    this.damage = damage;
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    this.vx = dist === 0 ? 0 : (dx / dist) * this.speed;
    this.vy = dist === 0 ? this.speed : (dy / dist) * this.speed;
  }
  update(deltaTime) {
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
  }
  draw() {
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.width, this.height);
  }
}

// 汎用エリート敵クラス
class BaseEliteEnemy {
  constructor(config) {
    this.width = config.width;
    this.height = config.height;
    this.x = config.x !== undefined ? config.x : Math.random() * (SCREEN_WIDTH - this.width);
    this.y = -this.height * 2;
    this.speed = config.speed;
    this.targetY = config.targetY;
    this.hp = config.hp;
    this.maxHp = config.maxHp;
    this.isActive = true;
    this.lastShotTime = 0;
    this.shotCooldownBase = config.shotCooldownBase;
    this.bullets = [];
    this.color = config.color;
    this.onDefeat = config.onDefeat;
  }
  update(shotCooldown, deltaTime) {
    if (this.y < this.targetY) this.y += this.speed * deltaTime;
  }
  draw() {
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.width, this.height);
    const hpBarWidth = this.width;
    const hpBarHeight = 8;
    const hpRatio = this.hp / this.maxHp;
    ctx.fillStyle = COLORS.RED;
    ctx.fillRect(this.x, this.y - hpBarHeight - 3, hpBarWidth, hpBarHeight);
    ctx.fillStyle = COLORS.GREEN;
    ctx.fillRect(this.x, this.y - hpBarHeight - 3, hpBarWidth * hpRatio, hpBarHeight);
  }
  takeDamage(damage) {
    this.hp -= damage;
    score += 5;
    if (this.hp <= 0) {
      score += 100;
      this.isActive = false;
      this.onDefeat(this);
      return true;
    }
    return false;
  }
}

// エリート敵（紫）
class EliteEnemy extends BaseEliteEnemy {
  static spawnInterval = 5500;
  constructor() {
    super({
      width: 60,
      height: 60,
      x: (SCREEN_WIDTH - 60) / 2,
      speed: 1.2 * 60,
      targetY: 100,
      hp: 120,
      maxHp: 120,
      shotCooldownBase: 1000,
      color: COLORS.PURPLE,
      onDefeat: () => {
        console.log("エリート敵（紫）を撃破しました！");
        player.shotsActive = true;
        player.shotsStartTime = performance.now();
        console.log("スプレッドショット獲得！");
      },
    });
  }
  update(shotCooldown, deltaTime) {
    super.update(shotCooldown, deltaTime);
    const currentTime = performance.now();
    if (this.y >= this.targetY && currentTime - this.lastShotTime > shotCooldown) {
      this.shoot();
      this.lastShotTime = currentTime;
    }
    this.bullets.forEach((b) => b.update(deltaTime));
    this.bullets = this.bullets.filter((b) => b.y < SCREEN_HEIGHT && b.x > -b.width && b.x < SCREEN_WIDTH);
  }
  shoot() {
    const bulletY = this.y + this.height;
    const spawnOffset = this.width / 4;
    const playerTargetX = player.x + player.width / 2;
    const playerTargetY = player.y + player.height / 2;
    const bulletSpeed = 8 * 60;
    const bulletDamage = 25;
    const bulletX1 = this.x + spawnOffset - 15 / 2;
    this.bullets.push(
      new GenericEnemyBullet(
        bulletX1,
        bulletY,
        playerTargetX,
        playerTargetY,
        15,
        15,
        bulletSpeed,
        COLORS.YELLOW,
        bulletDamage
      )
    );
    const bulletX2 = this.x + this.width - spawnOffset - 15 / 2;
    this.bullets.push(
      new GenericEnemyBullet(
        bulletX2,
        bulletY,
        playerTargetX,
        playerTargetY,
        15,
        15,
        bulletSpeed,
        COLORS.YELLOW,
        bulletDamage
      )
    );
  }
  draw() {
    super.draw();
    this.bullets.forEach((b) => b.draw());
  }
}

// 花火弾幕のオーブ
class BarrageOrb {
  constructor(x, y) {
    this.width = 40;
    this.height = 40;
    this.speed = 2 * 60;
    this.x = x;
    this.y = y;
    this.hp = 3;
    this.maxHp = 3;
    this.exploded = false;
    this.explosionCooldown = 2000;
    this.spawnTime = performance.now();
  }
  update(deltaTime) {
    this.y += this.speed * deltaTime;
    if (this.y > SCREEN_HEIGHT - this.height || performance.now() - this.spawnTime > this.explosionCooldown) {
      if (!this.exploded) {
        this.exploded = true;
        return true;
      }
    }
    return false;
  }
  draw() {
    ctx.fillStyle = COLORS.ORANGE;
    ctx.fillRect(this.x, this.y, this.width, this.height);
    const hpBarWidth = this.width;
    const hpBarHeight = 5;
    const hpRatio = this.hp / this.maxHp;
    ctx.fillStyle = COLORS.RED;
    ctx.fillRect(this.x, this.y - hpBarHeight - 2, hpBarWidth, hpBarHeight);
    ctx.fillStyle = COLORS.GREEN;
    ctx.fillRect(this.x, this.y - hpBarHeight - 2, hpBarWidth * hpRatio, hpBarHeight);
  }
}

// 花火弾幕敵（オレンジ）
class BarrageEnemy extends BaseEliteEnemy {
  static spawnInterval = 20000;
  constructor() {
    super({
      width: 70,
      height: 70,
      speed: 0.8 * 60,
      targetY: Math.random() * (SCREEN_HEIGHT / 3) + 50,
      hp: 180,
      maxHp: 180,
      shotCooldownBase: 3000,
      color: COLORS.ORANGE,
      onDefeat: () => {
        console.log("花火弾幕敵（オレンジ）を撃破しました！");
        player.shields = 3;
        console.log(`シールド獲得！残り ${player.shields} 回`);
      },
    });
    this.barrageOrbs = [];
  }
  update(orbCooldown, deltaTime) {
    super.update(orbCooldown, deltaTime);
    const currentTime = performance.now();
    if (this.y >= this.targetY && currentTime - this.lastShotTime > orbCooldown) {
      this.spawnOrb();
      this.lastShotTime = currentTime;
    }
    this.barrageOrbs.forEach((orb) => {
      if (orb.update(deltaTime)) {
        this.generateExplosionBullets(orb.x + orb.width / 2, orb.y + orb.height / 2);
        this.barrageOrbs.splice(this.barrageOrbs.indexOf(orb), 1);
      }
    });
  }
  spawnOrb() {
    const orbX = this.x + this.width / 2 - 40 / 2;
    const orbY = this.y + this.height;
    this.barrageOrbs.push(new BarrageOrb(orbX, orbY));
  }
  generateExplosionBullets(x, y) {
    const numBullets = 16;
    for (let i = 0; i < numBullets; i++) {
      const angle = ((2 * Math.PI) / numBullets) * i;
      const targetX = x + Math.cos(angle) * 100;
      const targetY = y + Math.sin(angle) * 100;
      explosionBullets.push(new GenericEnemyBullet(x, y, targetX, targetY, 8, 8, 5 * 60, COLORS.YELLOW, 8));
    }
  }
  draw() {
    super.draw();
    this.barrageOrbs.forEach((orb) => orb.draw());
  }
}

// エリート敵（赤）
class EliteRedEnemy extends BaseEliteEnemy {
  static spawnInterval = 12000;
  constructor() {
    super({
      width: 50,
      height: 50,
      speed: 1.5 * 60,
      targetY: 150,
      hp: 70,
      maxHp: 70,
      shotCooldownBase: 500,
      color: COLORS.CRIMSON,
      onDefeat: () => {
        console.log("エリート敵（赤）を撃破しました！");
        player.pierceActive = true;
        player.pierceStartTime = performance.now();
        console.log("貫通弾獲得！");
      },
    });
  }
  update(shotCooldown, deltaTime) {
    super.update(shotCooldown, deltaTime);
    const currentTime = performance.now();
    if (this.y >= this.targetY && currentTime - this.lastShotTime > shotCooldown) {
      this.shoot();
      this.lastShotTime = currentTime;
    }
    this.bullets.forEach((b) => b.update(deltaTime));
    this.bullets = this.bullets.filter((b) => b.y < SCREEN_HEIGHT && b.x > -b.width && b.x < SCREEN_WIDTH);
  }
  shoot() {
    const baseAngle = Math.atan2(
      player.y + player.height / 2 - (this.y + this.height / 2),
      player.x + player.width / 2 - (this.x + this.width / 2)
    );
    const spreadAngle = (15 * Math.PI) / 180;
    for (let i = -1; i <= 1; i++) {
      const angle = baseAngle + i * spreadAngle;
      const bulletX = this.x + this.width / 2;
      const bulletY = this.y + this.height / 2;
      const targetBulletX = bulletX + Math.cos(angle) * 100;
      const targetBulletY = bulletY + Math.sin(angle) * 100;
      this.bullets.push(
        new GenericEnemyBullet(bulletX, bulletY, targetBulletX, targetBulletY, 10, 10, 9 * 60, COLORS.CRIMSON, 15)
      );
    }
  }
  draw() {
    super.draw();
    this.bullets.forEach((b) => b.draw());
  }
}

// 壁弾丸
class ObstacleBullet {
  constructor(x, y) {
    this.width = 40;
    this.height = 20;
    this.speed = 2 * 60;
    this.x = x;
    this.y = y;
    this.hp = 10;
    this.maxHp = 10;
  }
  update(deltaTime) {
    this.y += this.speed * deltaTime;
  }
  draw() {
    ctx.fillStyle = COLORS.DARK_GRAY;
    ctx.fillRect(this.x, this.y, this.width, this.height);
    const hpBarWidth = this.width;
    const hpBarHeight = 4;
    const hpRatio = this.hp / this.maxHp;
    ctx.fillStyle = COLORS.RED;
    ctx.fillRect(this.x, this.y - hpBarHeight - 2, hpBarWidth, hpBarHeight);
    ctx.fillStyle = COLORS.GREEN;
    ctx.fillRect(this.x, this.y - hpBarHeight - 2, hpBarWidth * hpRatio, hpBarHeight);
  }
}

// エリート敵（緑）
class EliteGreenEnemy extends BaseEliteEnemy {
  static spawnInterval = 16000;
  constructor() {
    super({
      width: 80,
      height: 80,
      speed: 1.0 * 60,
      targetY: 100,
      hp: 350,
      maxHp: 350,
      shotCooldownBase: 2500,
      color: COLORS.LIME_GREEN,
      onDefeat: (self) => {
        console.log("エリート敵（緑）を撃破しました！");
        const dropX = self.x + self.width / 2;
        const dropY = self.y + self.height / 2;
        healthOrbs.push(new HealthOrb(dropX, dropY));
        console.log("回復オーブが出現！");
      },
    });
  }
  update(shotCooldown, deltaTime) {
    super.update(shotCooldown, deltaTime);
    const currentTime = performance.now();
    if (this.y >= this.targetY && currentTime - this.lastShotTime > shotCooldown) {
      this.shoot();
      this.lastShotTime = currentTime;
    }
    this.bullets.forEach((b) => b.update(deltaTime));
    this.bullets = this.bullets.filter((b) => b.y < SCREEN_HEIGHT);
  }
  shoot() {
    const numWalls = 3;
    const wallSpacing = 150;
    const startXOffset = Math.random() * 100 - 50;
    for (let i = 0; i < numWalls; i++) {
      const bulletX = this.x + this.width / 2 + (i - Math.floor(numWalls / 2)) * wallSpacing + startXOffset;
      const bulletY = this.y + this.height;
      this.bullets.push(new ObstacleBullet(bulletX, bulletY));
    }
  }
  draw() {
    super.draw();
    this.bullets.forEach((b) => b.draw());
  }
}

// 回復オーブ
class HealthOrb {
  constructor(x, y) {
    this.width = 25;
    this.height = 25;
    this.speed = 3 * 60;
    this.x = x - this.width / 2;
    this.y = y - this.height / 2;
    this.healAmount = 40;
  }
  update(deltaTime) {
    this.y += this.speed * deltaTime;
  }
  draw() {
    ctx.fillStyle = COLORS.GREEN;
    ctx.beginPath();
    ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.width / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- 入力ハンドラ ---
const keys = {};
window.addEventListener("keydown", (e) => {
  keys[e.code] = true;
});
window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

// --- ヘルパー関数 ---
function getAdjustedValue(baseValue, level, reductionRate = 0.9, increaseRate = 1.1) {
  const power = level - 1;
  if (baseValue >= 1000) return baseValue * Math.pow(reductionRate, power);
  else return baseValue * Math.pow(increaseRate, power);
}
function checkCollision(rect1, rect2) {
  return (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
  );
}

// --- ゲーム初期化 ---
function resetGame() {
  score = 0;
  gameOver = false;
  gameStartTime = performance.now();
  currentDifficultyLevel = 1;
  lastTime = 0;
  player.hp = player.maxHp;
  player.x = (SCREEN_WIDTH - player.width) / 2;
  player.y = SCREEN_HEIGHT - player.height - 30;
  player.shotsActive = false;
  player.shields = 0;
  player.pierceActive = false;
  bullets = [];
  enemies = [];
  freeRoamEnemies = [];
  explosionBullets = [];
  healthOrbs = [];
  currentEliteEnemy = null;
  currentBarrageEnemy = null;
  currentEliteRedEnemy = null;
  currentEliteGreenEnemy = null;
  lastShotTime = 0;
  lastEnemySpawnTime = 0;
  lastEliteEnemySpawnTime = 0;
  lastFreeroamSpawnTime = 0;
  lastBarrageSpawnTime = 0;
  lastEliteRedSpawnTime = 0;
  lastEliteGreenSpawnTime = 0;
  console.log("Game Restarted!");
}

// --- 更新処理 ---
function update(deltaTime) {
  if (gameOver) {
    if (keys["KeyR"]) resetGame();
    return;
  }

  const currentTime = performance.now();
  const elapsedGameTime = currentTime - gameStartTime;
  const newDifficultyLevel = Math.min(MAX_DIFFICULTY_LEVEL, 1 + Math.floor(elapsedGameTime / DIFFICULTY_INTERVAL));
  if (newDifficultyLevel !== currentDifficultyLevel) {
    currentDifficultyLevel = newDifficultyLevel;
    console.log(`難易度レベルが ${currentDifficultyLevel} に上昇しました！`);
  }

  const currentEnemySpeed = getAdjustedValue(enemySettings.speedBase, currentDifficultyLevel, 1, 1.05);
  const currentEnemySpawnInterval = getAdjustedValue(enemySettings.spawnIntervalBase, currentDifficultyLevel);
  const currentFreeroamEnemySpeed = getAdjustedValue(freeroamEnemySettings.speedBase, currentDifficultyLevel, 1, 1.07);
  const currentFreeroamSpawnInterval = getAdjustedValue(
    freeroamEnemySettings.spawnIntervalBase,
    currentDifficultyLevel
  );
  const currentEliteShotCooldown = getAdjustedValue(new EliteEnemy().shotCooldownBase, currentDifficultyLevel);
  const currentBarrageOrbCooldown = getAdjustedValue(new BarrageEnemy().shotCooldownBase, currentDifficultyLevel);
  const currentEliteRedShotCooldown = getAdjustedValue(new EliteRedEnemy().shotCooldownBase, currentDifficultyLevel);
  const currentEliteGreenShotCooldown = getAdjustedValue(
    new EliteGreenEnemy().shotCooldownBase,
    currentDifficultyLevel
  );

  if (player.shotsActive && currentTime - player.shotsStartTime > player.shotsDuration) {
    player.shotsActive = false;
    console.log("スプレッドショット効果終了");
  }
  if (player.pierceActive && currentTime - player.pierceStartTime > player.pierceDuration) {
    player.pierceActive = false;
    console.log("貫通弾効果終了");
  }

  if (keys["KeyA"] || keys["ArrowLeft"]) player.x -= player.speed * deltaTime;
  if (keys["KeyD"] || keys["ArrowRight"]) player.x += player.speed * deltaTime;
  if (keys["KeyW"] || keys["ArrowUp"]) player.y -= player.speed * deltaTime;
  if (keys["KeyS"] || keys["ArrowDown"]) player.y += player.speed * deltaTime;
  player.x = Math.max(0, Math.min(player.x, SCREEN_WIDTH - player.width));
  player.y = Math.max(0, Math.min(player.y, SCREEN_HEIGHT - player.height));

  if (currentTime - lastShotTime > bulletSettings.cooldown) {
    const bulletXCenter = player.x + player.width / 2;
    const bulletYBase = player.y;
    if (player.shotsActive) {
      bullets.push({
        x: bulletXCenter - bulletSettings.width / 2,
        y: bulletYBase,
        width: bulletSettings.width,
        height: bulletSettings.height,
      });
      bullets.push(new PlayerSpreadBullet(bulletXCenter, bulletYBase, -45, bulletSettings.speed));
      bullets.push(new PlayerSpreadBullet(bulletXCenter, bulletYBase, 45, bulletSettings.speed));
    } else {
      bullets.push({
        x: bulletXCenter - bulletSettings.width / 2,
        y: bulletYBase,
        width: bulletSettings.width,
        height: bulletSettings.height,
      });
    }
    lastShotTime = currentTime;
  }

  bullets.forEach((b) => {
    if (b instanceof PlayerSpreadBullet) b.update(deltaTime);
    else b.y -= bulletSettings.speed * deltaTime;
  });
  enemies.forEach((e) => e.update(deltaTime));
  freeRoamEnemies.forEach((e) => e.update(deltaTime));
  explosionBullets.forEach((b) => b.update(deltaTime));
  healthOrbs.forEach((o) => o.update(deltaTime));

  if (currentTime - lastEnemySpawnTime > currentEnemySpawnInterval) {
    const startX =
      Math.random() * (SCREEN_WIDTH - (enemySettings.width + enemySettings.spacing) * enemySettings.perWave);
    for (let i = 0; i < enemySettings.perWave; i++) {
      const enemyX = startX + (enemySettings.width + enemySettings.spacing) * i;
      enemies.push(
        new Enemy(enemyX, -enemySettings.height, enemySettings.width, enemySettings.height, currentEnemySpeed, "wave")
      );
    }
    lastEnemySpawnTime = currentTime;
  }
  if (currentTime - lastFreeroamSpawnTime > currentFreeroamSpawnInterval) {
    const side = Math.floor(Math.random() * 3);
    let spawnX, spawnY;
    if (side === 0) {
      spawnX = -30;
      spawnY = Math.random() * SCREEN_HEIGHT;
    } else if (side === 1) {
      spawnX = SCREEN_WIDTH + 5;
      spawnY = Math.random() * SCREEN_HEIGHT;
    } else {
      spawnX = Math.random() * SCREEN_WIDTH;
      spawnY = SCREEN_HEIGHT + 5;
    }
    freeRoamEnemies.push(new FreeRoamEnemy(spawnX, spawnY, currentFreeroamEnemySpeed));
    lastFreeroamSpawnTime = currentTime;
  }

  if (!currentEliteEnemy && currentTime - lastEliteEnemySpawnTime > EliteEnemy.spawnInterval) {
    currentEliteEnemy = new EliteEnemy();
    lastEliteEnemySpawnTime = currentTime;
  }
  if (currentEliteEnemy) currentEliteEnemy.update(currentEliteShotCooldown, deltaTime);
  if (!currentBarrageEnemy && currentTime - lastBarrageSpawnTime > BarrageEnemy.spawnInterval) {
    currentBarrageEnemy = new BarrageEnemy();
    lastBarrageSpawnTime = currentTime;
  }
  if (currentBarrageEnemy) currentBarrageEnemy.update(currentBarrageOrbCooldown, deltaTime);
  if (!currentEliteRedEnemy && currentTime - lastEliteRedSpawnTime > EliteRedEnemy.spawnInterval) {
    currentEliteRedEnemy = new EliteRedEnemy();
    lastEliteRedSpawnTime = currentTime;
  }
  if (currentEliteRedEnemy) currentEliteRedEnemy.update(currentEliteRedShotCooldown, deltaTime);
  if (!currentEliteGreenEnemy && currentTime - lastEliteGreenSpawnTime > EliteGreenEnemy.spawnInterval) {
    currentEliteGreenEnemy = new EliteGreenEnemy();
    lastEliteGreenSpawnTime = currentTime;
  }
  if (currentEliteGreenEnemy) currentEliteGreenEnemy.update(currentEliteGreenShotCooldown, deltaTime);

  // --- 衝突判定 (★修正点: 復活) ---
  const playerRect = { x: player.x, y: player.y, width: player.width, height: player.height };

  // プレイヤー弾 vs 敵
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    let bulletRemoved = false;
    // vs 隊列雑魚
    for (let j = enemies.length - 1; j >= 0; j--) {
      if (checkCollision(bullet, enemies[j])) {
        if (!player.pierceActive) {
          bullets.splice(i, 1);
          bulletRemoved = true;
        }
        enemies.splice(j, 1);
        score += 10;
        if (bulletRemoved) break;
      }
    }
    if (bulletRemoved) continue;
    // vs 自由飛行雑魚
    for (let j = freeRoamEnemies.length - 1; j >= 0; j--) {
      if (checkCollision(bullet, freeRoamEnemies[j])) {
        if (!player.pierceActive) {
          bullets.splice(i, 1);
          bulletRemoved = true;
        }
        freeRoamEnemies.splice(j, 1);
        score += 15;
        if (bulletRemoved) break;
      }
    }
    if (bulletRemoved) continue;
    // vs エリート敵
    const eliteEnemies = [currentEliteEnemy, currentBarrageEnemy, currentEliteRedEnemy, currentEliteGreenEnemy];
    for (const elite of eliteEnemies) {
      if (elite && elite.isActive && checkCollision(bullet, elite)) {
        if (!player.pierceActive) {
          bullets.splice(i, 1);
          bulletRemoved = true;
        }
        if (elite.takeDamage(10)) {
          if (elite === currentEliteEnemy) currentEliteEnemy = null;
          if (elite === currentBarrageEnemy) currentBarrageEnemy = null;
          if (elite === currentEliteRedEnemy) currentEliteRedEnemy = null;
          if (elite === currentEliteGreenEnemy) currentEliteGreenEnemy = null;
        }
        if (bulletRemoved) break;
      }
    }
    if (bulletRemoved) continue;
    // vs 花火オーブ
    if (currentBarrageEnemy) {
      for (let j = currentBarrageEnemy.barrageOrbs.length - 1; j >= 0; j--) {
        const orb = currentBarrageEnemy.barrageOrbs[j];
        if (checkCollision(bullet, orb)) {
          if (!player.pierceActive) {
            bullets.splice(i, 1);
            bulletRemoved = true;
          }
          orb.hp -= 1;
          score += 5;
          if (orb.hp <= 0) {
            currentBarrageEnemy.generateExplosionBullets(orb.x + orb.width / 2, orb.y + orb.height / 2);
            currentBarrageEnemy.barrageOrbs.splice(j, 1);
            score += 20;
          }
          if (bulletRemoved) break;
        }
      }
    }
    if (bulletRemoved) continue;
    // vs 壁弾丸
    if (currentEliteGreenEnemy) {
      for (let j = currentEliteGreenEnemy.bullets.length - 1; j >= 0; j--) {
        const wall = currentEliteGreenEnemy.bullets[j];
        if (checkCollision(bullet, wall)) {
          if (!player.pierceActive) {
            bullets.splice(i, 1);
            bulletRemoved = true;
          }
          wall.hp -= 1;
          score += 1;
          if (wall.hp <= 0) {
            currentEliteGreenEnemy.bullets.splice(j, 1);
          }
          if (bulletRemoved) break;
        }
      }
    }
  }

  // 敵 vs プレイヤー
  if (currentTime - player.lastHitTime > player.invincibilityDuration) {
    let damageTaken = 0;
    let hitSource = null;
    const checkPlayerCollision = (targets, damage, removeOnHit = true) => {
      for (let i = targets.length - 1; i >= 0; i--) {
        if (checkCollision(playerRect, targets[i])) {
          damageTaken += targets[i].damage || damage;
          hitSource = targets[i];
          if (removeOnHit) targets.splice(i, 1);
          return true;
        }
      }
      return false;
    };

    let collisionFound = false;
    for (const fr_enemy of freeRoamEnemies) {
      if (checkPlayerCollision(fr_enemy.bullets, 0)) {
        collisionFound = true;
        break;
      }
    }

    if (!collisionFound) {
      if (checkPlayerCollision(enemies, 20)) {
      } else if (checkPlayerCollision(freeRoamEnemies, 20)) {
      } else if (checkPlayerCollision(explosionBullets, 0)) {
      } else if (currentEliteEnemy && checkPlayerCollision(currentEliteEnemy.bullets, 0)) {
      } else if (currentEliteRedEnemy && checkPlayerCollision(currentEliteRedEnemy.bullets, 0)) {
      } else if (currentBarrageEnemy && checkPlayerCollision(currentBarrageEnemy.barrageOrbs, 15, false)) {
        currentBarrageEnemy.generateExplosionBullets(
          hitSource.x + hitSource.width / 2,
          hitSource.y + hitSource.height / 2
        );
        currentBarrageEnemy.barrageOrbs.splice(currentBarrageEnemy.barrageOrbs.indexOf(hitSource), 1);
      } else {
        const eliteCollisions = [
          { e: currentEliteEnemy, d: 30 },
          { e: currentBarrageEnemy, d: 30 },
          { e: currentEliteRedEnemy, d: 40 },
          { e: currentEliteGreenEnemy, d: 35 },
        ];
        for (const item of eliteCollisions) {
          if (item.e && item.e.isActive && checkCollision(playerRect, item.e)) {
            damageTaken += item.d;
            break;
          }
        }
      }
    }
    if (damageTaken > 0) {
      if (player.shields > 0) {
        player.shields--;
        console.log(`シールドがダメージを吸収！残り ${player.shields} 回`);
      } else {
        player.hp -= damageTaken;
        player.lastHitTime = currentTime;
        console.log(`ダメージ！HP: ${player.hp} (-${damageTaken})`);
      }
    }
  }
  for (let i = healthOrbs.length - 1; i >= 0; i--) {
    if (checkCollision(playerRect, healthOrbs[i])) {
      player.hp = Math.min(player.maxHp, player.hp + healthOrbs[i].healAmount);
      console.log(`HPが ${healthOrbs[i].healAmount} 回復しました！ 現在HP: ${player.hp}`);
      healthOrbs.splice(i, 1);
    }
  }

  bullets = bullets.filter((b) => b.y > -b.height && b.x > -b.width && b.x < SCREEN_WIDTH);
  enemies = enemies.filter((e) => e.y < SCREEN_HEIGHT);
  freeRoamEnemies = freeRoamEnemies.filter(
    (e) => e.y < SCREEN_HEIGHT + 30 && e.y > -30 && e.x > -30 && e.x < SCREEN_WIDTH + 30
  );
  explosionBullets = explosionBullets.filter(
    (b) => b.y > -b.height && b.y < SCREEN_HEIGHT && b.x > -b.width && b.x < SCREEN_WIDTH
  );
  healthOrbs = healthOrbs.filter((o) => o.y < SCREEN_HEIGHT);
  if (currentEliteEnemy && !currentEliteEnemy.isActive) currentEliteEnemy = null;
  if (currentBarrageEnemy && !currentBarrageEnemy.isActive) currentBarrageEnemy = null;
  if (currentEliteRedEnemy && !currentEliteRedEnemy.isActive) currentEliteRedEnemy = null;
  if (currentEliteGreenEnemy && !currentEliteGreenEnemy.isActive) currentEliteGreenEnemy = null;
  if (player.hp <= 0) {
    console.log("ゲームオーバー！");
    gameOver = true;
  }
}

// --- 描画処理 ---
function draw() {
  ctx.fillStyle = COLORS.BLACK;
  ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  if (gameOver) {
    ctx.fillStyle = COLORS.WHITE;
    ctx.font = "48px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("GAME OVER", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 50);
    ctx.font = "24px sans-serif";
    ctx.fillText(`Final Score: ${score}`, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
    ctx.font = "32px sans-serif";
    ctx.fillText("Press 'R' to Restart", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 50);
    return;
  }

  const currentTime = performance.now();
  if (!(currentTime - player.lastHitTime < player.invincibilityDuration && Math.floor(currentTime / 100) % 2 === 0)) {
    ctx.fillStyle = COLORS.WHITE;
    ctx.fillRect(player.x, player.y, player.width, player.height);
  }
  // (★修正点) シールドの回転速度アップ
  if (player.shields > 0) {
    player.shieldOffsetAngle = (player.shieldOffsetAngle + 450 * (deltaTime || 0)) % 360; // 200から速度アップ
    const shieldCenterX = player.x + player.width / 2;
    const shieldCenterY = player.y + player.height / 2;
    for (let i = 0; i < player.shields; i++) {
      const angleRad = ((player.shieldOffsetAngle + i * (360 / player.shields)) * Math.PI) / 180;
      const offsetDist = player.width / 2 + 10;
      const shieldX = shieldCenterX + offsetDist * Math.cos(angleRad);
      const shieldY = shieldCenterY + offsetDist * Math.sin(angleRad);
      ctx.strokeStyle = COLORS.LIGHT_BLUE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(shieldX, shieldY, player.shieldObjectSize / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // (★修正点) 弾の色が変わるように修正
  bullets.forEach((b) => {
    if (b.draw) {
      b.draw();
    } else {
      ctx.fillStyle = player.pierceActive ? COLORS.CRIMSON : COLORS.WHITE;
      ctx.fillRect(b.x, b.y, b.width, b.height);
    }
  });
  enemies.forEach((e) => e.draw());
  freeRoamEnemies.forEach((e) => e.draw());
  explosionBullets.forEach((b) => b.draw());
  healthOrbs.forEach((o) => o.draw());
  if (currentEliteEnemy) currentEliteEnemy.draw();
  if (currentBarrageEnemy) currentBarrageEnemy.draw();
  if (currentEliteRedEnemy) currentEliteRedEnemy.draw();
  if (currentEliteGreenEnemy) currentEliteGreenEnemy.draw();

  ctx.fillStyle = COLORS.WHITE;
  ctx.font = "24px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`Score: ${score}`, 10, 30);
  ctx.fillText(`Difficulty: ${currentDifficultyLevel}`, 10, 60);
  const hpBarX = SCREEN_WIDTH - 160;
  const hpBarY = 10;
  const hpBarWidth = 150;
  const hpBarHeight = 20;
  const hpRatio = Math.max(0, player.hp / player.maxHp);
  ctx.fillStyle = COLORS.RED;
  ctx.fillRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);
  ctx.fillStyle = COLORS.GREEN;
  ctx.fillRect(hpBarX, hpBarY, hpBarWidth * hpRatio, hpBarHeight);
  ctx.fillStyle = COLORS.WHITE;
  ctx.font = "16px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${player.hp}/${player.maxHp}`, hpBarX + hpBarWidth / 2, hpBarY + 15);

  let buffStatusY = 90;
  ctx.font = "18px sans-serif";
  ctx.textAlign = "left";
  if (player.shotsActive) {
    const timeLeft = Math.ceil((player.shotsDuration - (currentTime - player.shotsStartTime)) / 1000);
    ctx.fillText(`Spread Shot: ${timeLeft}s`, 10, buffStatusY);
    buffStatusY += 25;
  }
  if (player.shields > 0) {
    ctx.fillText(`Shields: ${player.shields} hits`, 10, buffStatusY);
    buffStatusY += 25;
  }
  if (player.pierceActive) {
    const timeLeft = Math.ceil((player.pierceDuration - (currentTime - player.pierceStartTime)) / 1000);
    ctx.fillText(`Pierce Shot: ${timeLeft}s`, 10, buffStatusY);
    buffStatusY += 25;
  }
}

// --- メインループ ---
let deltaTime = 0;
function gameLoop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  deltaTime = (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  if (deltaTime > 0.1) {
    requestAnimationFrame(gameLoop);
    return;
  }

  update(deltaTime);
  draw();
  requestAnimationFrame(gameLoop);
}

// ゲーム開始
resetGame();
requestAnimationFrame(gameLoop);
