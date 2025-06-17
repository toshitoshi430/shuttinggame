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
};

// --- グローバルゲーム状態 ---
let score = 0,
  gameOver = false,
  gameStartTime = 0,
  currentDifficultyLevel = 1;
const MAX_DIFFICULTY_LEVEL = 10;
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
let currentEliteEnemy = null,
  currentBarrageEnemy = null,
  currentEliteRedEnemy = null,
  currentEliteGreenEnemy = null,
  currentEliteBlueEnemy = null;
let lastShotTime = 0,
  lastEnemySpawnTime = 0,
  lastEliteEnemySpawnTime = 0,
  lastFreeroamSpawnTime = 0,
  lastBarrageSpawnTime = 0,
  lastEliteRedSpawnTime = 0,
  lastEliteGreenSpawnTime = 0,
  lastEliteBlueSpawnTime = 0,
  lastHomingShotTime = 0;
let difficultyUpAnimation = { active: false, alpha: 0, startTime: 0 };
let gameOverTapCount = 0;

// --- プレイヤー設定 ---
const player = {
  width: 30,
  height: 30,
  x: (SCREEN_WIDTH - 30) / 2,
  y: SCREEN_HEIGHT - 30 - 50,
  hp: 200, // 【変更】HPを200に
  maxHp: 200, // 【変更】最大HPを200に
  lastHitTime: 0,
  invincibilityDuration: 1000,
  shotsActive: false,
  shotsStartTime: 0,
  shotsDuration: 5000,
  shields: 0,
  shieldObjectSize: 40,
  shieldOffsetAngle: 0,
  pierceActive: false,
  pierceStartTime: 0,
  pierceDuration: 7000,
  rangeActive: false,
  rangeStartTime: 0,
  rangeDuration: 8000,
  beamCharges: 0,
  lastBeamTime: 0,
  homingActive: false,
  homingStartTime: 0,
  homingDuration: 15000,
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
    this.pierceCount = player.pierceActive ? 1 : 0;
  }
  update(deltaTime) {
    this.y -= bulletSettings.speed * deltaTime;
  }
  draw() {
    ctx.fillStyle = player.pierceActive ? COLORS.CRIMSON : COLORS.WHITE;
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
    this.pierceCount = player.pierceActive ? 1 : 0;
  }
  update(deltaTime) {
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
  }
  draw() {
    ctx.fillStyle = player.pierceActive ? COLORS.CRIMSON : COLORS.WHITE;
    ctx.fillRect(this.x, this.y, this.width, this.height);
  }
}

