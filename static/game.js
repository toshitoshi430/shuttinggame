const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

//プレイヤー画像
const playerImage = new Image();
let playerImageLoaded = false;
playerImage.onload = function () {
  playerImageLoaded = true;
};
playerImage.src = "/static/textures/Rocket.png";

const bossImage = new Image();
let bossImageLoaded = false;

bossImage.onload = function () {
  bossImageLoaded = true;
};
bossImage.src = "/static/textures/boss.png";

const gameOverSound = new Audio("/static/sounds/GAMEOVER.mp3");
gameOverSound.volume = 0.5;

const shootSoundPool = [];
const shootSoundPoolSize = 5;
for (let i = 0; i < shootSoundPoolSize; i++) {
  const sound = new Audio("/static/sounds/shoot.mp3");
  sound.volume = 0.05;
  shootSoundPool.push(sound);
}
let currentShootSoundIndex = 0;

const levelUpSound = new Audio("/static/sounds/LevelUp.mp3");
levelUpSound.volume = 0.2;

const warningSound = new Audio("/static/sounds/warning.mp3");
warningSound.volume = 0.6;

const damageSound = new Audio("/static/sounds/damage.mp3");
damageSound.volume = 0.5;

const buffSound = new Audio("/static/sounds/buff.mp3");
buffSound.volume = 0.4;

const SCREEN_WIDTH = canvas.width;
const SCREEN_HEIGHT = canvas.height;

