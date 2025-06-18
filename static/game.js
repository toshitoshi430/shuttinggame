const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// --- 画面設定 ---
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
  CRIMSON: "#DC143C",
  LIGHT_BLUE: "#ADD8E6",
  LIME_GREEN: "#32CD32",
  DARK_GRAY: "#646464",
  BLUE: "#0099FF",
  PINK: "#FF69B4",
};

// --- グローバルゲーム状態 ---
let score = 0,
  gameOver = false,
  gameStartTime = 0,
  currentDifficultyLevel = 1;
let lastTime = 0,
  deltaTime = 0;
let bullets = [],
  enemies = [],
  freeRoamEnemies = [],
  explosionBullets = [],
  healthOrbs = [],
  buffOrbs = [],
  activeBeams = [],
  playerHomingBullets = [];
let currentElitePurple = null,
  currentEliteOrange = null,
  currentElitePink = null,
  currentEliteGreenEnemy = null,
  currentEliteBlueEnemy = null;
let lastShotTime = 0,
  lastEnemySpawnTime = 0,
  lastFreeroamSpawnTime = 0,
  lastHomingShotTime = 0,
  lastEliteSlotSpawnTime = 0;
const MAX_ACTIVE_ELITES = 8;
let difficultyUpAnimation = { active: false, alpha: 0, startTime: 0 };
let gameOverTapCount = 0;

// --- プレイヤー設定 ---
const player = {
  width: 30,
  height: 30,
  x: (SCREEN_WIDTH - 30) / 2,
  y: SCREEN_HEIGHT - 30 - 50,
  hp: 200,
  maxHp: 200,
  lastHitTime: 0,
  invincibilityDuration: 1000,
  spreadLevel: 0,
  spreadStartTime: 0,
  spreadDuration: 10000,
  rateUpLevel: 0,
  rateUpStartTime: 0,
  rateUpDuration: 10000,
  shieldLevel: 0,
  shields: 0,
  shieldObjectSize: 40,
  shieldOffsetAngle: 0,
  rangeLevel: 0,
  rangeStartTime: 0,
  rangeDuration: 8000,
  beamCharges: 0,
  lastBeamTime: 0,
  homingLevel: 0,
  homingStartTime: 0,
  homingDuration: 10000,
};

// 弾の設定
const bulletSettings = {
  width: 8,
  height: 25,
  speed: 18 * 60,
  cooldown: 80,
  defaultRange: SCREEN_HEIGHT * 0.65,
};

// 敵の設定
const enemySettings = { width: 40, height: 40, speedBase: 2.5 * 60, spawnIntervalBase: 1000, perWave: 5, spacing: 50 };
const freeroamEnemySettings = { spawnIntervalBase: 2000, speedBase: 4.0 * 60 };

// --- クラス定義 ---
class PlayerBullet {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.spawnY = y;
    this.width = bulletSettings.width;
    this.height = bulletSettings.height;
  }
  update(deltaTime) {
    this.y -= bulletSettings.speed * deltaTime;
  }
  draw() {
    ctx.fillStyle = player.rateUpLevel > 0 ? COLORS.PINK : COLORS.WHITE;
    ctx.fillRect(this.x, this.y, this.width, this.height);
  }
}

class PlayerSpreadBullet {
  constructor(x, y, angleDeg, speed) {
    this.x = x;
    this.y = y;
    this.spawnY = y;
    this.width = bulletSettings.width;
    this.height = bulletSettings.height;
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;
    this.vx = speed * Math.cos(angleRad);
    this.vy = speed * Math.sin(angleRad);
  }
  update(deltaTime) {
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
  }
  draw() {
    ctx.fillStyle = player.rateUpLevel > 0 ? COLORS.PINK : COLORS.WHITE;
    ctx.fillRect(this.x, this.y, this.width, this.height);
  }
}

class PlayerHomingBullet {
  constructor(x, y, target) {
    this.x = x;
    this.y = y;
    this.width = 12;
    this.height = 24;
    this.speed = 10 * 60;
    this.turnSpeed = 5;
    this.target = target;
    this.angle = -Math.PI / 2;
    this.damage = 10;
    this.isExpired = false;
  }

  update(deltaTime) {
    if (!this.target || !this.target.isActive) {
      this.y += Math.sin(this.angle) * this.speed * deltaTime;
      this.x += Math.cos(this.angle) * this.speed * deltaTime;
      if (this.y < -this.height) this.isExpired = true;
      return;
    }

    const targetAngle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
    let angleDiff = targetAngle - this.angle;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;

    const turnAmount = this.turnSpeed * deltaTime;
    this.angle += Math.max(-turnAmount, Math.min(turnAmount, angleDiff));

    this.x += Math.cos(this.angle) * this.speed * deltaTime;
    this.y += Math.sin(this.angle) * this.speed * deltaTime;

    if (this.y < -this.height) {
      this.isExpired = true;
    }
  }

  draw() {
    ctx.fillStyle = player.rateUpLevel > 0 ? COLORS.PINK : COLORS.YELLOW;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + Math.PI / 2);
    ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
    ctx.restore();
  }
}

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
    this.hp = 1;
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
  takeDamage(damage) {
    this.hp -= damage;
    score += 5;
    if (this.hp <= 0) {
      score += 10;
      return true;
    }
    return false;
  }
}

class FreeRoamEnemy {
  constructor(startX, startY, speed) {
    this.width = 35;
    this.height = 35;
    this.x = startX;
    this.y = startY;
    this.speed = speed;
    this.vx = startX < SCREEN_WIDTH / 2 ? this.speed * 0.5 : -this.speed * 0.5;
    this.vy = this.speed * 0.3;
    this.bullets = [];
    this.hasShot = false;
    this.shotDelay = 500 + Math.random() * 500;
    this.spawnTime = performance.now();
    this.hp = 1;
  }
  update(deltaTime) {
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
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
        12,
        12,
        8 * 60,
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
  takeDamage(damage) {
    this.hp -= damage;
    score += 15;
    if (this.hp <= 0) {
      return true;
    }
    return false;
  }
}

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

class HomingBullet {
  constructor(x, y, angle, speed, turnSpeed, color, damage, lifetime) {
    this.x = x;
    this.y = y;
    this.width = 20;
    this.height = 20;
    this.speed = speed;
    this.turnSpeed = turnSpeed;
    this.color = color;
    this.damage = damage;
    this.angle = angle;
    this.spawnTime = performance.now();
    this.lifetime = lifetime;
    this.isExpired = false;
    this.hp = 1;
  }
  update(deltaTime) {
    if (performance.now() - this.spawnTime > this.lifetime) {
      this.isExpired = true;
      return;
    }
    const targetAngle = Math.atan2(player.y + player.height / 2 - this.y, player.x + player.width / 2 - this.x);
    let angleDiff = targetAngle - this.angle;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    const turnAmount = this.turnSpeed * deltaTime;
    this.angle += Math.max(-turnAmount, Math.min(turnAmount, angleDiff));
    this.x += Math.cos(this.angle) * this.speed * deltaTime;
    this.y += Math.sin(this.angle) * this.speed * deltaTime;
  }
  draw() {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.width / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  takeDamage(damage) {
    this.hp -= damage;
    if (this.hp <= 0) {
      return true;
    }
    return false;
  }
}

class Beam {
  constructor(x, width) {
    this.x = x;
    this.y = 0;
    this.width = width;
    this.height = SCREEN_HEIGHT;
    this.spawnTime = performance.now();
    this.duration = 200;
    this.damage = 20;
    this.isExpired = false;
  }
  update(deltaTime) {
    if (performance.now() - this.spawnTime > this.duration) {
      this.isExpired = true;
    }
  }
  draw() {
    const alpha = Math.max(0, 1 - (performance.now() - this.spawnTime) / this.duration);
    ctx.fillStyle = `rgba(0, 153, 255, ${alpha * 0.7})`;
    ctx.fillRect(this.x, this.y, this.width, this.height);
  }
}

class EnemyLaser {
  constructor(sourceElite, targetX, targetY, lockOnTime) {
    this.sourceElite = sourceElite;
    this.target = { x: targetX + player.width / 2, y: targetY + player.height / 2 };
    this.damage = 30;
    this.thickness = 30;
    this.beamLength = SCREEN_WIDTH * 1.5;

    const source = { x: sourceElite.x + sourceElite.width / 2, y: sourceElite.y + sourceElite.height / 2 };
    this.angle = Math.atan2(this.target.y - source.y, this.target.x - source.x);

    this.spawnTime = performance.now();
    this.isExpired = false;

    this.lockOnDuration = lockOnTime;
    this.beamFireTime = this.spawnTime + this.lockOnDuration;
    this.beamDuration = 700;
  }