class PlayerHomingBullet {
  constructor(x, y, target) {
    this.x = x;
    this.y = y;
    this.width = 8;
    this.height = 16;
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
    ctx.fillStyle = player.pierceActive ? COLORS.CRIMSON : COLORS.YELLOW;

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

// 【変更】青エリートのビームクラスを全面的に書き換え
class EnemyLaser {
  constructor(sourceElite, targetX, targetY) {
    this.source = { x: sourceElite.x + sourceElite.width / 2, y: sourceElite.y + sourceElite.height / 2 };
    this.target = { x: targetX + player.width / 2, y: targetY + player.height / 2 };
    this.damage = 30;
    this.thickness = 30; // ビームの太さ
    this.angle = Math.atan2(this.target.y - this.source.y, this.target.x - this.source.x);
    this.beamLength = SCREEN_WIDTH * 1.5;

    this.spawnTime = performance.now();
    this.isExpired = false;

    this.lockOnDuration = 1500;
    this.beamFireTime = this.spawnTime + this.lockOnDuration;
    this.beamDuration = 700;
  }

  update(deltaTime) {
    if (performance.now() > this.beamFireTime + this.beamDuration) {
      this.isExpired = true;
    }
  }

  // このビーム専用の当たり判定
  checkCollisionWithPlayer(playerRect) {
    if (performance.now() < this.beamFireTime) {
      return false;
    }

    const playerCenterX = playerRect.x + playerRect.width / 2;
    const playerCenterY = playerRect.y + playerRect.height / 2;

    // プレイヤーの中心からビームの直線までの距離を計算
    const dx = this.source.x - playerCenterX;
    const dy = this.source.y - playerCenterY;
    const dist = Math.abs(dx * Math.sin(this.angle) - dy * Math.cos(this.angle));

    // ビームの太さとプレイヤーの大きさで判定
    return dist < this.thickness / 2 + playerRect.width / 2;
  }

  draw() {
    const currentTime = performance.now();

    if (currentTime < this.beamFireTime) {
      const elapsed = currentTime - this.spawnTime;
      const alpha = 0.8 * Math.abs(Math.sin((elapsed / 200) * Math.PI));
      ctx.strokeStyle = `rgba(255, 0, 0, ${alpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(this.source.x, this.source.y);
      ctx.lineTo(this.target.x, this.target.y);
      ctx.stroke();
    } else {
      const elapsed = currentTime - this.beamFireTime;
      const alpha = Math.max(0, 0.6 * (1 - elapsed / this.beamDuration));

      ctx.save();
      ctx.translate(this.source.x, this.source.y);
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

class EliteEnemy extends BaseEliteEnemy {
  static spawnInterval = 5500;
  static config = {
    width: 60,
    height: 60,
    x: (SCREEN_WIDTH - 60) / 2,
    speed: 1.2 * 60,
    hp: 120,
    maxHp: 120,
    shotCooldownBase: 2000,
    color: COLORS.PURPLE,
    onDefeat: (self) => {
      const dropX = self.x + self.width / 2;
      const dropY = self.y + self.height / 2;
      buffOrbs.push(new BuffOrb(dropX, dropY, "homing"));
    },
  };
  constructor(difficulty) {
    super(EliteEnemy.config, difficulty);
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

// 【変更】BarrageOrbが角度を持って飛ぶように
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
    // 画面外に出るか時間経過で爆発
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

class BarrageEnemy extends BaseEliteEnemy {
  static spawnInterval = 18000;
  static config = {
    width: 70,
    height: 70,
    speed: 0.8 * 60,
    hp: 250,
    maxHp: 250,
    shotCooldownBase: 2500,
    color: COLORS.ORANGE,
    onDefeat: (self) => {
      const dropX = self.x + self.width / 2;
      const dropY = self.y + self.height / 2;
      buffOrbs.push(new BuffOrb(dropX, dropY, "spread"));
    },
  };
  constructor(difficulty) {
    const conf = { ...BarrageEnemy.config, targetY: 50 + Math.random() * 360 };
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
  // 【変更】オーブを前方180度に発射
  spawnOrb() {
    const orbX = this.x + this.width / 2 - 35 / 2;
    const orbY = this.y + this.height;
    const angle = Math.random() * Math.PI; // 0-180度
    this.barrageOrbs.push(new BarrageOrb(orbX, orbY, angle));
  }
  generateExplosionBullets(x, y) {
    const numBullets = 18;
    for (let i = 0; i < numBullets; i++) {
      const angle = (Math.PI / (numBullets - 1)) * i;
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

class EliteRedEnemy extends BaseEliteEnemy {
  static spawnInterval = 12000;
  static config = {
    width: 50,
    height: 50,
    speed: 1.5 * 60,
    targetY: 150,
    hp: 70,
    maxHp: 70,
    shotCooldownBase: 500,
    color: COLORS.CRIMSON,
    onDefeat: (self) => {
      const dropX = self.x + self.width / 2;
      const dropY = self.y + self.height / 2;
      buffOrbs.push(new BuffOrb(dropX, dropY, "pierce"));
    },
  };
  constructor(difficulty) {
    super(EliteRedEnemy.config, difficulty);
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
        new GenericEnemyBullet(bulletX, bulletY, targetBulletX, targetBulletY, 15, 15, speed, COLORS.CRIMSON, 15)
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
    hp: 350,
    maxHp: 350,
    shotCooldownBase: 4000,
    color: COLORS.LIME_GREEN,
    onDefeat: (self) => {
      const dropX = self.x + self.width / 2;
      const dropY = self.y + self.height / 2;
      buffOrbs.push(new BuffOrb(dropX, dropY, "shield"));
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
    hp: 200,
    maxHp: 200,
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
  update(shotCooldown, deltaTime) {
    super.update(shotCooldown, deltaTime);
    const currentTime = performance.now();

    if (this.y > 50 && currentTime - this.lastShotTime > shotCooldown) {
      this.shootBeam();
      this.lastShotTime = currentTime;
    }

    this.activeLasers.forEach((laser, index) => {
      laser.update(deltaTime);
      if (laser.isExpired) {
        this.activeLasers.splice(index, 1);
      }
    });
  }

  shootBeam() {
    const targetX = player.x;
    const targetY = player.y;
    this.activeLasers.push(new EnemyLaser(this, targetX, targetY));
  }
  draw() {
    super.draw();
    this.activeLasers.forEach((laser) => laser.draw());
  }
}

class HealthOrb {
  constructor(x, y, healAmount, size = 40) {
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
    ctx.beginPath();
    ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.width / 2, 0, Math.PI * 2);
    ctx.fill();
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
        this.color = COLORS.PURPLE;
        break;
      case "pierce":
        this.color = COLORS.CRIMSON;
        break;
      case "shield":
        this.color = COLORS.LIGHT_BLUE;
        break;
      case "range":
        this.color = COLORS.BLUE;
        break;
      case "homing":
        this.color = COLORS.YELLOW;
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
    wallHp: 10,
    elites: { purple: false, red: false, orange: false, green: false, blue: false },
    homingLifetime: 5000,
    homingTurnSpeed: 3,
  };
  if (level === 1) {
    settings.hpMultiplier = 0.4;
    settings.wallHp = 3;
    settings.elites.purple = true;
    settings.homingLifetime = 2000;
  } else if (level === 2) {
    settings.hpMultiplier = 0.6;
    settings.wallHp = 5;
    settings.elites.purple = true;
    settings.elites.red = true;
    settings.homingLifetime = 3000;
  } else if (level === 3) {
    settings.hpMultiplier = 0.8;
    settings.wallHp = 8;
    settings.elites.purple = true;
    settings.elites.red = true;
    settings.elites.green = true;
    settings.homingLifetime = 4000;
  } else if (level === 4) {
    settings.hpMultiplier = 1.0;
    settings.wallHp = 10;
    settings.elites.purple = true;
    settings.elites.red = true;
    settings.elites.green = true;
    settings.elites.blue = true;
    settings.homingLifetime = 5000;
  } else {
    settings.elites = { purple: true, red: true, orange: true, green: true, blue: true };
    if (level >= 6) {
      settings.hpMultiplier = 1.0 + (level - 5) * 0.1;
      settings.speedMultiplier = 1.0 + (level - 5) * 0.08;
      settings.bulletSpeedMultiplier = 1.0 + (level - 5) * 0.1;
      settings.attackRateMultiplier = 1.0 + (level - 5) * 0.15;
      settings.wallHp = 10 + (level - 5) * 2;
      settings.homingLifetime = 3000 + (level - 5) * 50;
      settings.homingTurnSpeed = 3 + (level - 5) * 0.4;
    }
  }
  difficultySettings = settings;
}

function getAdjustedValue(baseValue, level, reductionRate = 0.9, increaseRate = 1.1) {
  const power = level - 1;
  if (baseValue >= 1000) return baseValue * Math.pow(reductionRate, power);
  else return baseValue * Math.pow(increaseRate, power);
}
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
  player.hp = player.maxHp; // player.maxHpが200になっているのでHPも200で開始
  player.x = (SCREEN_WIDTH - player.width) / 2;
  player.y = SCREEN_HEIGHT - player.height - 30;
  player.shotsActive = false;
  player.shields = 0;
  player.pierceActive = false;
  player.rangeActive = false;
  player.homingActive = false;
  player.beamCharges = 0;
  bullets = [];
  enemies = [];
  freeRoamEnemies = [];
  explosionBullets = [];
  healthOrbs = [];
  buffOrbs = [];
  activeBeams = [];
  playerHomingBullets = [];
  currentEliteEnemy = null;
  currentBarrageEnemy = null;
  currentEliteRedEnemy = null;
  currentEliteGreenEnemy = null;
  currentEliteBlueEnemy = null;
  lastShotTime = 0;
  lastEnemySpawnTime = 0;
  lastEliteEnemySpawnTime = 0;
  lastFreeroamSpawnTime = 0;
  lastBarrageSpawnTime = 0;
  lastEliteRedSpawnTime = 0;
  lastEliteGreenSpawnTime = 0;
  lastEliteBlueSpawnTime = 0;
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
  const newDifficultyLevel = Math.min(MAX_DIFFICULTY_LEVEL, 1 + Math.floor(score / 2000));

  if (newDifficultyLevel !== currentDifficultyLevel) {
    currentDifficultyLevel = newDifficultyLevel;
    updateDifficultySettings(currentDifficultyLevel);
    difficultyUpAnimation = { active: true, startTime: currentTime };
  }

  const speedMultiplier = difficultySettings.speedMultiplier || 1.0;
  const currentEnemySpeed = enemySettings.speedBase * speedMultiplier;
  const currentEnemySpawnInterval = getAdjustedValue(enemySettings.spawnIntervalBase, newDifficultyLevel);
  const currentFreeroamEnemySpeed = freeroamEnemySettings.speedBase * speedMultiplier;
  const currentFreeroamSpawnInterval = getAdjustedValue(freeroamEnemySettings.spawnIntervalBase, newDifficultyLevel);

  if (player.hp > player.maxHp) {
    player.hp -= 20 * deltaTime;
  }
  if (player.shotsActive && currentTime - player.shotsStartTime > player.shotsDuration) player.shotsActive = false;
  if (player.pierceActive && currentTime - player.pierceStartTime > player.pierceDuration) player.pierceActive = false;
  if (player.rangeActive && currentTime - player.rangeStartTime > player.rangeDuration) player.rangeActive = false;
  if (player.homingActive && currentTime - player.homingStartTime > player.homingDuration) player.homingActive = false;

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

  if (currentTime - lastShotTime > bulletSettings.cooldown) {
    const bulletXCenter = player.x + player.width / 2;
    const bulletYBase = player.y;
    if (player.shotsActive) {
      bullets.push(new PlayerSpreadBullet(bulletXCenter, bulletYBase, -25, bulletSettings.speed));
      bullets.push(new PlayerSpreadBullet(bulletXCenter, bulletYBase, 25, bulletSettings.speed));
    }
    bullets.push(new PlayerBullet(bulletXCenter - bulletSettings.width / 2, bulletYBase));
    lastShotTime = currentTime;
  }

  const homingCooldown = player.pierceActive ? 400 : 800;
  if (player.homingActive && currentTime - lastHomingShotTime > homingCooldown) {
    const allElites = [
      currentEliteEnemy,
      currentBarrageEnemy,
      currentEliteRedEnemy,
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
        playerHomingBullets.push(new PlayerHomingBullet(player.x + player.width / 2, player.y, closestElite));
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

  const eliteAttackRate = difficultySettings.attackRateMultiplier || 1.0;
  if (
    difficultySettings.elites.purple &&
    !currentEliteEnemy &&
    currentTime - lastEliteEnemySpawnTime > EliteEnemy.spawnInterval / eliteAttackRate
  ) {
    currentEliteEnemy = new EliteEnemy(difficultySettings);
    lastEliteEnemySpawnTime = currentTime;
  }
  if (currentEliteEnemy)
    currentEliteEnemy.update(
      getAdjustedValue(EliteEnemy.config.shotCooldownBase, newDifficultyLevel) / eliteAttackRate,
      deltaTime
    );
  if (
    difficultySettings.elites.orange &&
    !currentBarrageEnemy &&
    currentTime - lastBarrageSpawnTime > BarrageEnemy.spawnInterval / eliteAttackRate
  ) {
    currentBarrageEnemy = new BarrageEnemy(difficultySettings);
    lastBarrageSpawnTime = currentTime;
  }
  if (currentBarrageEnemy)
    currentBarrageEnemy.update(
      getAdjustedValue(BarrageEnemy.config.shotCooldownBase, newDifficultyLevel) / eliteAttackRate,
      deltaTime
    );
  if (
    difficultySettings.elites.red &&
    !currentEliteRedEnemy &&
    currentTime - lastEliteRedSpawnTime > EliteRedEnemy.spawnInterval / eliteAttackRate
  ) {
    currentEliteRedEnemy = new EliteRedEnemy(difficultySettings);
    lastEliteRedSpawnTime = currentTime;
  }
  if (currentEliteRedEnemy)
    currentEliteRedEnemy.update(
      getAdjustedValue(EliteRedEnemy.config.shotCooldownBase, newDifficultyLevel) / eliteAttackRate,
      deltaTime
    );
  if (
    difficultySettings.elites.green &&
    !currentEliteGreenEnemy &&
    currentTime - lastEliteGreenSpawnTime > EliteGreenEnemy.spawnInterval / eliteAttackRate
  ) {
    currentEliteGreenEnemy = new EliteGreenEnemy(difficultySettings);
    lastEliteGreenSpawnTime = currentTime;
  }
  if (currentEliteGreenEnemy)
    currentEliteGreenEnemy.update(
      getAdjustedValue(EliteGreenEnemy.config.shotCooldownBase, newDifficultyLevel) / eliteAttackRate,
      deltaTime
    );
  if (
    difficultySettings.elites.blue &&
    !currentEliteBlueEnemy &&
    currentTime - lastEliteBlueSpawnTime > EliteBlueEnemy.spawnInterval / eliteAttackRate
  ) {
    currentEliteBlueEnemy = new EliteBlueEnemy(difficultySettings);
    lastEliteBlueSpawnTime = currentTime;
  }
  if (currentEliteBlueEnemy)
    currentEliteBlueEnemy.update(
      getAdjustedValue(EliteBlueEnemy.config.shotCooldownBase, newDifficultyLevel) / eliteAttackRate,
      deltaTime
    );

  const playerRect = { x: player.x, y: player.y, width: player.width, height: player.height };
  const eliteEnemies = [
    currentEliteEnemy,
    currentBarrageEnemy,
    currentEliteRedEnemy,
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
        if (bullet.pierceCount > 0) {
          bullet.pierceCount--;
        } else {
          bullets.splice(i, 1);
          bulletRemoved = true;
          break;
        }
      }
    }
    if (bulletRemoved) continue;

    for (let j = freeRoamEnemies.length - 1; j >= 0; j--) {
      if (checkCollision(bullet, freeRoamEnemies[j])) {
        freeRoamEnemies.splice(j, 1);
        score += 15;
        if (bullet.pierceCount > 0) {
          bullet.pierceCount--;
        } else {
          bullets.splice(i, 1);
          bulletRemoved = true;
          break;
        }
      }
    }
    if (bulletRemoved) continue;

    for (const elite of eliteEnemies) {
      if (elite && elite.isActive && checkCollision(bullet, elite)) {
        elite.takeDamage(10);
        if (bullet.pierceCount > 0) {
          bullet.pierceCount--;
        } else {
          bullets.splice(i, 1);
          bulletRemoved = true;
          break;
        }
      }
    }
    if (bulletRemoved) continue;

    if (currentEliteEnemy) {
      for (let k = currentEliteEnemy.bullets.length - 1; k >= 0; k--) {
        if (checkCollision(bullet, currentEliteEnemy.bullets[k])) {
          currentEliteEnemy.bullets.splice(k, 1);
          score += 1;
          if (bullet.pierceCount > 0) {
            bullet.pierceCount--;
          } else {
            bullets.splice(i, 1);
            bulletRemoved = true;
            break;
          }
        }
      }
    }
    if (bulletRemoved) continue;

    if (currentBarrageEnemy) {
      for (let j = currentBarrageEnemy.barrageOrbs.length - 1; j >= 0; j--) {
        const orb = currentBarrageEnemy.barrageOrbs[j];
        if (checkCollision(bullet, orb)) {
          if (orb.takeDamage(1)) {
            currentBarrageEnemy.generateExplosionBullets(orb.x + orb.width / 2, orb.y + orb.height / 2);
            currentBarrageEnemy.barrageOrbs.splice(j, 1);
            score += 20;
          }
          if (bullet.pierceCount > 0) {
            bullet.pierceCount--;
          } else {
            bullets.splice(i, 1);
            bulletRemoved = true;
            break;
          }
        }
      }
    }
    if (bulletRemoved) continue;

    if (currentEliteGreenEnemy) {
      for (let j = currentEliteGreenEnemy.bullets.length - 1; j >= 0; j--) {
        const wall = currentEliteGreenEnemy.bullets[j];
        if (checkCollision(bullet, wall)) {
          if (wall.takeDamage(1)) {
            healthOrbs.push(new HealthOrb(wall.x + wall.width / 2, wall.y + wall.height / 2, 10, 15));
            currentEliteGreenEnemy.bullets.splice(j, 1);
          }
          if (bullet.pierceCount > 0) {
            bullet.pierceCount--;
          } else {
            bullets.splice(i, 1);
            bulletRemoved = true;
            break;
          }
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
            if (enemy === currentEliteEnemy) currentEliteEnemy = null;
            if (enemy === currentBarrageEnemy) currentBarrageEnemy = null;
            if (enemy === currentEliteRedEnemy) currentEliteRedEnemy = null;
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
    // 【変更】青エリートのビーム専用の当たり判定
    if (currentEliteBlueEnemy) {
      for (const laser of currentEliteBlueEnemy.activeLasers) {
        if (laser.checkCollisionWithPlayer(playerRect)) {
          damageTaken += laser.damage;
          break;
        }
      }
    }

    let collisionFound = false;
    for (const fr_enemy of freeRoamEnemies) {
      if (checkPlayerCollision(fr_enemy.bullets, 0)) {
        collisionFound = true;
        break;
      }
    }
    if (!collisionFound && damageTaken === 0) {
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
        for (const item of eliteEnemies) {
          if (item && item.isActive && checkCollision(playerRect, item)) {
            damageTaken += 30;
            break;
          }
        }
      }
    }
    if (damageTaken > 0) {
      if (player.shields > 0) {
        player.shields--;
        healthOrbs.push(new HealthOrb(player.x + player.width / 2, player.y + player.height / 2, 10, 15));
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
          player.shotsActive = true;
          player.shotsStartTime = currentTime;
          break;
        case "pierce":
          player.pierceActive = true;
          player.pierceStartTime = currentTime;
          break;
        case "shield":
          player.shields = 3;
          break;
        case "range":
          player.rangeActive = true;
          player.rangeStartTime = currentTime;
          player.beamCharges = 3;
          player.lastBeamTime = currentTime;
          break;
        case "homing":
          player.homingActive = true;
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
  if (currentEliteEnemy && !currentEliteEnemy.isActive) currentEliteEnemy = null;
  if (currentBarrageEnemy && !currentBarrageEnemy.isActive) currentBarrageEnemy = null;
  if (currentEliteRedEnemy && !currentEliteRedEnemy.isActive) currentEliteRedEnemy = null;
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

  if (player.homingActive) {
    player.shieldOffsetAngle = (player.shieldOffsetAngle + 250 * (deltaTime || 0)) % 360;
    const centerX = player.x + player.width / 2;
    const centerY = player.y + player.height / 2;
    for (let i = 0; i < 3; i++) {
      const angleRad = ((player.shieldOffsetAngle + i * 120) * Math.PI) / 180;
      const dist = player.width / 2 + 15;
      const pX = centerX + dist * Math.cos(angleRad);
      const pY = centerY + dist * Math.sin(angleRad);

      ctx.fillStyle = COLORS.YELLOW;
      ctx.save();
      ctx.translate(pX, pY);
      ctx.rotate(angleRad + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(-6, 4);
      ctx.lineTo(6, 4);
      ctx.closePath();
      ctx.fill();
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
  if (currentEliteEnemy) currentEliteEnemy.draw();
  if (currentBarrageEnemy) currentBarrageEnemy.draw();
  if (currentEliteRedEnemy) currentEliteRedEnemy.draw();
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
      ctx.fillText("DIFFICULTY UP!!", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
    } else {
      difficultyUpAnimation.active = false;
    }
  } // HP Bar

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
  ctx.fillText(`${Math.round(player.hp)}`, hpBarX + hpBarWidth / 2, hpBarY - 15); // Buff Icons

  const buffIconSize = 40;
  let buffIconY = 20;
  const buffIconX = SCREEN_WIDTH - buffIconSize - 20;
  const drawBuffIcon = (type, value) => {
    let color = COLORS.WHITE;
    let text = "";
    switch (type) {
      case "spread":
        color = COLORS.PURPLE;
        break;
      case "pierce":
        color = COLORS.CRIMSON;
        break;
      case "range":
        color = COLORS.BLUE;
        break;
      case "shield":
        color = COLORS.LIGHT_BLUE;
        text = value;
        break;
      case "homing":
        color = COLORS.YELLOW;
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

    if (text) {
      ctx.fillStyle = COLORS.WHITE;
      ctx.font = "bold 24px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, buffIconX + buffIconSize / 2, buffIconY + buffIconSize / 2 + 2);
    }

    buffIconY += buffIconSize + 10;
  };

  if (player.shotsActive) {
    const remaining = 1 - (currentTime - player.shotsStartTime) / player.shotsDuration;
    drawBuffIcon("spread", remaining);
  }
  if (player.shields > 0) {
    drawBuffIcon("shield", player.shields);
  }
  if (player.pierceActive) {
    const remaining = 1 - (currentTime - player.pierceStartTime) / player.pierceDuration;
    drawBuffIcon("pierce", remaining);
  }
  if (player.rangeActive) {
    const remaining = 1 - (currentTime - player.rangeStartTime) / player.rangeDuration;
    drawBuffIcon("range", remaining);
  }
  if (player.homingActive) {
    const remaining = 1 - (currentTime - player.homingStartTime) / player.homingDuration;
    drawBuffIcon("homing", remaining);
  } // Score and Difficulty

  ctx.fillStyle = COLORS.WHITE;
  ctx.font = `24px sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText(`Score: ${score}`, 20, 40);
  ctx.fillText(`Difficulty: ${currentDifficultyLevel}`, 20, 70);
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