const COLORS = {
  BLACK: "#000000",
  WHITE: "#FFFFFF",
  RED: "#FF0000",
  PURPLE: "#B266FF",
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
let isBossBattleActive = false;
let currentBoss = null;
let difficultyUpAnimation = { active: false, alpha: 0, startTime: 0 };
let gameOverTapCount = 0;

// New global variable for cumulative buffs
let cumulativeBuffsCollected = 0;
// New animation state for boss absorbing buffs
let bossAbsorbAnimation = { active: false, alpha: 0, startTime: 0, text: "" };

const player = {
  width: 50, // 見た目の画像の幅
  height: 50, // 見た目の画像の高さ
  hitboxWidth: 10, // ★当たり判定の幅（小さくする）
  hitboxHeight: 10, // ★当たり判定の高さ（小さくする）
  attackMultiplier: 1.0,
  x: (SCREEN_WIDTH - 50) / 2, // widthの変更に合わせて修正
  y: SCREEN_HEIGHT - 50 - 50, // heightの変更に合わせて修正
  hp: 200,
  maxHp: 200,
  lastHitTime: 0,
  invincibilityDuration: 200, // 200に設定
  spreadLevel: 0,
  spreadStartTime: 0,
  spreadDuration: 10000,
  // ★★★★★ 変更点 ★★★★★
  // rateUpLevel, rateUpStartTime, rateUpDurationを削除し、
  // 各スタックの有効期限を管理する配列に変更
  rateUpTimers: [],
  rateUpOffsetAngle: 0,
  // ★★★★★ 変更ここまで ★★★★★
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

const bulletSettings = {
  width: 8,
  spreadWidth: 4,
  height: 25,
  speed: 18 * 60,
  cooldown: 80,
  defaultRange: SCREEN_HEIGHT * 0.65,
};

const enemySettings = { width: 40, height: 40, speedBase: 2.5 * 60, spawnIntervalBase: 1000, perWave: 5, spacing: 50 };
const freeroamEnemySettings = { spawnIntervalBase: 2000, speedBase: 4.0 * 60 };

class PlayerBullet {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.spawnY = y;
    this.width = bulletSettings.width;
    this.height = bulletSettings.height;
    this.damage = 10 * player.attackMultiplier; // Use player's permanent attack multiplier
  }
  update(deltaTime) {
    this.y -= bulletSettings.speed * deltaTime;
  }
  draw() {
    ctx.fillStyle = COLORS.WHITE;
    ctx.fillRect(this.x, this.y, this.width, this.height);
  }
}

class PlayerSpreadBullet {
  constructor(x, y, angleDeg, speed) {
    this.x = x;
    this.y = y;
    this.spawnY = y;
    this.width = bulletSettings.spreadWidth; // ★「spreadWidth: 4」を参照するように変更
    this.height = bulletSettings.height;
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;
    this.vx = speed * Math.cos(angleRad);
    this.vy = speed * Math.sin(angleRad);
    this.damage = 5 * player.attackMultiplier; // 攻撃力も変更済み
  }
  update(deltaTime) {
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
  }
  draw() {
    ctx.fillStyle = COLORS.WHITE;
    ctx.fillRect(this.x, this.y, this.width, this.height);
  }
}

class PlayerHomingBullet {
  constructor(x, y, target) {
    this.x = x;
    this.y = y;
    this.width = 10;
    this.height = 70;
    this.speed = 10 * 60;
    this.turnSpeed = 20;
    this.target = target;
    this.angle = -Math.PI / 2;
    this.damage = 15 * player.attackMultiplier; // Use player's permanent attack multiplier
    this.isExpired = false;

    this.spawnX = x;
    this.spawnY = y;
    this.maxRange = SCREEN_HEIGHT * 0.75;
    this.currentDistance = 0;

    this.isBossBattleActive = isBossBattleActive;
  }

  update(deltaTime) {
    const prevX = this.x;
    const prevY = this.y;

    if (!this.target || (this.target.isActive !== undefined && !this.target.isActive)) {
      this.y += Math.sin(this.angle) * this.speed * deltaTime;
      this.x += Math.cos(this.angle) * this.speed * deltaTime;
    } else {
      const targetCenterX = this.target.x + this.target.width / 2;
      const targetCenterY = this.target.y + this.target.height / 2;

      const targetAngle = Math.atan2(targetCenterY - this.y, targetCenterX - this.x);
      let angleDiff = targetAngle - this.angle;
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;

      const turnAmount = this.turnSpeed * deltaTime;
      this.angle += Math.max(-turnAmount, Math.min(turnAmount, angleDiff));

      this.x += Math.cos(this.angle) * this.speed * deltaTime;
      this.y += Math.sin(this.angle) * this.speed * deltaTime;
    }

    const movedDistance = Math.sqrt(Math.pow(this.x - prevX, 2) + Math.pow(this.y - prevY, 2));
    this.currentDistance += movedDistance;

    if (this.currentDistance > this.maxRange) {
      this.isExpired = true;
      return;
    }

    if (
      this.y < -this.height ||
      this.y > SCREEN_HEIGHT + this.height ||
      this.x < -this.width ||
      this.x > SCREEN_WIDTH + this.width
    ) {
      this.isExpired = true;
    }
  }

  draw() {
    ctx.fillStyle = COLORS.WHITE;

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
  takeDamage(bullet) {
    this.hp -= bullet.damage;
    if (!isBossBattleActive) score += 5;
    if (this.hp <= 0) {
      if (!isBossBattleActive) score += 10;
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
  takeDamage(bullet) {
    this.hp -= bullet.damage;
    if (!isBossBattleActive) score += 15;
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
  constructor(x, y, angle, speed, turnSpeed, color, damage, lifetime, isInvulnerable = false) {
    // isInvulnerableを引数として追加し、デフォルト値を設定
    this.x = x;
    this.y = y;
    this.width = 15;
    this.height = 50;
    this.speed = speed;
    this.turnSpeed = turnSpeed;
    this.color = color;
    this.damage = damage;
    this.angle = angle;
    this.spawnTime = performance.now();
    this.lifetime = lifetime;
    this.isExpired = false;
    this.hp = 1;
    this.isInvulnerable = isInvulnerable; // インスタンス変数として保存
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
    ctx.save();
    // 弾の中心に座標を移動
    ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
    // 弾の進行方向に合わせて描画を回転
    ctx.rotate(this.angle + Math.PI / 2);
    // 中止を基準に長方形を描画
    ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
    ctx.restore();
  }
  takeDamage(bullet) {
    if (this.isInvulnerable) {
      // 迎撃不可の場合、ダメージを受けない
      return false;
    }
    this.hp -= bullet.damage;
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
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.7})`;
    ctx.fillRect(this.x, this.y, this.width, this.height);
  }
}

class EnemyLaser {
  constructor(sourceElite, targetX, targetY, lockOnTime, thickness = 30) {
    // thickness にデフォルト値を追加
    this.sourceElite = sourceElite;
    this.target = { x: targetX + player.width / 2, y: targetY + player.height / 2 };
    this.damage = 30;
    this.thickness = thickness; // 引数で受け取ったthicknessを使用
    this.beamLength = SCREEN_WIDTH * 1.5;

    const source = { x: sourceElite.x + sourceElite.width / 2, y: sourceElite.y + sourceElite.height / 2 };
    this.angle = Math.atan2(this.target.y - source.y, this.target.x - source.x);

    this.spawnTime = performance.now();
    this.isExpired = false;

    this.lockOnDuration = lockOnTime;
    this.beamFireTime = this.spawnTime + this.lockOnDuration;
    this.beamDuration = 100;
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

      // ★★★ ここからが変更点 ★★★
      // ビームと同じ長さの線の終点を計算する
      const endX = source.x + this.beamLength * Math.cos(this.angle);
      const endY = source.y + this.beamLength * Math.sin(this.angle);

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      // 計算した終点まで線を引く
      ctx.lineTo(endX, endY);
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
    this.maxHp = config.hp * difficulty.hpMultiplier;
    this.isActive = true;
    this.lastShotTime = 0;
    this.shotCooldownBase = config.shotCooldownBase;
    this.bullets = [];
    this.color = config.color;
    this.onDefeat = config.onDefeat;
  }
  update(shotCooldown, deltaTime) {
    if (this.isActive) {
      this.y += this.speed * deltaTime;
    }
  }
  draw() {
    if (this.isActive) {
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
  }
  takeDamage(bullet) {
    this.hp -= bullet.damage;
    if (!isBossBattleActive) score += 5;
    if (this.hp <= 0) {
      if (!isBossBattleActive) score += 100;
      this.isActive = false;
      this.onDefeat(this);
      return true;
    }
    return false;
  }
}

class ElitePurple extends BaseEliteEnemy {
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
      cumulativeBuffsCollected++; // Increment cumulative buff count
    },
  };
  constructor(difficulty) {
    super(ElitePurple.config, difficulty);
    this.difficulty = difficulty;
  }
  update(shotCooldown, deltaTime) {
    super.update(shotCooldown, deltaTime);
    const currentTime = performance.now();
    if (this.isActive && currentTime - this.lastShotTime > shotCooldown) {
      this.shoot();
      this.lastShotTime = currentTime;
    }
    this.bullets.forEach((b) => b.update(deltaTime));
    this.bullets = this.bullets.filter((b) => !b.isExpired && b.y < SCREEN_HEIGHT);
  }
  shoot() {
    const bulletX = this.x + this.width / 2;
    const bulletY = this.y + this.height / 2;
    const speed = 6 * 60 * this.difficulty.bulletSpeedMultiplier;
    const turnSpeed = this.difficulty.homingTurnSpeed;
    const damage = 20;
    const spreadAngle = (50 * Math.PI) / 180;
    const lifetime = this.difficulty.homingLifetime;
    const isInvulnerable = false; // ここに false を追加
    for (let i = -2; i <= 2; i++) {
      const angle = Math.PI / 2 + i * spreadAngle;
      this.bullets.push(
        new HomingBullet(bulletX, bulletY, angle, speed, turnSpeed, COLORS.PURPLE, damage, lifetime, isInvulnerable)
      ); // isInvulnerable をコンストラクタに渡す
    }
  }
  draw() {
    super.draw();
    this.bullets.forEach((b) => b.draw());
  }
}

class BarrageOrb {
  constructor(x, y, angle) {
    this.width = 20;
    this.height = 15;
    this.x = x;
    this.y = y;
    // this.hp = 3; // 削除
    // this.maxHp = 3; // 削除
    this.exploded = false; // 初期値をfalseに
    this.explosionCooldown = 2000;
    this.spawnTime = performance.now();
    const speed = 2.5 * 60;
    this.vx = speed * Math.cos(angle);
    this.vy = speed * Math.sin(angle);
  }
  update(deltaTime) {
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
    if (!this.exploded && performance.now() - this.spawnTime > this.explosionCooldown) {
      // 炸裂時間になったら
      this.exploded = true;
      return true; // 爆発を通知
    }
    if (
      this.y > SCREEN_HEIGHT + this.height ||
      this.y < -this.height ||
      this.x < -this.width ||
      this.x > SCREEN_WIDTH + this.width
    ) {
      if (!this.exploded) {
        // 炸裂せずに画面外に出た場合も爆発を通知
        this.exploded = true;
        return true;
      }
    }
    return false;
  }
  draw() {
    ctx.fillStyle = COLORS.ORANGE;
    ctx.beginPath(); // 円を描画するためのパスを開始
    ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.width / 2, 0, Math.PI * 2); // 円を描画
    ctx.fill(); // 塗りつぶす
    // 体力バーの描画を削除
  }
  takeDamage(bullet) {
    return false; // 常にダメージを受けない
  }
}

class EliteOrange extends BaseEliteEnemy {
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
      cumulativeBuffsCollected++; // Increment cumulative buff count
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
    if (this.isActive && currentTime - this.lastShotTime > orbCooldown) {
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
  static config = {
    width: 50,
    height: 50,
    speed: 1.5 * 60,
    targetY: 150,
    hp: 200,
    maxHp: 200,
    shotCooldownBase: 800, // 800に設定
    color: COLORS.PINK,
    onDefeat: (self) => {
      const dropX = self.x + self.width / 2;
      const dropY = self.y + self.height / 2;
      buffOrbs.push(new BuffOrb(dropX, dropY, "rateUp"));
      cumulativeBuffsCollected++; // Increment cumulative buff count
    },
  };
  constructor(difficulty) {
    super(ElitePink.config, difficulty);
    this.difficulty = difficulty;
  }
  update(shotCooldown, deltaTime) {
    super.update(shotCooldown, deltaTime);
    const currentTime = performance.now();
    if (this.isActive && currentTime - this.lastShotTime > shotCooldown) {
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
    const speed = 6 * 60 * this.difficulty.bulletSpeedMultiplier; // 6 * 60に設定
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
  constructor(x, y, angle, wallHp, canDropHealth = true) {
    this.x = x;
    this.y = y;
    this.width = 120;
    this.height = 30;
    this.speed = 2.5 * 60;
    this.hp = wallHp;
    this.maxHp = wallHp;
    this.vx = this.speed * Math.cos(angle);
    this.vy = this.speed * Math.sin(angle);
    this.canDropHealth = canDropHealth;
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
  takeDamage(bullet) {
    this.hp -= bullet.damage;
    if (!isBossBattleActive) score += 1;
    if (this.hp <= 0) {
      return true;
    }
    return false;
  }
}

class EliteGreenEnemy extends BaseEliteEnemy {
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
      cumulativeBuffsCollected++; // Increment cumulative buff count
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
    if (this.isActive && currentTime - this.lastShotTime > shotCooldown) {
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
      this.bullets.push(new ObstacleBullet(startX, startY, angle, this.difficulty.wallHp, true));
    }
  }
  draw() {
    super.draw();
    this.bullets.forEach((b) => b.draw());
  }
}

class EliteBlueEnemy extends BaseEliteEnemy {
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
      cumulativeBuffsCollected++; // Increment cumulative buff count
    },
  };
  constructor(difficulty) {
    super(EliteBlueEnemy.config, difficulty);
    this.activeLasers = [];
  }
  update(shotCooldown, deltaTime, level) {
    super.update(shotCooldown, deltaTime);
    const currentTime = performance.now();

    if (
      this.isActive &&
      this.y > 50 &&
      this.activeLasers.length === 0 &&
      currentTime - this.lastShotTime > shotCooldown
    ) {
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
    const lockOnTime = Math.max(500, 1500 - (level - 1) * 50);
    this.activeLasers.push(new EnemyLaser(this, targetX, targetY, lockOnTime)); // thicknessを渡さない（デフォルト値が使われる）
  }
  draw() {
    super.draw();
    this.activeLasers.forEach((laser) => laser.draw());
  }
}

class BossEnemy extends BaseEliteEnemy {
  static config = {
    width: 220, // ← 大きくする
    height: 180, // ← 大きくする
    speed: 1.0 * 60,
    hp: 5000,
    maxHp: 5000,
    color: COLORS.DARK_GRAY,
    x: (SCREEN_WIDTH - 220) / 2, // ← widthと同じ値(220)に変更
    onDefeat: (self) => {
      endBossBattle();
    },
  };

  constructor(difficulty) {
    const bossConfig = { ...BossEnemy.config };
    const level = difficulty.level || currentDifficultyLevel;
    bossConfig.hp = bossConfig.hp + (level / 10 - 1) * 1000;
    bossConfig.maxHp = bossConfig.hp;

    super(bossConfig, difficulty);

    this.difficulty = difficulty;
    const baseAttackCooldown = 3000;
    this.attackCooldown = Math.max(800, baseAttackCooldown - (difficulty.level - 1) * 100);
    this.weakPoint = {
      xOffset: this.width / 2 - 20,
      yOffset: 20,
      width: 40,
      height: 40,
    };
    this.attackPhase = 0;
    this.phaseTimer = performance.now();
    this.attackCooldown = 3000;

    this.patrolDirection = 1;
    this.patrolSpeed = 0.5 * 60;
  }

  update(deltaTime) {
    // 画面上部に到達するまでは下に移動
    if (this.isActive && this.y < 80) {
      // ボスの初期Y座標が80に達するまで移動
      this.y += this.speed * deltaTime;
    } else if (this.isActive) {
      // ここに到達したら攻撃開始前の時間を短縮
      // 既存の左右移動ロジック
      this.x += this.patrolSpeed * this.patrolDirection * deltaTime;
      if (this.x <= 0 || this.x + this.width >= SCREEN_WIDTH) {
        this.patrolDirection *= -1;
      }
    }

    const currentTime = performance.now();
    const currentCooldown = this.phaseTimer === 0 ? 500 : this.attackCooldown;

    if (this.isActive && currentTime - this.phaseTimer > currentCooldown && this.y >= 80) {
      this.shoot();
      this.phaseTimer = currentTime;
      // 修正: 攻撃フェーズをランダムに選択
      this.attackPhase = Math.floor(Math.random() * 5); // 0から4のランダムな整数
      this.attackCooldown = Math.max(800, 3000 - (this.difficulty.level - 1) * 100);
    }

    this.bullets.forEach((b, index) => {
      if (b.update(deltaTime)) {
        if (b instanceof BarrageOrb) {
          this.generateExplosionFromOrb(b);
        }
        this.bullets.splice(index, 1);
      }
    });
    this.bullets = this.bullets.filter((b) => !b.isExpired); // この行を追加/修正
  }

  generateExplosionFromOrb(orb) {
    const numBullets = 18;
    const x = orb.x + orb.width / 2;
    const y = orb.y + orb.height / 2;
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

  shoot() {
    switch (this.attackPhase) {
      case 0:
        this.shootSpread();
        break;
      case 1:
        this.shootHoming();
        break;
      case 2:
        this.shootLaser();
        break;
      case 3:
        this.shootBarrage();
        break;
      case 4:
        this.shootWalls();
        break;
    }
  }

  shootSpread() {
    const bulletX = this.x + this.width / 2;
    const bulletY = this.y + this.height;
    let speed = 10 * 60 * this.difficulty.bulletSpeedMultiplier;
    let numWaves = 3;
    let waveDelay = 200;
    let spreadCount = 9; // 基本の拡散弾数 (-4 から 4 で 9発)

    // レベル10以上で強化
    if (this.difficulty.level >= 10) {
      numWaves = 4; // ウェーブ数を増やす
      speed *= 1.1; // 速度を少し上げる
      spreadCount = 11; // 弾数を増やす (-5 から 5 で 11発)
    }
    // レベル20以上でさらに強化
    if (this.difficulty.level >= 20) {
      numWaves = 5; // さらにウェーブ数を増やす
      speed *= 1.1; // さらに速度を上げる
      spreadCount = 13; // 弾数を増やす (-6 から 6 で 13発)
    }

    const baseAngleToPlayer = Math.atan2(player.y + player.height / 2 - bulletY, player.x + player.width / 2 - bulletX);
    const self = this;

    for (let wave = 0; wave < numWaves; wave++) {
      setTimeout(() => {
        if (!self.isActive) return;
        const startI = -Math.floor(spreadCount / 2);
        const endI = Math.ceil(spreadCount / 2) - 1; // 弾の数を調整するためのループ範囲
        for (let i = startI; i <= endI; i++) {
          const angle = baseAngleToPlayer + (i * 15 * Math.PI) / 180;
          const targetX = bulletX + Math.cos(angle) * 100;
          const targetY = bulletY + Math.sin(angle) * 100;
          self.bullets.push(new GenericEnemyBullet(bulletX, bulletY, targetX, targetY, 15, 15, speed, COLORS.PINK, 15));
        }
      }, wave * waveDelay);
    }
  }

  shootHoming() {
    const bulletX = this.x + this.width / 2;
    const bulletY = this.y + this.height;
    let speed = 7 * 60 * this.difficulty.bulletSpeedMultiplier;
    let lifetime = this.difficulty.homingLifetime;
    let numHomingBullets = 10; // 基本の弾数
    const isInvulnerable = false;

    // レベル10以上で強化
    if (this.difficulty.level >= 10) {
      numHomingBullets = 15; // 弾数を増やす
      speed *= 1.1; // 速度を上げる
      // lifetime を少し短くして攻撃頻度を上げるか、そのままで数で押すか調整
    }
    // レベル20以上でさらに強化
    if (this.difficulty.level >= 20) {
      numHomingBullets = 20; // さらに弾数を増やす
      speed *= 1.1; // さらに速度を上げる
    }

    for (let i = 0; i < numHomingBullets; i++) {
      const angle = Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
      this.bullets.push(
        new HomingBullet(bulletX, bulletY, angle, speed, 1.5, COLORS.PURPLE, 20, lifetime, isInvulnerable)
      );
      // isInvulnerable をコンストラクタに渡す
    }
  }

  shootLaser() {
    const bossLaserThickness = 80;
    let lockOnTime;

    // --- 新しい計算ロジック ---

    // 基準となる数値を設定
    const baseLevel = 10; // このレベルから計算を開始
    const baseTime = 800; // レベル10の時のロックオン時間 (ミリ秒)
    const multiplier = 0.95; // 10レベルごとに掛ける倍率

    if (this.difficulty.level < baseLevel) {
      // レベル10未満の場合、固定の長めの時間を設定
      lockOnTime = 1000;
    } else {
      // 基準レベルから、現在のレベルが「10レベル単位で何段階上か」を計算
      // 例: Level 10-19 -> 0, Level 20-29 -> 1
      const levelTiers = Math.floor((this.difficulty.level - baseLevel) / 10);

      // (基本時間) × (倍率) ^ (段階数) でロックオン時間を計算
      lockOnTime = baseTime * Math.pow(multiplier, levelTiers);
    }

    // 安全装置：ロックオン時間が短くなりすぎないように下限を設定（例: 0.25秒）
    lockOnTime = Math.max(lockOnTime, 250);

    // --- ロジックここまで ---

    this.bullets.push(new EnemyLaser(this, player.x, player.y, lockOnTime, bossLaserThickness));
  }

  shootBarrage() {
    let numOrbs = 3; // 基本のオーブ数
    // レベル10以上で強化
    if (this.difficulty.level >= 10) {
      numOrbs = 4;
    }
    // レベル20以上でさらに強化
    if (this.difficulty.level >= 20) {
      numOrbs = 5;
    }
    const orbX = this.x + this.width / 2 - 35 / 2;
    const orbY = this.y + this.height / 2;
    for (let i = 0; i < numOrbs; i++) {
      const angle = Math.random() * Math.PI;
      this.bullets.push(new BarrageOrb(orbX, orbY, angle));
    }
  }

  shootWalls() {
    let numRows = 4; // 壁を配置する行の数
    let numCols = 5; // 壁を配置する列の数
    let spawnChance = 0.11;

    // --- 難易度による変化 ---
    const level = this.difficulty.level;
    if (level >= 15) {
      numRows = 5;
      numCols = 5;
      spawnChance = 0.15;
    }
    if (level >= 25) {
      numRows = 6;
      numCols = 5;
      spawnChance = 0.2;
    }
    // -------------------------

    const wallWidth = 120; // ObstacleBulletクラスで定義されている壁の幅
    const cellWidth = SCREEN_WIDTH / numCols;
    // 壁が出現し始めるY座標（ボスの少し下）
    const spawnY = this.y + this.height + 50;

    // 各行を少し遅らせて出現させ、波のように見せる
    for (let r = 0; r < numRows; r++) {
      const rowDelay = r * 400; // 1行あたり0.4秒の遅延
      setTimeout(() => {
        // 遅延中にボスが倒された場合は何もしない
        if (!this.isActive) return;

        // 1行分の壁を生成
        for (let c = 0; c < numCols; c++) {
          // spawnChanceの確率で壁を生成
          if (Math.random() < spawnChance) {
            // 壁のX座標を計算（セルの中心に配置）
            const spawnX = c * cellWidth + (cellWidth - wallWidth) / 2;
            // 角度は常に真下
            const angle = Math.PI / 2;

            this.bullets.push(
              new ObstacleBullet(
                spawnX,
                spawnY, // Y座標は全行で同じ高さからスタート
                angle,
                this.difficulty.wallHp * 2,
                false // HPオーブはドロップしない
              )
            );
          }
        }
      }, rowDelay);
    }
  }
  takeDamage(bullet) {
    const weakPointRect = {
      x: this.x + this.weakPoint.xOffset,
      y: this.y + this.weakPoint.yOffset,
      width: this.weakPoint.width,
      height: this.weakPoint.height,
    };

    let damageDealt = bullet.damage;
    if (checkCollision(bullet, weakPointRect)) {
      damageDealt *= 3;
      if (!isBossBattleActive) score += 20;
    }

    this.hp -= damageDealt;
    if (!isBossBattleActive) score += 5;

    if (this.hp <= 0) {
      if (!isBossBattleActive) score += 5000;
      this.isActive = false;
      this.onDefeat(this);
      return true;
    }
    return false;
  }

  draw() {
    if (this.isActive) {
      // 画像が読み込まれていれば画像を描画、そうでなければ元の灰色の四角を描画
      if (bossImageLoaded) {
        ctx.drawImage(bossImage, this.x, this.y, this.width, this.height);
      } else {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
      }

      const hpBarHeight = Math.max(2, Math.round(this.width * 0.1));
      const hpBarWidth = this.width;
      const hpRatio = this.hp > 0 ? this.hp / this.maxHp : 0;
      ctx.fillStyle = COLORS.RED;
      ctx.fillRect(this.x, this.y - hpBarHeight - 5, hpBarWidth, hpBarHeight);
      ctx.fillStyle = COLORS.LIME_GREEN;
      ctx.fillRect(this.x, this.y - hpBarHeight - 5, hpBarWidth * hpRatio, hpBarHeight);
    }

    this.bullets.forEach((b) => b.draw());
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

class RewardOrb {
  constructor(x, y) {
    this.width = 60;
    this.height = 60;
    this.x = x - this.width / 2;
    this.y = y - this.height / 2;
    this.speed = 3 * 60;
    this.spawnTime = performance.now();
  }
  update(deltaTime) {
    this.y += this.speed * deltaTime;
  }
  draw() {
    const currentTime = performance.now();
    const hue = (currentTime / 20) % 360;
    ctx.fillStyle = `hsl(${hue}, 100%, 70%)`;
    ctx.beginPath();
    ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.WHITE;
    ctx.font = "bold 40px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("★", this.x + this.width / 2, this.y + this.height / 2 + 2);
  }
}

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

let difficultySettings = {};
function updateDifficultySettings(level) {
  let settings = {
    hpMultiplier: 1.0,
    speedMultiplier: 1.0,
    bulletSpeedMultiplier: 1.0,
    attackRateMultiplier: 1.0,
    elites: { purple: false, pink: false, orange: false, green: false, blue: false },
    wallHp: 100,
    homingLifetime: 3000,
    homingTurnSpeed: 1.5,
    eliteSlotInterval: 3000,
    attackCooldownReduction: 0,
  };

  if (level >= 6) {
    settings.hpMultiplier = 1.0 + (level - 5) * 0.04;
    settings.speedMultiplier = 1.0 + (level - 5) * 0.001;
    settings.bulletSpeedMultiplier = 1.0 + (level - 5) * 0.001;
    settings.attackRateMultiplier = 1.0 + (level - 5) * 0.001;
    settings.wallHp = 100 + (level - 5) * 2;
    settings.homingLifetime = 3000 + (level - 5) * 0.01;
  }
  if (level >= 1) settings.elites.purple = true;
  if (level >= 2) settings.elites.pink = true;
  if (level >= 3) settings.elites.green = true;
  if (level >= 4) settings.elites.blue = true;
  if (level >= 5) settings.elites.orange = true;

  settings.attackCooldownReduction = (level - 1) * 20;
  difficultySettings = settings;
  difficultySettings.level = level;
}

function startBossBattle() {
  isBossBattleActive = true;
  enemies = [];
  freeRoamEnemies = [];
  explosionBullets = [];

  // Clear all existing buff orbs from the screen, simulating absorption
  buffOrbs = [];
  healthOrbs = []; // Also clear health orbs if they are considered "buffs" in this context

  // Reset player's temporary buffs
  player.spreadLevel = 0;
  player.spreadStartTime = 0;
  // ★★★★★ 変更点 ★★★★★
  // レートアップバフのタイマーをリセット
  player.rateUpTimers = [];
  // ★★★★★ 変更ここまで ★★★★★
  player.shieldLevel = 0;
  player.shields = 0;
  player.rangeLevel = 0;
  player.rangeStartTime = 0;
  player.beamCharges = 0;
  player.homingLevel = 0;
  player.homingStartTime = 0;

  [currentElitePurple, currentEliteOrange, currentElitePink, currentEliteGreenEnemy, currentEliteBlueEnemy].forEach(
    (elite) => {
      if (elite) elite.bullets = [];
    }
  );
  currentElitePurple = null;
  currentEliteOrange = null;
  currentElitePink = null;
  currentEliteGreenEnemy = null;
  currentEliteBlueEnemy = null;

  currentBoss = new BossEnemy(difficultySettings);
  difficultyUpAnimation = { active: true, startTime: performance.now(), text: "WARNING!!", duration: 3000 };
  warningSound.play();
  lastShotTime = performance.now(); // ここを追加
}

function endBossBattle() {
  isBossBattleActive = false;
  const bossCenter = { x: currentBoss.x + currentBoss.width / 2, y: currentBoss.y + currentBoss.height / 2 };
  currentBoss = null;
  buffOrbs.push(new RewardOrb(bossCenter.x, bossCenter.y));
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
  // ★★★★★ 変更点 ★★★★★
  // ゲームリセット時にrateUpTimersを空の配列に
  player.rateUpTimers = [];
  // ★★★★★ 変更ここまで ★★★★★
  player.shieldLevel = 0;
  player.shields = 0;
  player.rangeLevel = 0;
  player.beamCharges = 0;
  player.homingLevel = 0;
  player.attackMultiplier = 1.0; // Reset permanent attack multiplier
  cumulativeBuffsCollected = 0; // Reset cumulative buffs on new game

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
  isBossBattleActive = false;
  currentBoss = null;
  lastShotTime = 0;
  lastEnemySpawnTime = 0;
  lastFreeroamSpawnTime = 0;
  lastHomingShotTime = 0;
  lastEliteSlotSpawnTime = 0;
}

/**
 * ===================================================================================
 *
 * update関数の修正箇所
 *
 * - プレイヤーとRewardOrb（★マークのオーブ）の衝突判定内に、
 * 全種類のバフを1段階ずつレベルアップさせる処理を追加しました。
 *
 * ===================================================================================
 */
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

  const levelJustChanged = newDifficultyLevel !== currentDifficultyLevel;
  if (levelJustChanged) {
    currentDifficultyLevel = newDifficultyLevel;
    updateDifficultySettings(currentDifficultyLevel);
    if (newDifficultyLevel > 0 && newDifficultyLevel % 10 === 0) {
      startBossBattle();
    } else {
      difficultyUpAnimation = { active: true, startTime: currentTime, text: "LEVEL UP!!", duration: 2000 };
      levelUpSound.play();
    }
  }

  const speedMultiplier = difficultySettings.speedMultiplier || 1.0;
  const currentEnemySpeed = enemySettings.speedBase * speedMultiplier;
  const currentEnemySpawnInterval = enemySettings.spawnIntervalBase;
  const currentFreeroamEnemySpeed = freeroamEnemySettings.speedBase * speedMultiplier;
  const currentFreeroamSpawnInterval =
    freeroamEnemySettings.spawnIntervalBase / (difficultySettings.attackRateMultiplier || 1.0);

  if (player.hp > player.maxHp) {
    player.hp -= 20 * deltaTime;
  }
  if (player.homingLevel > 0) {
    player.shieldOffsetAngle = (player.shieldOffsetAngle + 90 * (deltaTime || 0)) % 360;
  }
  // ★★★★★ 変更点 ★★★★★
  // rateUpLevel > 0 の代わりに rateUpTimers.length > 0 で判定
  if (player.rateUpTimers.length > 0) {
    player.rateUpOffsetAngle = (player.rateUpOffsetAngle + 180 * deltaTime) % 360;
  }
  // 古いrateUpのタイマー処理を削除
  // ★★★★★ 変更ここまで ★★★★★

  // ★★★★★ 変更点 ★★★★★
  // 新しいレートアップバフの有効期限切れ処理
  // 有効期限(expiry > currentTime)を過ぎたタイマーを配列から除去する
  player.rateUpTimers = player.rateUpTimers.filter((expiry) => expiry > currentTime);
  // ★★★★★ 変更ここまで ★★★★★

  if (player.spreadLevel > 0 && currentTime - player.spreadStartTime > player.spreadDuration) player.spreadLevel = 0;
  if (player.rangeLevel > 0 && currentTime - player.rangeStartTime > player.rangeDuration) {
    player.rangeLevel = 0;
    player.beamCharges = 0;
  }
  if (player.homingLevel > 0 && currentTime - player.homingStartTime > player.homingDuration) player.homingLevel = 0;

  if (player.beamCharges > 0 && currentTime - player.lastBeamTime > 1000) {
    activeBeams.push(new Beam(player.x + player.width / 2 - 30, 60));
    player.beamCharges--;
    player.lastBeamTime = currentTime;
  }
  activeBeams.forEach((b) => b.update(deltaTime));
  activeBeams = activeBeams.filter((b) => !b.isExpired);

  if (isInputActive) {
    player.x = inputX - player.width / 2;
    player.y = inputY - player.height / 2 - 150;
  }
  player.x = Math.max(0, Math.min(player.x, SCREEN_WIDTH - player.width));
  player.y = Math.max(0, Math.min(player.y, SCREEN_HEIGHT - player.height));

  // ★★★★★ 変更点 ★★★★★
  // レートアップ効果の計算方法を変更
  // スタック数(rateUpTimers.length)に応じて、1.5のべき乗でレートを乗算
  const rateUpCount = player.rateUpTimers.length;
  const rateMultiplier = rateUpCount > 0 ? Math.pow(1.5, rateUpCount) : 1;
  // ★★★★★ 変更ここまで ★★★★★

  const cooldown = bulletSettings.cooldown / rateMultiplier;
  if (currentTime - lastShotTime > cooldown) {
    // // ★★★ プールから順番にサウンドを取り出して再生 ★★★
    // const soundToPlay = shootSoundPool[currentShootSoundIndex];
    // soundToPlay.currentTime = 0;
    // soundToPlay.play();

    // // 次に再生するサウンドのインデックスを更新する
    // currentShootSoundIndex = (currentShootSoundIndex + 1) % shootSoundPoolSize;

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

  const homingCooldown = 400 / rateMultiplier;
  if (player.homingLevel > 0 && currentTime - lastHomingShotTime > homingCooldown) {
    const allEnemies = [
      currentElitePurple,
      currentEliteOrange,
      currentElitePink,
      currentEliteGreenEnemy,
      currentEliteBlueEnemy,
      currentBoss,
    ].filter((e) => e && e.isActive); // eが存在し、かつisActiveがtrueであるもののみをフィルタリング

    if (allEnemies.length > 0) {
      let closestEnemy = null;
      let minDistance = Infinity;
      allEnemies.forEach((enemy) => {
        const dx = enemy.x + enemy.width / 2 - player.x;
        const dy = enemy.y + enemy.height / 2 - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < minDistance) {
          minDistance = distance;
          closestEnemy = enemy;
        }
      });
      if (closestEnemy) {
        for (let i = 0; i < player.homingLevel; i++) {
          const angleOffset = (i * (2 * Math.PI)) / player.homingLevel;
          const centerX = player.x + player.width / 2;
          const centerY = player.y + player.height / 2;
          const angleRad = (player.shieldOffsetAngle * Math.PI) / 180 + angleOffset;
          const dist = player.width / 2 + 40;
          const spawnX = centerX + dist * Math.cos(angleRad);
          const spawnY = centerY + dist * Math.sin(angleRad);
          playerHomingBullets.push(new PlayerHomingBullet(spawnX, spawnY, closestEnemy));
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

  if (!isBossBattleActive) {
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

    const currentEliteSlotInterval = difficultySettings.eliteSlotInterval - (newDifficultyLevel - 1) * 100;
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
  }

  const eliteAttackCooldownReduction = difficultySettings.attackCooldownReduction || 0;
  const eliteAttackRate = difficultySettings.attackRateMultiplier || 1.0;

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
  if (currentBoss) currentBoss.update(deltaTime);

  if (currentElitePurple && currentElitePurple.y > SCREEN_HEIGHT) currentElitePurple = null;
  if (currentEliteOrange && currentEliteOrange.y > SCREEN_HEIGHT) currentEliteOrange = null;
  if (currentElitePink && currentElitePink.y > SCREEN_HEIGHT) currentElitePink = null;
  if (currentEliteGreenEnemy && currentEliteGreenEnemy.y > SCREEN_HEIGHT) currentEliteGreenEnemy = null;
  if (currentEliteBlueEnemy && currentEliteBlueEnemy.y > SCREEN_HEIGHT) currentEliteBlueEnemy = null;

  const hitboxX = player.x + (player.width - player.hitboxWidth) / 2;
  const hitboxY = player.y + (player.height - player.hitboxHeight) / 2;
  const playerRect = { x: hitboxX, y: hitboxY, width: player.hitboxWidth, height: player.hitboxHeight };
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
        if (enemies[j].takeDamage(bullet)) {
          enemies.splice(j, 1);
        }
        bullets.splice(i, 1);
        bulletRemoved = true;
        break;
      }
    }
    if (bulletRemoved) continue;

    for (let j = freeRoamEnemies.length - 1; j >= 0; j--) {
      if (checkCollision(bullet, freeRoamEnemies[j])) {
        if (freeRoamEnemies[j].takeDamage(bullet)) {
          freeRoamEnemies.splice(j, 1);
        }
        bullets.splice(i, 1);
        bulletRemoved = true;
        break;
      }
    }
    if (bulletRemoved) continue;

    for (const elite of eliteEnemies) {
      if (elite && elite.isActive && checkCollision(bullet, elite)) {
        elite.takeDamage(bullet);
        bullets.splice(i, 1);
        bulletRemoved = true;
        break;
      }
    }
    if (bulletRemoved) continue;

    if (currentBoss && currentBoss.isActive) {
      if (checkCollision(bullet, currentBoss)) {
        if (currentBoss.takeDamage(bullet)) {
        }
        bullets.splice(i, 1);
        bulletRemoved = true;
        break;
      }
    }
    if (bulletRemoved) continue;

    if (currentElitePurple) {
      for (let k = currentElitePurple.bullets.length - 1; k >= 0; k--) {
        const eliteBullet = currentElitePurple.bullets[k];
        if (checkCollision(bullet, eliteBullet)) {
          if (eliteBullet.takeDamage(bullet)) {
            currentElitePurple.bullets.splice(k, 1);
            if (!isBossBattleActive) score += 1;
          }
          bullets.splice(i, 1);
          bulletRemoved = true;
          break;
        }
      }
    }
    if (bulletRemoved) continue;

    if (currentBoss) {
      for (let k = currentBoss.bullets.length - 1; k >= 0; k--) {
        const bossBullet = currentBoss.bullets[k];

        // ★★★ 条件を変更 ★★★
        // ボスの弾が「壁」または「追尾弾」の場合に当たり判定をチェックする
        if (
          (bossBullet instanceof ObstacleBullet || bossBullet instanceof HomingBullet) &&
          checkCollision(bullet, bossBullet)
        ) {
          // takeDamageメソッドでダメージを与え、破壊されたらtrueが返る
          if (bossBullet.takeDamage(bullet)) {
            currentBoss.bullets.splice(k, 1); // ボスの弾を削除
          }
          bullets.splice(i, 1); // プレイヤーの弾を削除
          bulletRemoved = true;
          break;
        }
      }
    }
    if (bulletRemoved) continue; // プレイヤーの弾が削除されたら次のプレイヤー弾へ

    if (currentEliteGreenEnemy) {
      for (let j = currentEliteGreenEnemy.bullets.length - 1; j >= 0; j--) {
        const wall = currentEliteGreenEnemy.bullets[j];
        if (checkCollision(bullet, wall)) {
          if (wall.takeDamage(bullet)) {
            if (wall.canDropHealth) {
              healthOrbs.push(new HealthOrb(wall.x + wall.width / 2, wall.y + wall.height / 2, 10, 30));
            }
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
    const pBullet = playerHomingBullets[i]; // この変数はこのループ内で有効
    let bulletRemoved = false; // 各 pBullet の処理ごとにリセット

    // --- ここから新しい衝突判定の追加・配置 ---

    // 1. 通常の敵 (enemies) との衝突判定
    for (let j = enemies.length - 1; j >= 0; j--) {
      if (checkCollision(pBullet, enemies[j])) {
        if (enemies[j].takeDamage(pBullet)) {
          enemies.splice(j, 1); // 敵が倒されたらリストから削除
        }
        playerHomingBullets.splice(i, 1); // 追尾弾も消す
        bulletRemoved = true;
        break; // この追尾弾の他の衝突チェックは不要
      }
    }
    if (bulletRemoved) continue; // 弾が削除されたら次の追尾弾へ

    // 2. フリーローム敵 (freeRoamEnemies) との衝突判定
    for (let j = freeRoamEnemies.length - 1; j >= 0; j--) {
      if (checkCollision(pBullet, freeRoamEnemies[j])) {
        if (freeRoamEnemies[j].takeDamage(pBullet)) {
          freeRoamEnemies.splice(j, 1); // 敵が倒されたらリストから削除
        }
        playerHomingBullets.splice(i, 1); // 追尾弾も消す
        bulletRemoved = true;
        break;
      }
    }
    if (bulletRemoved) continue; // 弾が削除されたら次の追尾弾へ

    // 3. エリート敵本体との衝突判定 (既存のコード)
    for (const elite of eliteEnemies) {
      if (elite && elite.isActive && checkCollision(pBullet, elite)) {
        if (elite.takeDamage(pBullet)) {
        }
        playerHomingBullets.splice(i, 1); // 追尾弾も消す
        bulletRemoved = true;
        break;
      }
    }
    if (bulletRemoved) continue; // 弾が削除されたら次の追尾弾へ

    // 4. ボス本体との衝突判定 (既存のコード)
    // ボス本体との衝突も、弾は消滅すべき
    if (currentBoss && currentBoss.isActive && checkCollision(pBullet, currentBoss)) {
      if (currentBoss.takeDamage(pBullet)) {
      }
      playerHomingBullets.splice(i, 1); // 追尾弾も消す
      // bulletRemoved = true; // break するので continue は不要
      break; // ボスに当たったらこの追尾弾の処理を終了し、次の追尾弾へ
    }
    // ★ここには `if (bulletRemoved) continue;` は不要。上の `break` でループを抜けるため。

    // 5. 紫エリートの弾 (HomingBullet) との衝突判定
    // 紫エリートの弾が迎撃不可でない場合のみ、ダメージを与え、弾が消える
    if (currentElitePurple) {
      for (let k = currentElitePurple.bullets.length - 1; k >= 0; k--) {
        const eliteBullet = currentElitePurple.bullets[k];
        // HomingBullet のインスタンスであり、かつ迎撃不可でない場合
        if (eliteBullet instanceof HomingBullet && !eliteBullet.isInvulnerable) {
          if (checkCollision(pBullet, eliteBullet)) {
            if (eliteBullet.takeDamage(pBullet)) {
              // 紫エリートの弾にダメージ
              currentElitePurple.bullets.splice(k, 1); // 破壊されたら紫エリートの弾を削除
              if (!isBossBattleActive) score += 1; // 撃墜スコア
            }
            playerHomingBullets.splice(i, 1); // 追尾弾も消す
            bulletRemoved = true;
            break;
          }
        }
      }
    }
    if (bulletRemoved) continue; // 弾が削除されたら次の追尾弾へ

    // 6. ボスの弾 (BarrageOrb と 迎撃不可の HomingBullet 以外) との衝突判定
    // BarrageOrb (迎撃不可) とボスの迎撃不可 HomingBullet は貫通させる
    if (currentBoss) {
      for (let k = currentBoss.bullets.length - 1; k >= 0; k--) {
        const bossBullet = currentBoss.bullets[k];
        // BarrageOrb ではない AND (HomingBullet ではない OR HomingBullet だが迎撃不可ではない)
        // つまり、破壊可能なボスの弾のみを対象
        if (!(bossBullet instanceof BarrageOrb) && !(bossBullet instanceof HomingBullet && bossBullet.isInvulnerable)) {
          // bossBullet が takeDamage メソッドを持っていることを確認
          if (typeof bossBullet.takeDamage === "function") {
            if (checkCollision(pBullet, bossBullet)) {
              if (bossBullet.takeDamage(pBullet)) {
                // ボスの弾にダメージ
                currentBoss.bullets.splice(k, 1); // 破壊されたらボスの弾を削除
              }
              playerHomingBullets.splice(i, 1); // 追尾弾も消す
              bulletRemoved = true;
              break;
            }
          }
        }
      }
    }
    if (bulletRemoved) continue; // 弾が削除されたら次の追尾弾へ

    // 7. 緑エリートの壁 (ObstacleBullet) との衝突判定
    if (currentEliteGreenEnemy) {
      for (let j = currentEliteGreenEnemy.bullets.length - 1; j >= 0; j--) {
        const wall = currentEliteGreenEnemy.bullets[j];
        if (checkCollision(pBullet, wall)) {
          if (wall.takeDamage(pBullet)) {
            // 壁にダメージ
            if (wall.canDropHealth) {
              // HPオーブを落とせる場合
              healthOrbs.push(new HealthOrb(wall.x + wall.width / 2, wall.y + wall.height / 2, 10, 30));
            }
            currentEliteGreenEnemy.bullets.splice(j, 1); // 破壊されたら壁を削除
          }
          playerHomingBullets.splice(i, 1); // 追尾弾も消す
          bulletRemoved = true;
          break;
        }
      }
    }
    if (bulletRemoved) continue;

    // ボス本体との衝突判定
    if (currentBoss && currentBoss.isActive && checkCollision(pBullet, currentBoss)) {
      if (currentBoss.takeDamage(pBullet)) {
      }
      playerHomingBullets.splice(i, 1);
      break;
    }
  }

  activeBeams.forEach((beam) => {
    const damage = beam.damage;
    [...enemies, ...freeRoamEnemies, ...eliteEnemies.filter((e) => e), currentBoss].forEach((enemy) => {
      if (enemy && enemy.isActive && checkCollision(beam, enemy)) {
        if (enemy.takeDamage({ damage: damage })) {
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
            if (enemy === currentBoss) currentBoss = null;
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
    const allLasers = [];
    if (currentEliteBlueEnemy) allLasers.push(...currentEliteBlueEnemy.activeLasers);
    if (currentBoss) allLasers.push(...currentBoss.bullets.filter((b) => b instanceof EnemyLaser));

    for (const laser of allLasers) {
      if (laser.checkCollisionWithPlayer(playerRect)) {
        damageTaken += laser.damage;
        isEliteAttack = true;
        break;
      }
    }

    let collisionFound = false;
    for (const fr_enemy of freeRoamEnemies) {
      // freeRoroamEnemies -> freeRoamEnemies に修正
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
        // 炸裂しない弾はダメージ受けないので注意
        isEliteAttack = true;
        currentEliteOrange.generateExplosionBullets(
          hitSource.x + hitSource.width / 2,
          hitSource.y + hitSource.height / 2
        );
        currentEliteOrange.barrageOrbs.splice(currentEliteOrange.barrageOrbs.indexOf(hitSource), 1);
      } else {
        for (const item of [...eliteEnemies, currentBoss]) {
          if (item && item.isActive && checkCollision(playerRect, item)) {
            damageTaken += 30;
            isEliteAttack = true;
            break;
          }
        }
      }
    }
    if (
      damageTaken === 0 &&
      currentBoss &&
      checkPlayerCollision(
        currentBoss.bullets.filter((b) => !(b instanceof EnemyLaser)),
        0
      )
    ) {
      isEliteAttack = true;
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
        damageSound.currentTime = 0; // 短時間に連続でダメージを受けても音が鳴るよう、再生位置を最初に戻す
        damageSound.play();
      }
    }
  }

  for (let i = healthOrbs.length - 1; i >= 0; i--) {
    const orb = healthOrbs[i];
    if (checkCollision(playerRect, orb)) {
      if (orb.healAmount <= 10) {
        player.hp = Math.min(player.maxHp, player.hp + 2);
      } else {
        player.hp += orb.healAmount;
      }
      healthOrbs.splice(i, 1);
    }
  }
  for (let i = buffOrbs.length - 1; i >= 0; i--) {
    const orb = buffOrbs[i];
    if (checkCollision(playerRect, orb)) {
      buffSound.currentTime = 0;
      buffSound.play();
      if (orb instanceof RewardOrb) {
        // HP全回復と攻撃力ボーナス
        player.hp = player.maxHp;
        player.attackMultiplier += cumulativeBuffsCollected * 0.01;
        player.attackMultiplier = Math.max(1.0, player.attackMultiplier);
        cumulativeBuffsCollected = 0;

        // 全種類のバフを1段階ずつレベルアップ
        // 1. Spread
        player.spreadLevel = Math.min(3, player.spreadLevel + 1);
        player.spreadStartTime = currentTime;

        // 2. RateUp
        // ★★★★★ 変更点 ★★★★★
        // RewardOrb取得時にも新しいタイマーを追加
        player.rateUpTimers.push(currentTime + 10000); // 10秒のタイマーを追加
        // ★★★★★ 変更ここまで ★★★★★

        // 3. Shield
        player.shieldLevel = Math.min(3, player.shieldLevel + 1);
        const shieldCounts = [0, 3, 4, 5];
        player.shields = shieldCounts[player.shieldLevel];

        // 4. Range
        if (player.rangeLevel === 0) {
          player.beamCharges = 3;
        } else {
          player.beamCharges += 2;
        }
        player.rangeLevel = Math.min(3, player.rangeLevel + 1);
        player.rangeStartTime = currentTime;
        player.lastBeamTime = currentTime;

        // 5. Homing
        player.homingLevel = Math.min(3, player.homingLevel + 1);
        player.homingStartTime = currentTime;

        buffOrbs.splice(i, 1);
        continue;
      }
      switch (orb.type) {
        case "spread":
          player.spreadLevel = Math.min(3, player.spreadLevel + 1);
          player.spreadStartTime = currentTime;
          break;
        // ★★★★★ 変更点 ★★★★★
        // レートアップバフ取得時の処理を変更
        case "rateUp":
          // 上限なく、タイマー配列に新しい有効期限を追加する
          player.rateUpTimers.push(currentTime + 10000); // 10秒のタイマー
          break;
        // ★★★★★ 変更ここまで ★★★★★
        case "shield":
          player.shieldLevel = Math.min(3, player.shieldLevel + 1);
          const shieldCounts = [0, 3, 4, 5];
          player.shields = shieldCounts[player.shieldLevel];
          break;
        case "range":
          if (player.rangeLevel === 0) {
            player.beamCharges = 3;
          } else {
            player.beamCharges += 2;
          }
          player.rangeLevel = Math.min(3, player.rangeLevel + 1);
          player.rangeStartTime = currentTime;
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
    (e) => e.y < SCREEN_HEIGHT && e.y > -30 && e.x > -30 && e.x < SCREEN_WIDTH + 30
  );
  explosionBullets = explosionBullets.filter(
    (b) => b.y > -b.height && b.y < SCREEN_HEIGHT && b.x > -b.width && b.x < SCREEN_WIDTH
  );
  healthOrbs = healthOrbs.filter((o) => o.y < SCREEN_HEIGHT);
  buffOrbs = buffOrbs.filter((o) => o.y < SCREEN_HEIGHT);

  if (currentElitePurple && !currentElitePurple.isActive && currentElitePurple.bullets.length === 0)
    currentElitePurple = null;
  if (currentEliteOrange && !currentEliteOrange.isActive && currentEliteOrange.barrageOrbs.length === 0)
    currentEliteOrange = null;
  if (currentElitePink && !currentElitePink.isActive && currentElitePink.bullets.length === 0) currentElitePink = null;
  if (currentEliteGreenEnemy && !currentEliteGreenEnemy.isActive && currentEliteGreenEnemy.bullets.length === 0)
    currentEliteGreenEnemy = null;
  if (currentEliteBlueEnemy && !currentEliteBlueEnemy.isActive) {
    currentEliteBlueEnemy.activeLasers = []; // ★アクティブなレーザーを即時消去
    currentEliteBlueEnemy = null; // ★本体も即時消去
  }
  if (currentBoss && !currentBoss.isActive && currentBoss.bullets.length === 0) currentBoss = null;

  if (player.hp <= 0) {
    gameOver = true;
    gameOverSound.play();
  }
}

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

  // --- バフエフェクトの描画（点滅処理付き）---
  // ★★★★★ 変更点 ★★★★★
  // rateUpLevelの代わりにrateUpTimers.lengthで描画を判定
  const rateUpCount = player.rateUpTimers.length;
  if (rateUpCount > 0) {
    // 一番早く期限切れになるタイマーを見つける
    const nextExpiry = Math.min(...player.rateUpTimers);
    const remainingTime = nextExpiry - currentTime;
    const isExpiring = remainingTime < 3000;
    const shouldDraw = !isExpiring || Math.floor(currentTime / 150) % 2 === 0;

    if (shouldDraw) {
      const centerX = player.x + player.width / 2;
      const centerY = player.y + player.height / 2;
      // スタック数に応じて描画する三角形の数を変更
      const numTriangles = rateUpCount;
      const orbitRadius = player.width / 2 + 20;
      const triangleSize = 15;
      for (let i = 0; i < numTriangles; i++) {
        const angleRad = ((player.rateUpOffsetAngle + i * (360 / numTriangles)) * Math.PI) / 180;
        const triX = centerX + orbitRadius * Math.cos(angleRad);
        const triY = centerY + orbitRadius * Math.sin(angleRad);
        ctx.fillStyle = COLORS.PINK;
        ctx.save();
        ctx.translate(triX, triY);
        ctx.rotate(angleRad + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -triangleSize / 2);
        ctx.lineTo(-triangleSize / 2, triangleSize / 2);
        ctx.lineTo(triangleSize / 2, triangleSize / 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  }
  // ★★★★★ 変更ここまで ★★★★★

  if (player.homingLevel > 0) {
    const remainingTime = player.homingDuration - (currentTime - player.homingStartTime);
    const isExpiring = remainingTime < 3000;
    const shouldDraw = !isExpiring || Math.floor(currentTime / 150) % 2 === 0;
    if (shouldDraw) {
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
  }

  if (player.shields > 0) {
    player.shieldOffsetAngle = (player.shieldOffsetAngle + 450 * (deltaTime || 0)) % 360;
    const shieldCenterX = player.x + player.width / 2;
    const shieldCenterY = player.y + player.height / 2;
    for (let i = 0; i < player.shields; i++) {
      const angleRad = ((player.shieldOffsetAngle + i * (360 / player.shields)) * Math.PI) / 180;
      const offsetDist = player.width / 2 - 10;
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
    let shouldDraw = true;
    if (player.rangeLevel > 0) {
      const remainingTime = player.rangeDuration - (currentTime - player.rangeStartTime);
      const isExpiring = remainingTime < 3000;
      shouldDraw = !isExpiring || Math.floor(currentTime / 150) % 2 === 0;
    }
    if (shouldDraw) {
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
  }

  // --- プレイヤー描画 ---
  if (!(currentTime - player.lastHitTime < player.invincibilityDuration && Math.floor(currentTime / 100) % 2 === 0)) {
    // 画像の読み込みが完了しているかチェック
    if (playerImageLoaded) {
      // 画像を描画する
      ctx.drawImage(playerImage, player.x, player.y, player.width, player.height);
    } else {
      // もし画像の読み込みが間に合わなかったら、代わりに白い四角を描画
      ctx.fillStyle = COLORS.WHITE;
      ctx.fillRect(player.x, player.y, player.width, player.height);
    }
  }

  // --- 各種オブジェクト描画 ---
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
  if (currentBoss) currentBoss.draw();

  // --- アニメーション描画 ---
  if (bossAbsorbAnimation.active) {
    const elapsed = currentTime - bossAbsorbAnimation.startTime;
    const animText = bossAbsorbAnimation.text;
    const animDuration = bossAbsorbAnimation.duration;
    if (elapsed < animDuration) {
      const size = 60 + (elapsed / animDuration) * 40;
      const alpha = Math.max(0, 1 - elapsed / animDuration);
      ctx.font = `bold ${size}px sans-serif`;
      ctx.fillStyle = `rgba(255, 100, 0, ${alpha})`;
      ctx.textAlign = "center";
      ctx.fillText(animText, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
    } else {
      bossAbsorbAnimation.active = false;
    }
  }

  if (difficultyUpAnimation.active) {
    const elapsed = currentTime - difficultyUpAnimation.startTime;
    const animText = difficultyUpAnimation.text || "LEVEL UP!!";
    const animDuration = difficultyUpAnimation.duration || 2000;
    if (elapsed < animDuration) {
      const size = 100 + elapsed / 10;
      const alpha = Math.max(0, 1 - elapsed / animDuration);
      ctx.font = `bold ${size}px sans-serif`;
      ctx.fillStyle = `rgba(255, 224, 102, ${alpha})`;
      ctx.textAlign = "center";
      ctx.fillText(animText, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
    } else {
      difficultyUpAnimation.active = false;
    }
  }

  // --- UI描画 ---

  // HPバー (画面下、横向き)
  const hpBarHeight = 25;
  const hpBarWidth = SCREEN_WIDTH * 0.7;
  const hpBarX = (SCREEN_WIDTH - hpBarWidth) / 2;
  const hpBarY = SCREEN_HEIGHT - hpBarHeight - 20;

  ctx.fillStyle = "rgba(100,0,0,0.5)"; // 背景（赤）
  ctx.fillRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);

  const hpRatio = player.hp > 0 ? player.hp / player.maxHp : 0;

  ctx.fillStyle = "rgba(0,255,0,0.8)"; // 通常HP（緑）
  ctx.fillRect(hpBarX, hpBarY, hpBarWidth * Math.min(1, hpRatio), hpBarHeight);

  if (player.hp > player.maxHp) {
    const overHealRatio = (player.hp - player.maxHp) / player.maxHp;
    ctx.fillStyle = "rgba(0,150,255,0.8)"; // オーバーヒール（青）
    ctx.fillRect(hpBarX, hpBarY, hpBarWidth * Math.min(1, overHealRatio), hpBarHeight);
  }

  ctx.strokeStyle = "#FFF"; // 枠線
  ctx.strokeRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);

  ctx.fillStyle = COLORS.WHITE; // HPテキスト
  ctx.font = `18px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${Math.round(player.hp)} / ${player.maxHp}`, hpBarX + hpBarWidth / 2, hpBarY + hpBarHeight / 2);

  // バフアイコン (HPバーの上、横向き中央揃え)
  const activeBuffs = [];
  if (player.spreadLevel > 0) {
    const remaining = 1 - (currentTime - player.spreadStartTime) / player.spreadDuration;
    activeBuffs.push({ type: "spread", value: remaining, level: player.spreadLevel });
  }
  if (player.shields > 0) {
    activeBuffs.push({ type: "shield", value: player.shields, level: player.shieldLevel });
  }
  // ★★★★★ 変更点 ★★★★★
  // レートアップバフのUI表示ロジックを変更
  const currentRateUpCount = player.rateUpTimers.length;
  if (currentRateUpCount > 0) {
    // 次に切れるタイマーの残り時間を計算
    const nextExpiry = Math.min(...player.rateUpTimers);
    // 各スタックの基本時間は10秒(10000ms)
    const remaining = (nextExpiry - currentTime) / 10000;
    activeBuffs.push({ type: "rateUp", value: remaining, level: currentRateUpCount });
  }
  // ★★★★★ 変更ここまで ★★★★★
  if (player.rangeLevel > 0 && player.beamCharges > 0) {
    const remaining = 1 - (currentTime - player.rangeStartTime) / player.rangeDuration;
    activeBuffs.push({ type: "range", value: player.beamCharges, level: player.rangeLevel, remaining: remaining });
  }
  if (player.homingLevel > 0) {
    const remaining = 1 - (currentTime - player.homingStartTime) / player.homingDuration;
    activeBuffs.push({ type: "homing", value: remaining, level: player.homingLevel });
  }

  const buffIconSize = 40;
  const buffIconSpacing = 10;
  const totalBuffsWidth = activeBuffs.length * buffIconSize + Math.max(0, activeBuffs.length - 1) * buffIconSpacing;
  let currentBuffIconX = (SCREEN_WIDTH - totalBuffsWidth) / 2;
  const buffIconY = hpBarY - buffIconSize - 10;

  const drawBuffIcon = (buff) => {
    let color = COLORS.WHITE;
    let text = "";
    let remainingPercent = 0;
    let showTimer = false;

    switch (buff.type) {
      case "spread":
        color = COLORS.ORANGE;
        text = `x${buff.level}`;
        remainingPercent = buff.value;
        showTimer = true;
        break;
      case "rateUp":
        color = COLORS.PINK;
        text = `x${buff.level}`;
        remainingPercent = buff.value;
        showTimer = true;
        break;
      case "range":
        color = COLORS.BLUE;
        text = buff.value;
        remainingPercent = buff.remaining;
        showTimer = true;
        break;
      case "shield":
        color = COLORS.LIGHT_BLUE;
        text = buff.value;
        break;
      case "homing":
        color = COLORS.PURPLE;
        text = `x${buff.level}`;
        remainingPercent = buff.value;
        showTimer = true;
        break;
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(currentBuffIconX + buffIconSize / 2, buffIconY + buffIconSize / 2, buffIconSize / 2, 0, 2 * Math.PI);
    ctx.fill();

    if (showTimer) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.moveTo(currentBuffIconX + buffIconSize / 2, buffIconY + buffIconSize / 2);
      ctx.arc(
        currentBuffIconX + buffIconSize / 2,
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
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(currentBuffIconX + buffIconSize / 2, buffIconY + buffIconSize / 2, buffIconSize / 2, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.fillStyle = COLORS.WHITE;
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, currentBuffIconX + buffIconSize / 2, buffIconY + buffIconSize / 2 + 2);
  };

  for (const buff of activeBuffs) {
    drawBuffIcon(buff);
    currentBuffIconX += buffIconSize + buffIconSpacing;
  }

  // スコア、レベル、その他の情報
  ctx.fillStyle = COLORS.WHITE;
  ctx.font = `24px sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText(`Score: ${score}`, 20, 40);
  ctx.fillText(`Level: ${currentDifficultyLevel}`, 20, 70);

  ctx.textAlign = "right";
  ctx.fillText(`Buffs: ${cumulativeBuffsCollected}`, SCREEN_WIDTH - 20, 40);
  ctx.fillText(`ATK: x${player.attackMultiplier.toFixed(2)}`, SCREEN_WIDTH - 20, 70);
}

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