  update(deltaTime) {
    if (performance.now() > this.beamFireTime + this.beamDuration) {
      this.isExpired = true;
    }
  }

  checkCollisionWithPlayer(playerRect) {
    if (performance.now() < this.beamFireTime) {
      return false;
    }

    const playerCenterX = playerRect.x + playerRect.width / 2;
    const playerCenterY = playerRect.y + playerRect.height / 2;

    const sourceX = this.sourceElite.x + this.sourceElite.width / 2;
    const sourceY = this.sourceElite.y + this.sourceElite.height / 2;

    const dx = sourceX - playerCenterX;
    const dy = sourceY - playerCenterY;
    const dist = Math.abs(dx * Math.sin(this.angle) - dy * Math.cos(this.angle));

    return dist < this.thickness / 2 + playerRect.width / 2;
  }

  draw() {
    const currentTime = performance.now();
    const source = {
      x: this.sourceElite.x + this.sourceElite.width / 2,
      y: this.sourceElite.y + this.sourceElite.height / 2,
    };

    if (currentTime < this.beamFireTime) {
      const elapsed = currentTime - this.spawnTime;
      const alpha = 0.8 * Math.abs(Math.sin((elapsed / 200) * Math.PI));
      ctx.strokeStyle = `rgba(255, 0, 0, ${alpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(this.target.x, this.target.y);
      ctx.stroke();
    } else {
      const elapsed = currentTime - this.beamFireTime;
      const alpha = Math.max(0, 0.6 * (1 - elapsed / this.beamDuration));

      ctx.save();
      ctx.translate(source.x, source.y);
      ctx.rotate(this.angle);
      ctx.fillStyle = `rgba(0, 153, 255, ${alpha})`;
      ctx.fillRect(0, -this.thickness / 2, this.beamLength, this.thickness);
      ctx.restore();
    }
  }
}

class BaseEliteEnemy {
  constructor(config, difficulty) {
    this.width = config.width;
    this.height = config.height;
    this.x = config.x !== undefined ? config.x : Math.random() * (SCREEN_WIDTH - this.width);
    this.y = -this.height * 2;
    this.speed = config.speed * difficulty.speedMultiplier;
    this.hp = config.hp * difficulty.hpMultiplier;
    this.maxHp = config.maxHp * difficulty.hpMultiplier;
    this.isActive = true;
    this.lastShotTime = 0;
    this.shotCooldownBase = config.shotCooldownBase;
    this.bullets = [];
    this.color = config.color;
    this.onDefeat = config.onDefeat;
  }
  update(shotCooldown, deltaTime) {
    this.y += this.speed * deltaTime;
  }
  draw() {
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.width, this.height);
    const hpBarHeight = Math.max(2, Math.round(this.width * 0.1));
    const hpBarWidth = this.width;
    const hpRatio = this.hp > 0 ? this.hp / this.maxHp : 0;
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

class ElitePurple extends BaseEliteEnemy {
  static spawnInterval = 5500;
  static config = {
    width: 60,
    height: 60,
    x: (SCREEN_WIDTH - 60) / 2,
    speed: 1.2 * 60,
    hp: 300,
    maxHp: 300,
    shotCooldownBase: 2000,
    color: COLORS.PURPLE,
    onDefeat: (self) => {
      const dropX = self.x + self.width / 2;
      const dropY = self.y + self.height / 2;
      buffOrbs.push(new BuffOrb(dropX, dropY, "homing"));
    },
  };
  constructor(difficulty) {
    super(ElitePurple.config, difficulty);
    this.difficulty = difficulty;
  }
  update(shotCooldown, deltaTime) {
    super.update(shotCooldown, deltaTime);
    const currentTime = performance.now();
    if (currentTime - this.lastShotTime > shotCooldown) {
      this.shoot();
      this.lastShotTime = currentTime;
    }
    this.bullets.forEach((b) => b.update(deltaTime));
    this.bullets = this.bullets.filter((b) => !b.isExpired);
  }
  shoot() {
    const bulletX = this.x + this.width / 2;
    const bulletY = this.y + this.height / 2;
    const speed = 6 * 60 * this.difficulty.bulletSpeedMultiplier;
    const turnSpeed = this.difficulty.homingTurnSpeed;
    const damage = 20;
    const spreadAngle = (20 * Math.PI) / 180;
    const lifetime = this.difficulty.homingLifetime;
    for (let i = -2; i <= 2; i++) {
      const angle = Math.PI / 2 + i * spreadAngle;
      this.bullets.push(new HomingBullet(bulletX, bulletY, angle, speed, turnSpeed, COLORS.YELLOW, damage, lifetime));
    }
  }
  draw() {
    super.draw();
    this.bullets.forEach((b) => b.draw());
  }
}

class BarrageOrb {
  constructor(x, y, angle) {
    this.width = 35;
    this.height = 35;
    this.x = x;
    this.y = y;
    this.hp = 3;
    this.maxHp = 3;
    this.exploded = false;
    this.explosionCooldown = 2000;
    this.spawnTime = performance.now();
    const speed = 2.5 * 60;
    this.vx = speed * Math.cos(angle);
    this.vy = speed * Math.sin(angle);
  }
  update(deltaTime) {
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
    if (
      this.y > SCREEN_HEIGHT + this.height ||
      this.y < -this.height ||
      this.x < -this.width ||
      this.x > SCREEN_WIDTH + this.width ||
      performance.now() - this.spawnTime > this.explosionCooldown
    ) {
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
    const hpBarHeight = Math.max(2, Math.round(this.width * 0.2));
    const hpBarWidth = this.width;
    const hpRatio = this.hp > 0 ? this.hp / this.maxHp : 0;
    ctx.fillStyle = COLORS.RED;
    ctx.fillRect(this.x, this.y - hpBarHeight - 2, hpBarWidth, hpBarHeight);
    ctx.fillStyle = COLORS.GREEN;
    ctx.fillRect(this.x, this.y - hpBarHeight - 2, hpBarWidth * hpRatio, hpBarHeight);
  }
  takeDamage(damage) {
    this.hp -= damage;
    score += 2;
    if (this.hp <= 0) {
      return true;
    }
    return false;
  }
}

class EliteOrange extends BaseEliteEnemy {
  static spawnInterval = 18000;
  static config = {
    width: 70,
    height: 70,
    speed: 0.8 * 60,
    hp: 300,
    maxHp: 300,
    shotCooldownBase: 2500,
    color: COLORS.ORANGE,
    onDefeat: (self) => {
      const dropX = self.x + self.width / 2;
      const dropY = self.y + self.height / 2;
      buffOrbs.push(new BuffOrb(dropX, dropY, "spread"));
    },
  };
  constructor(difficulty) {
    const conf = { ...EliteOrange.config, targetY: 50 + Math.random() * 360 };
    super(conf, difficulty);
    this.difficulty = difficulty;
    this.barrageOrbs = [];
  }
  update(orbCooldown, deltaTime) {
    super.update(orbCooldown, deltaTime);
    const currentTime = performance.now();
    if (currentTime - this.lastShotTime > orbCooldown) {
      this.spawnOrb();
      this.lastShotTime = currentTime;
    }
    this.barrageOrbs.forEach((orb, index) => {
      if (orb.update(deltaTime)) {
        this.generateExplosionBullets(orb.x + orb.width / 2, orb.y + orb.height / 2);
        this.barrageOrbs.splice(index, 1);
      }
    });
  }
  spawnOrb() {
    const orbX = this.x + this.width / 2 - 35 / 2;
    const orbY = this.y + this.height;
    const angle = Math.random() * Math.PI;
    this.barrageOrbs.push(new BarrageOrb(orbX, orbY, angle));
  }
  generateExplosionBullets(x, y) {
    const numBullets = 18;
    for (let i = 0; i < numBullets; i++) {
      const angle = ((2 * Math.PI) / numBullets) * i;
      const speed = 6 * 60 * this.difficulty.bulletSpeedMultiplier;
      explosionBullets.push(
        new GenericEnemyBullet(
          x,
          y,
          x + Math.cos(angle) * 100,
          y + Math.sin(angle) * 100,
          15,
          15,
          speed,
          COLORS.YELLOW,
          10
        )
      );
    }
  }
  draw() {
    super.draw();
    this.barrageOrbs.forEach((orb) => orb.draw());
  }
}

class ElitePink extends BaseEliteEnemy {
  static spawnInterval = 12000;
  static config = {
    width: 50,
    height: 50,
    speed: 1.5 * 60,
    targetY: 150,
    hp: 200,
    maxHp: 200,
    shotCooldownBase: 500,
    color: COLORS.PINK,
    onDefeat: (self) => {
      const dropX = self.x + self.width / 2;
      const dropY = self.y + self.height / 2;
      buffOrbs.push(new BuffOrb(dropX, dropY, "rateUp"));
    },
  };
  constructor(difficulty) {
    super(ElitePink.config, difficulty);
    this.difficulty = difficulty;
  }
  update(shotCooldown, deltaTime) {
    super.update(shotCooldown, deltaTime);
    const currentTime = performance.now();
    if (currentTime - this.lastShotTime > shotCooldown) {
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
    const speed = 9 * 60 * this.difficulty.bulletSpeedMultiplier;
    for (let i = -1; i <= 1; i++) {
      const angle = baseAngle + i * spreadAngle;
      const bulletX = this.x + this.width / 2;
      const bulletY = this.y + this.height / 2;
      const targetBulletX = bulletX + Math.cos(angle) * 100;
      const targetBulletY = bulletY + Math.sin(angle) * 100;
      this.bullets.push(
        new GenericEnemyBullet(bulletX, bulletY, targetBulletX, targetBulletY, 15, 15, speed, COLORS.PINK, 15)
      );
    }
  }
  draw() {
    super.draw();
    this.bullets.forEach((b) => b.draw());
  }
}

class ObstacleBullet {
  constructor(x, y, angle, wallHp) {
    this.x = x;
    this.y = y;
    this.width = 120;
    this.height = 30;
    this.speed = 2.5 * 60;
    this.hp = wallHp;
    this.maxHp = wallHp;
    this.vx = this.speed * Math.cos(angle);
    this.vy = this.speed * Math.sin(angle);
  }
  update(deltaTime) {
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
  }
  draw() {
    ctx.fillStyle = COLORS.DARK_GRAY;
    ctx.fillRect(this.x, this.y, this.width, this.height);
    const hpBarHeight = Math.max(1, Math.round(this.width * 0.05));
    const hpBarWidth = this.width;
    const hpRatio = this.hp > 0 ? this.hp / this.maxHp : 0;
    ctx.fillStyle = COLORS.RED;
    ctx.fillRect(this.x, this.y - hpBarHeight - 2, hpBarWidth, hpBarHeight);
    ctx.fillStyle = COLORS.GREEN;
    ctx.fillRect(this.x, this.y - hpBarHeight - 2, hpBarWidth * hpRatio, hpBarHeight);
  }
  takeDamage(damage) {
    this.hp -= damage;
    score += 1;
    if (this.hp <= 0) {
      return true;
    }
    return false;
  }
}

class EliteGreenEnemy extends BaseEliteEnemy {
  static spawnInterval = 16000;
  static config = {
    width: 80,
    height: 80,
    speed: 1.0 * 60,
    targetY: 100,
    hp: 500,
    maxHp: 500,
    shotCooldownBase: 4000,
    color: COLORS.LIME_GREEN,
    onDefeat: (self) => {
      const dropX = self.x + self.width / 2;
      const dropY = self.y + self.height / 2;
      buffOrbs.push(new BuffOrb(dropX, dropY, "shield"));
      healthOrbs.push(new HealthOrb(dropX - 20, dropY, 10));
      healthOrbs.push(new HealthOrb(dropX + 20, dropY, 10));
    },
  };
  constructor(difficulty) {
    super(EliteGreenEnemy.config, difficulty);
    this.difficulty = difficulty;
  }
  update(shotCooldown, deltaTime) {
    super.update(shotCooldown, deltaTime);
    const currentTime = performance.now();
    if (currentTime - this.lastShotTime > shotCooldown) {
      this.shoot();
      this.lastShotTime = currentTime;
    }
    this.bullets.forEach((b) => b.update(deltaTime));
    this.bullets = this.bullets.filter((b) => b.y < SCREEN_HEIGHT && Math.abs(b.x) < SCREEN_WIDTH * 1.5);
  }
  shoot() {
    const numWalls = 5;
    const startX = this.x + this.width / 2;
    const startY = this.y + this.height;
    const spreadAngle = (15 * Math.PI) / 180;
    for (let i = -2; i <= 2; i++) {
      const angle = Math.PI / 2 + i * spreadAngle;
      this.bullets.push(new ObstacleBullet(startX, startY, angle, this.difficulty.wallHp));
    }
  }
  draw() {
    super.draw();
    this.bullets.forEach((b) => b.draw());
  }
}

class EliteBlueEnemy extends BaseEliteEnemy {
  static spawnInterval = 22000;
  static config = {
    width: 70,
    height: 70,
    speed: 1.5 * 60,
    targetY: 150,
    hp: 300,
    maxHp: 300,
    shotCooldownBase: 3500,
    color: COLORS.BLUE,
    onDefeat: (self) => {
      const dropX = self.x + self.width / 2;
      const dropY = self.y + self.height / 2;
      buffOrbs.push(new BuffOrb(dropX, dropY, "range"));
    },
  };
  constructor(difficulty) {
    super(EliteBlueEnemy.config, difficulty);
    this.activeLasers = [];
  }
  update(shotCooldown, deltaTime, level) {
    super.update(shotCooldown, deltaTime);
    const currentTime = performance.now();

    if (this.y > 50 && this.activeLasers.length === 0 && currentTime - this.lastShotTime > shotCooldown) {
      this.shootBeam(level);
      this.lastShotTime = currentTime;
    }

    this.activeLasers.forEach((laser, index) => {
      laser.update(deltaTime);
      if (laser.isExpired) {
        this.activeLasers.splice(index, 1);
      }
    });
  }

  shootBeam(level) {
    const targetX = player.x;
    const targetY = player.y;
    // Levelに応じてロックオン時間を計算（基本1500msから1レベル毎に50ms短縮）
    const lockOnTime = Math.max(500, 1500 - (level - 1) * 50); // 最短でも0.5秒は確保
    this.activeLasers.push(new EnemyLaser(this, targetX, targetY, lockOnTime));
  }
  draw() {
    super.draw();
    this.activeLasers.forEach((laser) => laser.draw());
  }
}

class HealthOrb {
  constructor(x, y, healAmount, size = 30) {
    this.width = size;
    this.height = size;
    this.speed = 3 * 60;
    this.x = x - this.width / 2;
    this.y = y - this.height / 2;
    this.healAmount = healAmount;
  }
  update(deltaTime) {
    this.y += this.speed * deltaTime;
  }
  draw() {
    ctx.fillStyle = COLORS.GREEN;
    const thickness = this.width / 3.5;
    ctx.fillRect(this.x, this.y + this.height / 2 - thickness / 2, this.width, thickness);
    ctx.fillRect(this.x + this.width / 2 - thickness / 2, this.y, thickness, this.height);
  }
}

class BuffOrb {
  constructor(x, y, type) {
    this.width = 40;
    this.height = 40;
    this.x = x - this.width / 2;
    this.y = y - this.height / 2;
    this.speed = 3 * 60;
    this.type = type;
    this.color = COLORS.WHITE;
    switch (type) {
      case "spread":
        this.color = COLORS.ORANGE;
        break;
      case "rateUp":
        this.color = COLORS.PINK;
        break;
      case "shield":
        this.color = COLORS.LIGHT_BLUE;
        break;
      case "range":
        this.color = COLORS.BLUE;
        break;
      case "homing":
        this.color = COLORS.PURPLE;
        break;
    }
  }
  update(deltaTime) {
    this.y += this.speed * deltaTime;
  }
  draw() {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.WHITE;
    ctx.font = "bold 30px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("B", this.x + this.width / 2, this.y + this.height / 2);
  }
}

// --- 入力ハンドラ ---
let isInputActive = false;
let inputX = 0;
let inputY = 0;
function updateInputPosition(eventX, eventY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  inputX = (eventX - rect.left) * scaleX;
  inputY = (eventY - rect.top) * scaleY;
}
canvas.addEventListener("mousedown", (e) => {
  isInputActive = true;
  updateInputPosition(e.clientX, e.clientY);
});
canvas.addEventListener("mousemove", (e) => {
  if (e.buttons === 1) {
    isInputActive = true;
    updateInputPosition(e.clientX, e.clientY);
  }
});
window.addEventListener("mouseup", () => {
  isInputActive = false;
});
canvas.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    isInputActive = true;
    updateInputPosition(e.touches[0].clientX, e.touches[0].clientY);
  },
  { passive: false }
);
canvas.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    if (isInputActive) {
      updateInputPosition(e.touches[0].clientX, e.touches[0].clientY);
    }
  },
  { passive: false }
);
canvas.addEventListener("touchend", (e) => {
  e.preventDefault();
  isInputActive = false;
  if (gameOver) {
    gameOverTapCount++;
    if (gameOverTapCount >= 3) {
      resetGame();
    }
  }
});
canvas.addEventListener("touchcancel", (e) => {
  e.preventDefault();
  isInputActive = false;
});
canvas.addEventListener("click", (e) => {
  if (gameOver) {
    gameOverTapCount++;
    if (gameOverTapCount >= 3) {
      resetGame();
    }
  }
});

// --- 難易度設定の管理 ---
let difficultySettings = {};
function updateDifficultySettings(level) {
  let settings = {
    hpMultiplier: 1.0,
    speedMultiplier: 1.0,
    bulletSpeedMultiplier: 1.0,
    attackRateMultiplier: 1.0,
    elites: { purple: false, pink: false, orange: false, green: false, blue: false },
    wallHp: 10,
    homingLifetime: 2000,
    homingTurnSpeed: 1.5,
    eliteSlotInterval: 3000, // 【新設】エリートの出現枠タイマーの基本間隔
  };

  // 【変更】画像の内容を反映
  if (level >= 6) {
    settings.hpMultiplier = 1.0 + (level - 5) * 0.1;
    settings.speedMultiplier = 1.0 + (level - 5) * 0.01;
    settings.bulletSpeedMultiplier = 1.0 + (level - 5) * 0.01;
    settings.attackRateMultiplier = 1.0 + (level - 5) * 0.01;
    settings.wallHp = 10 + (level - 5) * 2;
    settings.homingLifetime = 3000 + (level - 5) * 0.01;
  }

  // エリートの出現可否
  if (level >= 1) {
    settings.elites.purple = true;
  }
  if (level >= 2) {
    settings.elites.pink = true;
  }
  if (level >= 3) {
    settings.elites.green = true;
  }
  if (level >= 4) {
    settings.elites.blue = true;
  }
  if (level >= 5) {
    settings.elites.orange = true;
  }

  difficultySettings = settings;
}

// 【変更】この関数は問題の原因だったため削除
// function getAdjustedValue(baseValue, level, reductionRate = 0.9, increaseRate = 1.1) {
//   const power = level - 1;
//   if (baseValue >= 1000) return baseValue * Math.pow(reductionRate, power);
//   else return baseValue * Math.pow(increaseRate, power);
// }
function checkCollision(rect1, rect2) {
  if (!rect1 || !rect2) return false;
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
  gameOverTapCount = 0;
  currentDifficultyLevel = 1;
  lastTime = 0;
  updateDifficultySettings(1);
  player.hp = 200;
  player.maxHp = 200;
  player.x = (SCREEN_WIDTH - player.width) / 2;
  player.y = SCREEN_HEIGHT - player.height - 30;
  player.spreadLevel = 0;
  player.rateUpLevel = 0;
  player.shieldLevel = 0;
  player.shields = 0;
  player.rangeLevel = 0;
  player.beamCharges = 0;
  player.homingLevel = 0;
  bullets = [];
  enemies = [];
  freeRoamEnemies = [];
  explosionBullets = [];
  healthOrbs = [];
  buffOrbs = [];
  activeBeams = [];
  playerHomingBullets = [];
  currentElitePurple = null;
  currentEliteOrange = null;
  currentElitePink = null;
  currentEliteGreenEnemy = null;
  currentEliteBlueEnemy = null;
  lastShotTime = 0;
  lastEnemySpawnTime = 0;
  lastFreeroamSpawnTime = 0;
  lastHomingShotTime = 0;
  lastEliteSlotSpawnTime = 0;
}

// --- 更新処理 ---
function update(deltaTime) {
  if (gameOver) {
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.code === "KeyR") resetGame();
      },
      { once: true }
    );
    return;
  }
  const currentTime = performance.now();
  const newDifficultyLevel = 1 + Math.floor(score / 2000);

  if (newDifficultyLevel !== currentDifficultyLevel) {
    currentDifficultyLevel = newDifficultyLevel;
    updateDifficultySettings(currentDifficultyLevel);
    difficultyUpAnimation = { active: true, startTime: currentTime };
  }

  const speedMultiplier = difficultySettings.speedMultiplier || 1.0;
  const currentEnemySpeed = enemySettings.speedBase * speedMultiplier;
  const currentEnemySpawnInterval = enemySettings.spawnIntervalBase;

  const currentFreeroamEnemySpeed = freeroamEnemySettings.speedBase * speedMultiplier; // ← この行を追加

  // 【変更】getAdjustedValueを削除したので、こちらのスケーリングも見直し
  const currentFreeroamSpawnInterval =
    freeroamEnemySettings.spawnIntervalBase / (difficultySettings.attackRateMultiplier || 1.0);

  if (player.hp > player.maxHp) {
    player.hp -= 20 * deltaTime;
  }
  if (player.homingLevel > 0) {
    player.shieldOffsetAngle = (player.shieldOffsetAngle + 90 * (deltaTime || 0)) % 360;
  }

  if (player.spreadLevel > 0 && currentTime - player.spreadStartTime > player.spreadDuration) player.spreadLevel = 0;
  if (player.rateUpLevel > 0 && currentTime - player.rateUpStartTime > player.rateUpDuration) player.rateUpLevel = 0;
  if (player.rangeLevel > 0 && currentTime - player.rangeStartTime > player.rangeDuration) {
    player.rangeLevel = 0;
    player.beamCharges = 0;
  }
  if (player.homingLevel > 0 && currentTime - player.homingStartTime > player.homingDuration) player.homingLevel = 0;

  if (player.beamCharges > 0 && currentTime - player.lastBeamTime > 1000) {
    activeBeams.push(new Beam(player.x + player.width / 2 - player.width * 1.5, player.width * 3));
    player.beamCharges--;
    player.lastBeamTime = currentTime;
  }
  activeBeams.forEach((b) => b.update(deltaTime));
  activeBeams = activeBeams.filter((b) => !b.isExpired);

  if (isInputActive) {
    player.x = inputX - player.width / 2;
    player.y = inputY - player.height / 2;
  }
  player.x = Math.max(0, Math.min(player.x, SCREEN_WIDTH - player.width));
  player.y = Math.max(0, Math.min(player.y, SCREEN_HEIGHT - player.height));

  let rateMultiplier = 1;
  if (player.rateUpLevel > 0) {
    rateMultiplier = player.rateUpLevel * 2;
  }
  const cooldown = bulletSettings.cooldown / rateMultiplier;
  if (currentTime - lastShotTime > cooldown) {
    const bulletXCenter = player.x + player.width / 2;
    const bulletYBase = player.y;

    if (player.spreadLevel > 0) {
      bullets.push(new PlayerSpreadBullet(bulletXCenter, bulletYBase, -25, bulletSettings.speed));
      bullets.push(new PlayerSpreadBullet(bulletXCenter, bulletYBase, 25, bulletSettings.speed));
    }
    if (player.spreadLevel > 1) {
      bullets.push(new PlayerSpreadBullet(bulletXCenter, bulletYBase, -12.5, bulletSettings.speed));
      bullets.push(new PlayerSpreadBullet(bulletXCenter, bulletYBase, 12.5, bulletSettings.speed));
    }
    if (player.spreadLevel > 2) {
      bullets.push(new PlayerSpreadBullet(bulletXCenter, bulletYBase, -40, bulletSettings.speed));
      bullets.push(new PlayerSpreadBullet(bulletXCenter, bulletYBase, 40, bulletSettings.speed));
    }

    bullets.push(new PlayerBullet(bulletXCenter - bulletSettings.width / 2, bulletYBase));
    lastShotTime = currentTime;
  }

  const homingCooldown = 800 / rateMultiplier;
  if (player.homingLevel > 0 && currentTime - lastHomingShotTime > homingCooldown) {
    const allElites = [
      currentElitePurple,
      currentEliteOrange,
      currentElitePink,
      currentEliteGreenEnemy,
      currentEliteBlueEnemy,
    ].filter((e) => e && e.isActive);
    if (allElites.length > 0) {
      let closestElite = null;
      let minDistance = Infinity;
      allElites.forEach((elite) => {
        const dx = elite.x - player.x;
        const dy = elite.y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < minDistance) {
          minDistance = distance;
          closestElite = elite;
        }
      });
      if (closestElite) {
        for (let i = 0; i < player.homingLevel; i++) {
          const angleOffset = (i * (2 * Math.PI)) / player.homingLevel;
          const centerX = player.x + player.width / 2;
          const centerY = player.y + player.height / 2;
          const angleRad = (player.shieldOffsetAngle * Math.PI) / 180 + angleOffset;
          const dist = player.width / 2 + 40;
          const spawnX = centerX + dist * Math.cos(angleRad);
          const spawnY = centerY + dist * Math.sin(angleRad);
          playerHomingBullets.push(new PlayerHomingBullet(spawnX, spawnY, closestElite));
        }
        lastHomingShotTime = currentTime;
      }
    }
  }

  bullets.forEach((b) => b.update(deltaTime));
  playerHomingBullets.forEach((b) => b.update(deltaTime));
  enemies.forEach((e) => e.update(deltaTime));
  freeRoamEnemies.forEach((e) => e.update(deltaTime));
  explosionBullets.forEach((b) => b.update(deltaTime));
  healthOrbs.forEach((o) => o.update(deltaTime));
  buffOrbs.forEach((o) => o.update(deltaTime));

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
    const side = Math.floor(Math.random() * 2);
    let spawnX, spawnY;
    if (side === 0) {
      spawnX = -30;
      spawnY = Math.random() * SCREEN_HEIGHT;
    } else {
      spawnX = SCREEN_WIDTH + 5;
      spawnY = Math.random() * SCREEN_HEIGHT;
    }
    freeRoamEnemies.push(new FreeRoamEnemy(spawnX, spawnY, currentFreeroamEnemySpeed));
    lastFreeroamSpawnTime = currentTime;
  }

  const currentEliteSlotInterval = difficultySettings.eliteSlotInterval - (newDifficultyLevel - 1) * 100; // レベルで短縮
  if (currentTime - lastEliteSlotSpawnTime > currentEliteSlotInterval) {
    const activeElitesCount = [
      currentElitePurple,
      currentEliteOrange,
      currentElitePink,
      currentEliteGreenEnemy,
      currentEliteBlueEnemy,
    ].filter((e) => e !== null).length;

    if (activeElitesCount < MAX_ACTIVE_ELITES) {
      let spawnCandidates = [];
      if (difficultySettings.elites.purple && !currentElitePurple) spawnCandidates.push("purple");
      if (difficultySettings.elites.pink && !currentElitePink) spawnCandidates.push("pink");
      if (difficultySettings.elites.orange && !currentEliteOrange) spawnCandidates.push("orange");
      if (difficultySettings.elites.green && !currentEliteGreenEnemy) spawnCandidates.push("green");
      if (difficultySettings.elites.blue && !currentEliteBlueEnemy) spawnCandidates.push("blue");

      if (spawnCandidates.length > 0) {
        const chosenEliteType = spawnCandidates[Math.floor(Math.random() * spawnCandidates.length)];
        switch (chosenEliteType) {
          case "purple":
            currentElitePurple = new ElitePurple(difficultySettings);
            break;
          case "pink":
            currentElitePink = new ElitePink(difficultySettings);
            break;
          case "orange":
            currentEliteOrange = new EliteOrange(difficultySettings);
            break;
          case "green":
            currentEliteGreenEnemy = new EliteGreenEnemy(difficultySettings);
            break;
          case "blue":
            currentEliteBlueEnemy = new EliteBlueEnemy(difficultySettings);
            break;
        }
      }
    }
    lastEliteSlotSpawnTime = currentTime;
  }

  const eliteAttackRate = difficultySettings.attackRateMultiplier || 1.0;
  const eliteAttackCooldownReduction = difficultySettings.attackCooldownReduction || 0;

  if (currentElitePurple)
    currentElitePurple.update(
      Math.max(100, ElitePurple.config.shotCooldownBase - eliteAttackCooldownReduction) / eliteAttackRate,
      deltaTime
    );
  if (currentEliteOrange)
    currentEliteOrange.update(
      Math.max(100, EliteOrange.config.shotCooldownBase - eliteAttackCooldownReduction) / eliteAttackRate,
      deltaTime
    );
  if (currentElitePink)
    currentElitePink.update(
      Math.max(100, ElitePink.config.shotCooldownBase - eliteAttackCooldownReduction) / eliteAttackRate,
      deltaTime
    );
  if (currentEliteGreenEnemy) currentEliteGreenEnemy.update(EliteGreenEnemy.config.shotCooldownBase, deltaTime);
  if (currentEliteBlueEnemy)
    currentEliteBlueEnemy.update(
      Math.max(100, EliteBlueEnemy.config.shotCooldownBase - eliteAttackCooldownReduction) / eliteAttackRate,
      deltaTime,
      newDifficultyLevel
    );

  if (currentElitePurple && currentElitePurple.y > SCREEN_HEIGHT) currentElitePurple = null;
  if (currentEliteOrange && currentEliteOrange.y > SCREEN_HEIGHT) currentEliteOrange = null;
  if (currentElitePink && currentElitePink.y > SCREEN_HEIGHT) currentElitePink = null;
  if (currentEliteGreenEnemy && currentEliteGreenEnemy.y > SCREEN_HEIGHT) currentEliteGreenEnemy = null;
  if (currentEliteBlueEnemy && currentEliteBlueEnemy.y > SCREEN_HEIGHT) currentEliteBlueEnemy = null;

  const playerRect = { x: player.x, y: player.y, width: player.width, height: player.height };
  const eliteEnemies = [
    currentElitePurple,
    currentEliteOrange,
    currentElitePink,
    currentEliteGreenEnemy,
    currentEliteBlueEnemy,
  ];

  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    let bulletRemoved = false;

    for (let j = enemies.length - 1; j >= 0; j--) {
      if (checkCollision(bullet, enemies[j])) {
        enemies.splice(j, 1);
        score += 10;
        bullets.splice(i, 1);
        bulletRemoved = true;
        break;
      }
    }
    if (bulletRemoved) continue;

    for (let j = freeRoamEnemies.length - 1; j >= 0; j--) {
      if (checkCollision(bullet, freeRoamEnemies[j])) {
        freeRoamEnemies.splice(j, 1);
        score += 15;
        bullets.splice(i, 1);
        bulletRemoved = true;
        break;
      }
    }
    if (bulletRemoved) continue;

    for (const elite of eliteEnemies) {
      if (elite && elite.isActive && checkCollision(bullet, elite)) {
        elite.takeDamage(10);
        bullets.splice(i, 1);
        bulletRemoved = true;
        break;
      }
    }
    if (bulletRemoved) continue;

    if (currentElitePurple) {
      for (let k = currentElitePurple.bullets.length - 1; k >= 0; k--) {
        if (checkCollision(bullet, currentElitePurple.bullets[k])) {
          currentElitePurple.bullets.splice(k, 1);
          score += 1;
          bullets.splice(i, 1);
          bulletRemoved = true;
          break;
        }
      }
    }
    if (bulletRemoved) continue;

    if (currentEliteOrange) {
      for (let j = currentEliteOrange.barrageOrbs.length - 1; j >= 0; j--) {
        const orb = currentEliteOrange.barrageOrbs[j];
        if (checkCollision(bullet, orb)) {
          if (orb.takeDamage(1)) {
            currentEliteOrange.generateExplosionBullets(orb.x + orb.width / 2, orb.y + orb.height / 2);
            currentEliteOrange.barrageOrbs.splice(j, 1);
            score += 20;
          }
          bullets.splice(i, 1);
          bulletRemoved = true;
          break;
        }
      }
    }
    if (bulletRemoved) continue;

    if (currentEliteGreenEnemy) {
      for (let j = currentEliteGreenEnemy.bullets.length - 1; j >= 0; j--) {
        const wall = currentEliteGreenEnemy.bullets[j];
        if (checkCollision(bullet, wall)) {
          if (wall.takeDamage(1)) {
            healthOrbs.push(new HealthOrb(wall.x + wall.width / 2, wall.y + wall.height / 2, 10, 30));
            currentEliteGreenEnemy.bullets.splice(j, 1);
          }
          bullets.splice(i, 1);
          bulletRemoved = true;
          break;
        }
      }
    }
  }

  for (let i = playerHomingBullets.length - 1; i >= 0; i--) {
    const pBullet = playerHomingBullets[i];
    for (const elite of eliteEnemies) {
      if (elite && elite.isActive && checkCollision(pBullet, elite)) {
        elite.takeDamage(pBullet.damage);
        playerHomingBullets.splice(i, 1);
        break;
      }
    }
  }

  activeBeams.forEach((beam) => {
    const damage = beam.damage;
    [...enemies, ...freeRoamEnemies, ...eliteEnemies.filter((e) => e)].forEach((enemy) => {
      if (enemy && enemy.isActive && checkCollision(beam, enemy)) {
        if (enemy.takeDamage(damage)) {
          if (enemy instanceof Enemy) {
            enemies = enemies.filter((e) => e !== enemy);
          } else if (enemy instanceof FreeRoamEnemy) {
            freeRoamEnemies = freeRoamEnemies.filter((e) => e !== enemy);
          } else if (enemy instanceof BaseEliteEnemy) {
            if (enemy === currentElitePurple) currentElitePurple = null;
            if (enemy === currentEliteOrange) currentEliteOrange = null;
            if (enemy === currentElitePink) currentElitePink = null;
            if (enemy === currentEliteGreenEnemy) currentEliteGreenEnemy = null;
            if (enemy === currentEliteBlueEnemy) currentEliteBlueEnemy = null;
          }
        }
      }
    });
  });

  if (currentTime - player.lastHitTime > player.invincibilityDuration) {
    let damageTaken = 0;
    let hitSource = null;
    let isEliteAttack = false;

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

    if (currentEliteBlueEnemy) {
      for (const laser of currentEliteBlueEnemy.activeLasers) {
        if (laser.checkCollisionWithPlayer(playerRect)) {
          damageTaken += laser.damage;
          isEliteAttack = true;
          break;
        }
      }
    }

    let collisionFound = false;
    for (const fr_enemy of freeRoamEnemies) {
      if (checkPlayerCollision(fr_enemy.bullets, 0)) {
        collisionFound = true;
        isEliteAttack = false;
        break;
      }
    }

    if (!collisionFound && damageTaken === 0) {
      if (checkPlayerCollision(enemies, 20)) {
        isEliteAttack = false;
      } else if (checkPlayerCollision(freeRoamEnemies, 20)) {
        isEliteAttack = false;
      } else if (checkPlayerCollision(explosionBullets, 0)) {
        isEliteAttack = true;
      } else if (currentElitePurple && checkPlayerCollision(currentElitePurple.bullets, 0)) {
        isEliteAttack = true;
      } else if (currentElitePink && checkPlayerCollision(currentElitePink.bullets, 0)) {
        isEliteAttack = true;
      } else if (currentEliteOrange && checkPlayerCollision(currentEliteOrange.barrageOrbs, 15, false)) {
        isEliteAttack = true;
        currentEliteOrange.generateExplosionBullets(
          hitSource.x + hitSource.width / 2,
          hitSource.y + hitSource.height / 2
        );
        currentEliteOrange.barrageOrbs.splice(currentEliteOrange.barrageOrbs.indexOf(hitSource), 1);
      } else {
        for (const item of eliteEnemies) {
          if (item && item.isActive && checkCollision(playerRect, item)) {
            damageTaken += 30;
            isEliteAttack = true;
            break;
          }
        }
      }
    }

    if (damageTaken > 0) {
      if (player.shields > 0) {
        if (isEliteAttack) {
          player.shields--;
          healthOrbs.push(new HealthOrb(player.x + player.width / 2, player.y + player.height / 2, 10, 30));
        }
      } else {
        player.hp -= damageTaken;
        player.lastHitTime = currentTime;
      }
    }
  }

  for (let i = healthOrbs.length - 1; i >= 0; i--) {
    const orb = healthOrbs[i];
    if (checkCollision(playerRect, orb)) {
      if (orb.healAmount <= 10) {
        player.hp = Math.min(player.maxHp, player.hp + 10);
      } else {
        player.hp += orb.healAmount;
      }
      healthOrbs.splice(i, 1);
    }
  }
  for (let i = buffOrbs.length - 1; i >= 0; i--) {
    const orb = buffOrbs[i];
    if (checkCollision(playerRect, orb)) {
      switch (orb.type) {
        case "spread":
          player.spreadLevel = Math.min(3, player.spreadLevel + 1);
          player.spreadStartTime = currentTime;
          break;
        case "rateUp":
          player.rateUpLevel = Math.min(3, player.rateUpLevel + 1);
          player.rateUpStartTime = currentTime;
          break;
        case "shield":
          player.shieldLevel = Math.min(3, player.shieldLevel + 1);
          const shieldCounts = [0, 3, 4, 5];
          player.shields = shieldCounts[player.shieldLevel];
          break;
        case "range":
          if (player.rangeLevel === 0) {
            // 初めて取得した場合：3回分付与
            player.beamCharges = 3;
          } else {
            // 2回目以降の取得：2回分追加
            player.beamCharges += 2;
          }
          player.rangeLevel = Math.min(3, player.rangeLevel + 1); // レベルは3まで上昇
          player.rangeStartTime = currentTime; // 効果時間はリセット
          player.lastBeamTime = currentTime;
          break;
        case "homing":
          player.homingLevel = Math.min(3, player.homingLevel + 1);
          player.homingStartTime = currentTime;
          break;
      }
      buffOrbs.splice(i, 1);
    }
  }

  bullets = bullets.filter((b) => b.y > -b.height);
  playerHomingBullets = playerHomingBullets.filter((b) => !b.isExpired);
  enemies = enemies.filter((e) => e.y < SCREEN_HEIGHT);
  freeRoamEnemies = freeRoamEnemies.filter(
    (e) => e.y < SCREEN_HEIGHT + 30 && e.y > -30 && e.x > -30 && e.x < SCREEN_WIDTH + 30
  );
  explosionBullets = explosionBullets.filter(
    (b) => b.y > -b.height && b.y < SCREEN_HEIGHT && b.x > -b.width && b.x < SCREEN_WIDTH
  );
  healthOrbs = healthOrbs.filter((o) => o.y < SCREEN_HEIGHT);
  buffOrbs = buffOrbs.filter((o) => o.y < SCREEN_HEIGHT);
  if (currentElitePurple && !currentElitePurple.isActive) currentElitePurple = null;
  if (currentEliteOrange && !currentEliteOrange.isActive) currentEliteOrange = null;
  if (currentElitePink && !currentElitePink.isActive) currentElitePink = null;
  if (currentEliteGreenEnemy && !currentEliteGreenEnemy.isActive) currentEliteGreenEnemy = null;
  if (currentEliteBlueEnemy && !currentEliteBlueEnemy.isActive) currentEliteBlueEnemy = null;
  if (player.hp <= 0) {
    gameOver = true;
  }
}

// --- 描画処理 ---
function draw() {
  ctx.fillStyle = COLORS.BLACK;
  ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  if (gameOver) {
    ctx.fillStyle = COLORS.WHITE;
    ctx.font = `48px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("GAME OVER", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 50);
    ctx.font = `24px sans-serif`;
    ctx.fillText(`Final Score: ${score}`, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
    ctx.font = `32px sans-serif`;
    ctx.fillText("Press 'R' or Tap 3 Times to Restart", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 50);
    return;
  }
  const currentTime = performance.now();
  if (!(currentTime - player.lastHitTime < player.invincibilityDuration && Math.floor(currentTime / 100) % 2 === 0)) {
    ctx.fillStyle = COLORS.WHITE;
    ctx.fillRect(player.x, player.y, player.width, player.height);
  }

  if (player.homingLevel > 0) {
    const centerX = player.x + player.width / 2;
    const centerY = player.y + player.height / 2;
    for (let i = 0; i < player.homingLevel; i++) {
      const angleOffset = (i * (2 * Math.PI)) / player.homingLevel;
      const angleRad = (player.shieldOffsetAngle * Math.PI) / 180 + angleOffset;
      const dist = player.width / 2 + 40;
      const pX = centerX + dist * Math.cos(angleRad);
      const pY = centerY + dist * Math.sin(angleRad);
      const squareSize = 20;

      ctx.fillStyle = COLORS.PURPLE;
      ctx.save();
      ctx.translate(pX, pY);
      ctx.rotate(angleRad + Math.PI / 4);
      ctx.fillRect(-squareSize / 2, -squareSize / 2, squareSize, squareSize);
      ctx.restore();
    }
  }

  if (player.shields > 0) {
    player.shieldOffsetAngle = (player.shieldOffsetAngle + 450 * (deltaTime || 0)) % 360;
    const shieldCenterX = player.x + player.width / 2;
    const shieldCenterY = player.y + player.height / 2;
    for (let i = 0; i < player.shields; i++) {
      const angleRad = ((player.shieldOffsetAngle + i * (360 / player.shields)) * Math.PI) / 180;
      const offsetDist = player.width / 2 + 10;
      const shieldX = shieldCenterX + offsetDist * Math.cos(angleRad);
      const shieldY = shieldCenterY + offsetDist * Math.sin(angleRad);
      ctx.strokeStyle = COLORS.LIGHT_BLUE;
      ctx.lineWidth = Math.max(1, 2);
      ctx.beginPath();
      ctx.arc(shieldX, shieldY, player.shieldObjectSize / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  if (player.beamCharges > 0) {
    const beamAngle = (player.shieldOffsetAngle * -1) % 360;
    for (let i = 0; i < player.beamCharges; i++) {
      const angleRad = ((beamAngle + i * 120) * Math.PI) / 180;
      const dist = player.width + 20;
      const x1 = player.x + player.width / 2 + Math.cos(angleRad) * dist;
      const y1 = player.y + player.height / 2 + Math.sin(angleRad) * dist;
      ctx.fillStyle = COLORS.BLUE;
      ctx.beginPath();
      ctx.moveTo(x1, y1 - 10);
      ctx.lineTo(x1 - 8.66, y1 + 5);
      ctx.lineTo(x1 + 8.66, y1 + 5);
      ctx.closePath();
      ctx.fill();
    }
  }
  activeBeams.forEach((b) => b.draw());

  bullets.forEach((b) => b.draw());
  playerHomingBullets.forEach((b) => b.draw());
  enemies.forEach((e) => e.draw());
  freeRoamEnemies.forEach((e) => e.draw());
  explosionBullets.forEach((b) => b.draw());
  healthOrbs.forEach((o) => o.draw());
  buffOrbs.forEach((o) => o.draw());
  if (currentElitePurple) currentElitePurple.draw();
  if (currentEliteOrange) currentEliteOrange.draw();
  if (currentElitePink) currentElitePink.draw();
  if (currentEliteGreenEnemy) currentEliteGreenEnemy.draw();
  if (currentEliteBlueEnemy) currentEliteBlueEnemy.draw();

  if (difficultyUpAnimation.active) {
    const elapsed = currentTime - difficultyUpAnimation.startTime;
    if (elapsed < 2000) {
      const size = 100 + elapsed / 10;
      const alpha = Math.max(0, 1 - elapsed / 2000);
      ctx.font = `bold ${size}px sans-serif`;
      ctx.fillStyle = `rgba(255, 224, 102, ${alpha})`;
      ctx.textAlign = "center";
      ctx.fillText("LEVEL UP!!", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
    } else {
      difficultyUpAnimation.active = false;
    }
  }

  const hpBarX = 20;
  const hpBarY = 140;
  const hpBarWidth = 30;
  const hpBarHeight = SCREEN_HEIGHT - 200;
  ctx.fillStyle = "rgba(100,0,0,0.5)";
  ctx.fillRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);
  const hpRatio = player.hp > 0 ? player.hp / player.maxHp : 0;
  if (player.hp > player.maxHp) {
    const overHealRatio = (player.hp - player.maxHp) / player.maxHp;
    ctx.fillStyle = "rgba(0,150,255,0.8)";
    ctx.fillRect(
      hpBarX,
      hpBarY + hpBarHeight * (1 - Math.min(1, overHealRatio)),
      hpBarWidth,
      hpBarHeight * Math.min(1, overHealRatio)
    );
  }
  ctx.fillStyle = "rgba(0,255,0,0.8)";
  ctx.fillRect(
    hpBarX,
    hpBarY + hpBarHeight * (1 - Math.min(1, hpRatio)),
    hpBarWidth,
    hpBarHeight * Math.min(1, hpRatio)
  );
  ctx.strokeStyle = "#FFF";
  ctx.strokeRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);
  ctx.fillStyle = COLORS.WHITE;
  ctx.font = `20px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(`${Math.round(player.hp)}`, hpBarX + hpBarWidth / 2, hpBarY - 15);

  const buffIconSize = 40;
  let buffIconY = 20;
  const buffIconX = SCREEN_WIDTH - buffIconSize - 20;
  const drawBuffIcon = (type, value, level = 0) => {
    let color = COLORS.WHITE;
    let text = "";
    switch (type) {
      case "spread":
        color = COLORS.ORANGE;
        break;
      case "rateUp":
        color = COLORS.PINK;
        break;
      case "range":
        color = COLORS.BLUE;
        break;
      case "shield":
        color = COLORS.LIGHT_BLUE;
        text = value;
        break;
      case "homing":
        color = COLORS.PURPLE;
        break;
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(buffIconX + buffIconSize / 2, buffIconY + buffIconSize / 2, buffIconSize / 2, 0, 2 * Math.PI);
    ctx.fill();

    if (type !== "shield") {
      const remainingPercent = value;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.moveTo(buffIconX + buffIconSize / 2, buffIconY + buffIconSize / 2);
      ctx.arc(
        buffIconX + buffIconSize / 2,
        buffIconY + buffIconSize / 2,
        buffIconSize / 2,
        -Math.PI / 2,
        -Math.PI / 2 + 2 * Math.PI * (1 - remainingPercent),
        false
      );
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = COLORS.WHITE;
    ctx.beginPath();
    ctx.arc(buffIconX + buffIconSize / 2, buffIconY + buffIconSize / 2, buffIconSize / 2, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.fillStyle = COLORS.WHITE;
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (text) {
      ctx.fillText(text, buffIconX + buffIconSize / 2, buffIconY + buffIconSize / 2 + 2);
    } else if (level > 0) {
      ctx.fillText(level, buffIconX + buffIconSize / 2, buffIconY + buffIconSize / 2 + 2);
    }

    buffIconY += buffIconSize + 10;
  };

  if (player.spreadLevel > 0) {
    const remaining = 1 - (currentTime - player.spreadStartTime) / player.spreadDuration;
    drawBuffIcon("spread", remaining, player.spreadLevel);
  }
  if (player.shields > 0) {
    drawBuffIcon("shield", player.shields);
  }
  if (player.rateUpLevel > 0) {
    const remaining = 1 - (currentTime - player.rateUpStartTime) / player.rateUpDuration;
    drawBuffIcon("rateUp", remaining, player.rateUpLevel);
  }
  if (player.rangeLevel > 0) {
    const remaining = 1 - (currentTime - player.rangeStartTime) / player.rangeDuration;
    drawBuffIcon("range", remaining, player.rangeLevel);
  }
  if (player.homingLevel > 0) {
    const remaining = 1 - (currentTime - player.homingStartTime) / player.homingDuration;
    drawBuffIcon("homing", remaining, player.homingLevel);
  }

  ctx.fillStyle = COLORS.WHITE;
  ctx.font = `24px sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText(`Score: ${score}`, 20, 40);
  ctx.fillText(`Level: ${currentDifficultyLevel}`, 20, 70);
}

// --- メインループ ---
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
resetGame();
requestAnimationFrame(gameLoop);
