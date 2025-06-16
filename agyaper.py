import pygame
import random
import math

# Pygameの初期化
pygame.init()

# 画面設定
SCREEN_WIDTH = 800
SCREEN_HEIGHT = 600
screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
pygame.display.set_caption("アギャパー")

# 色の定義
BLACK = (0, 0, 0)       # 背景色
WHITE = (255, 255, 255) # プレイヤー、弾、スコアの色
RED = (255, 0, 0)       # 隊列雑魚敵、HPバーの色
PURPLE = (128, 0, 128)  # エリート敵の色
YELLOW = (255, 255, 0)  # エリート敵の弾の色
GREEN = (0, 255, 0)     # HPバーの色
CYAN = (0, 255, 255)    # 自由飛行雑魚敵の色
ORANGE = (255, 165, 0)  # 花火弾幕敵、その弾幕オーブの色
DARK_BLUE = (0, 0, 128) # 最終ボスの色

# プレイヤーの設定
player_width = 20
player_height = 20
player_x = (SCREEN_WIDTH - player_width) // 2
player_y = SCREEN_HEIGHT - player_height - 30
player_speed = 3.0
player_hp = 100
player_max_hp = 100
player_last_hit_time = 0 # 無敵時間管理用
player_invincibility_duration = 1000 # 1秒間の無敵時間

# 弾の設定 (プレイヤーの弾)
bullet_width = 5
bullet_height = 15
bullet_speed = 12
bullets = []

# 弾のクールダウン（連射速度）設定
BULLET_COOLDOWN = 100
last_shot_time = 0

# 通常敵の設定（隊列雑魚）
enemy_width = 30
enemy_height = 30
enemy_speed_base = 1.5

class Enemy(pygame.Rect):
    def __init__(self, x, y, width, height, speed, type="straight"):
        super().__init__(x, y, width, height)
        self.original_x_float = float(x)
        self.y_float = float(y)
        self.speed = speed
        self.type = type
        self.wave_amplitude = 70
        self.wave_frequency = 0.08
        self.start_time = pygame.time.get_ticks()

    def update(self):
        if self.type == "straight":
            self.y_float += self.speed
        elif self.type == "wave":
            elapsed_time = (pygame.time.get_ticks() - self.start_time) / 1000.0
            self.y_float += self.speed
            self.x_float = self.original_x_float + self.wave_amplitude * math.sin(self.wave_frequency * elapsed_time * 10)
        
        self.x = int(self.x_float)
        self.y = int(self.y_float)

enemies = []

# 隊列雑魚敵の出現設定
ENEMY_SPAWN_INTERVAL_BASE = 1000
last_enemy_spawn_time = 0
ENEMIES_PER_WAVE = 4
ENEMY_SPACING = 40

# エリート敵が発射する弾丸の設定
class EliteBullet(pygame.Rect):
    width = 15
    height = 15
    speed = 7
    damage = 20 # ★ダメージ量を追加 (即死ではなくなる)

    def __init__(self, x, y, target_x, target_y):
        super().__init__(x, y, self.width, self.height)
        self.x_float = float(x)
        self.y_float = float(y)
        self.target_x = target_x
        self.target_y = target_y

        dx = self.target_x - self.x_float
        dy = self.target_y - self.y_float
        dist = math.sqrt(dx**2 + dy**2)
        if dist == 0:
            self.vx = 0
            self.vy = self.speed
        else:
            self.vx = (dx / dist) * self.speed
            self.vy = (dy / dist) * self.speed

    def update(self):
        self.x_float += self.vx
        self.y_float += self.vy
        self.x = int(self.x_float)
        self.y = int(self.y_float)

    def draw(self, screen):
        pygame.draw.rect(screen, YELLOW, self)

# エリート敵クラス
class EliteEnemy:
    def __init__(self):
        self.width = 60
        self.height = 60
        self.x_float = float((SCREEN_WIDTH - self.width) // 2)
        self.y_float = float(-self.height * 2)
        self.speed = 1.2
        self.target_y = 100
        self.hp = 70
        self.max_hp = 70
        self.is_active = False
        self.last_shot_time = 0
        self.shot_cooldown_base = 1000
        self.bullets = []
        self.rect = pygame.Rect(int(self.x_float), int(self.y_float), self.width, self.height)

    def update(self, player_x, player_y, current_shot_cooldown):
        if self.y_float < self.target_y:
            self.y_float += self.speed
        
        current_time = pygame.time.get_ticks()
        if current_time - self.last_shot_time > current_shot_cooldown:
            self.shoot(player_x, player_y)
            self.last_shot_time = current_time

        for e_bullet in list(self.bullets):
            e_bullet.update()
            if e_bullet.y > SCREEN_HEIGHT or e_bullet.x < -e_bullet.width or e_bullet.x > SCREEN_WIDTH + e_bullet.width:
                self.bullets.remove(e_bullet)
        
        self.rect.x = int(self.x_float)
        self.rect.y = int(self.y_float)

    def shoot(self, player_x, player_y):
        bullet_x = self.x_float + (self.width // 2) - (EliteBullet.width // 2)
        bullet_y = self.y_float + self.height
        self.bullets.append(EliteBullet(bullet_x, bullet_y, player_x + player_width/2, player_y + player_height/2))

    def draw(self, screen):
        pygame.draw.rect(screen, PURPLE, self.rect)
        hp_bar_width = self.width
        hp_bar_height = 8
        hp_ratio = self.hp / self.max_hp
        pygame.draw.rect(screen, RED, (int(self.x_float), int(self.y_float) - hp_bar_height - 3, hp_bar_width, hp_bar_height))
        pygame.draw.rect(screen, GREEN, (int(self.x_float), int(self.y_float) - hp_bar_height - 3, hp_bar_width * hp_ratio, hp_bar_height))

current_elite_enemy = None

ELITE_ENEMY_SPAWN_INTERVAL_BASE = 7000
last_elite_enemy_spawn_time = 0

# 自由飛行雑魚敵クラス
class FreeRoamEnemy(pygame.Rect):
    def __init__(self, start_x, start_y, speed):
        super().__init__(start_x, start_y, 25, 25)
        self.x_float = float(start_x)
        self.y_float = float(start_y)
        self.speed = speed
        self.target_x = random.randint(0, SCREEN_WIDTH - self.width)
        self.target_y = random.randint(0, SCREEN_HEIGHT // 2)
        self.target_tolerance = 10

        self.mode = random.choice(["roam", "chase"])
        self.chase_target_update_interval = 1000
        self.last_chase_target_update = pygame.time.get_ticks()

    def update(self, player_x, player_y):
        if self.mode == "chase":
            current_time = pygame.time.get_ticks()
            if current_time - self.last_chase_target_update > self.chase_target_update_interval:
                self.target_x = player_x + player_width/2 - self.width/2
                self.target_y = player_y + player_height/2 - self.height/2
                self.last_chase_target_update = current_time
        
        dx = self.target_x - self.x_float
        dy = self.target_y - self.y_float
        dist = math.sqrt(dx**2 + dy**2)

        if dist < self.target_tolerance:
            if self.mode == "roam":
                self.target_x = random.randint(0, SCREEN_WIDTH - self.width)
                self.target_y = random.randint(0, SCREEN_HEIGHT // 2)

        if dist > 0:
            self.x_float += (dx / dist) * self.speed
            self.y_float += (dy / dist) * self.speed
        
        self.x = int(self.x_float)
        self.y = int(self.y_float)

free_roam_enemies = []

FREEROAM_ENEMY_SPAWN_INTERVAL_BASE = 2000
last_freeroam_spawn_time = 0
freeroam_enemy_speed_base = 3.0


# ★花火弾幕敵が発射する、HPを持つ大きな弾丸（オーブ）クラス
class BarrageOrb(pygame.Rect):
    width = 40 # 大きめのサイズ
    height = 40
    speed = 2 # ゆっくり降りてくる

    def __init__(self, x, y):
        super().__init__(x, y, self.width, self.height)
        self.x_float = float(x)
        self.y_float = float(y)
        self.hp = 3 # ★HPを設定（3発で破壊）
        self.max_hp = 3
        self.exploded = False # 爆発したかどうか
        self.explosion_cooldown = 2000 # 生成されてから自動爆発するまでの時間
        self.spawn_time = pygame.time.get_ticks() # 生成時刻

    def update(self):
        self.y_float += self.speed
        self.x = int(self.x_float)
        self.y = int(self.y_float)

        # 画面下端に到達したか、一定時間経過したら爆発
        if (self.y > SCREEN_HEIGHT - self.height) or (pygame.time.get_ticks() - self.spawn_time > self.explosion_cooldown):
            if not self.exploded:
                self.exploded = True # 爆発フラグを立てる
            return True # 爆発させるのでTrueを返す
        return False # 爆発しないのでFalseを返す

    def draw(self, screen):
        pygame.draw.rect(screen, ORANGE, self) # オーブはオレンジ色
        # HPバーの描画（破壊可能なので）
        hp_bar_width = self.width
        hp_bar_height = 5
        hp_ratio = self.hp / self.max_hp
        pygame.draw.rect(screen, RED, (self.x, self.y - hp_bar_height - 2, hp_bar_width, hp_bar_height))
        pygame.draw.rect(screen, GREEN, (self.x, self.y - hp_bar_height - 2, hp_bar_width * hp_ratio, hp_bar_height))

# ★BarrageOrbが爆発した際に発生する個々の弾幕の弾クラス
class ExplosionBullet(pygame.Rect):
    width = 8
    height = 8
    
    def __init__(self, x, y, angle, speed):
        super().__init__(x, y, self.width, self.height)
        self.x_float = float(x)
        self.y_float = float(y)
        self.vx = speed * math.cos(angle)
        self.vy = speed * math.sin(angle)
        self.damage = 8 # プレイヤーへのダメージ量

    def update(self):
        self.x_float += self.vx
        self.y_float += self.vy
        self.x = int(self.x_float)
        self.y = int(self.y_float)

    def draw(self, screen):
        pygame.draw.rect(screen, YELLOW, self) # 黄色い小さな弾


# ★花火弾幕敵クラス
class BarrageEnemy:
    def __init__(self):
        self.width = 70
        self.height = 70
        self.x_float = float(random.randint(50, SCREEN_WIDTH - 50 - self.width))
        self.y_float = float(-self.height * 2)
        self.speed = 0.8
        self.target_y = random.randint(50, SCREEN_HEIGHT // 3)
        self.hp = 100 # ★HPを少し減らす (150 -> 100)
        self.max_hp = 100
        self.is_active = False
        self.last_orb_spawn_time = 0 # オーブ発射間隔
        self.orb_spawn_cooldown_base = 3000 # オーブ発射間隔（ミリ秒）
        self.barrage_orbs = [] # 発射されたBarrageOrbのリスト

        self.rect = pygame.Rect(int(self.x_float), int(self.y_float), self.width, self.height)

    def update(self, current_orb_cooldown): # ★クールダウンを受け取る
        if self.y_float < self.target_y:
            self.y_float += self.speed
        
        current_time = pygame.time.get_ticks()
        if current_time - self.last_orb_spawn_time > current_orb_cooldown: # ★動的なクールダウンを使用
            self.spawn_orb()
            self.last_orb_spawn_time = current_time

        # BarrageOrbの更新と爆発処理
        for orb in list(self.barrage_orbs):
            if orb.update(): # オーブが爆発条件を満たしたら
                self.generate_explosion_bullets(orb.x, orb.y) # 爆発弾を生成
                self.barrage_orbs.remove(orb) # オーブを削除
        
        self.rect.x = int(self.x_float)
        self.rect.y = int(self.y_float)

    def spawn_orb(self):
        # 自身からBarrageOrbを発射
        orb_x = self.x_float + (self.width // 2) - (BarrageOrb.width // 2)
        orb_y = self.y_float + self.height
        self.barrage_orbs.append(BarrageOrb(orb_x, orb_y))

    def generate_explosion_bullets(self, x, y):
        # BarrageOrbが爆発した位置から弾幕を生成
        num_bullets = 16 # 全方向に発射する弾の数
        for i in range(num_bullets):
            angle = (2 * math.pi / num_bullets) * i # 角度を計算
            explosion_bullets.append(ExplosionBullet(x, y, angle, 5)) # グローバルリストに追加

    def draw(self, screen):
        pygame.draw.rect(screen, ORANGE, self.rect)
        hp_bar_width = self.width
        hp_bar_height = 8
        hp_ratio = self.hp / self.max_hp
        pygame.draw.rect(screen, RED, (int(self.x_float), int(self.y_float) - hp_bar_height - 3, hp_bar_width, hp_bar_height))
        pygame.draw.rect(screen, GREEN, (int(self.x_float), int(self.y_float) - hp_bar_height - 3, hp_bar_width * hp_ratio, hp_bar_height))

current_barrage_enemy = None
BARRAGE_ENEMY_SPAWN_INTERVAL_BASE = 25000
last_barrage_spawn_time = 0
barrage_orb_cooldown_reduction_rate = 0.9 # 難易度上昇でオーブのクールダウンが短縮

# 爆発弾を格納するグローバルリスト
explosion_bullets = []


# 最終ボス敵クラス
class FinalBoss:
    def __init__(self):
        self.width = 150
        self.height = 150
        self.x_float = float((SCREEN_WIDTH - self.width) // 2)
        self.y_float = float(SCREEN_HEIGHT // 4)
        self.hp = 500
        self.max_hp = 500
        self.is_active = False
        self.last_shot_time = 0
        self.shot_cooldown_base = 700
        self.bullets = [] # FinalBossBulletのリスト
        self.rect = pygame.Rect(int(self.x_float), int(self.y_float), self.width, self.height)

    def update(self, player_x, player_y, current_shot_cooldown):
        current_time = pygame.time.get_ticks()
        if current_time - self.last_shot_time > current_shot_cooldown:
            self.shoot(player_x, player_y)
            self.last_shot_time = current_time

        for fb_bullet in list(self.bullets):
            fb_bullet.update()
            if fb_bullet.y > SCREEN_HEIGHT or fb_bullet.x < -fb_bullet.width or fb_bullet.x > SCREEN_WIDTH + fb_bullet.width:
                self.bullets.remove(fb_bullet)
        
        self.rect.x = int(self.x_float)
        self.rect.y = int(self.y_float)

    def shoot(self, player_x, player_y):
        bullet_x = self.x_float + self.width / 2
        bullet_y = self.y_float + self.height / 2
        self.bullets.append(FinalBossBullet(bullet_x, bullet_y, player_x + player_width/2, player_y + player_height/2))

    def draw(self, screen):
        pygame.draw.rect(screen, DARK_BLUE, self.rect)
        hp_bar_width = self.width
        hp_bar_height = 12
        hp_ratio = self.hp / self.max_hp
        pygame.draw.rect(screen, RED, (int(self.x_float), int(self.y_float) - hp_bar_height - 5, hp_bar_width, hp_bar_height))
        pygame.draw.rect(screen, GREEN, (int(self.x_float), int(self.y_float) - hp_bar_height - 5, hp_bar_width * hp_ratio, hp_bar_height))

current_final_boss = None
FINAL_BOSS_SPAWN_TIME = 60000
final_boss_cooldown_reduction_rate = 0.9

# 最終ボスの弾クラス
class FinalBossBullet(pygame.Rect):
    width = 20
    height = 20
    speed = 8
    damage = 25

    def __init__(self, x, y, target_x, target_y):
        super().__init__(x, y, self.width, self.height)
        self.x_float = float(x)
        self.y_float = float(y)
        self.target_x = target_x
        self.target_y = target_y

        dx = self.target_x - self.x_float
        dy = self.target_y - self.y_float
        dist = math.sqrt(dx**2 + dy**2)
        if dist == 0:
            self.vx = 0
            self.vy = self.speed
        else:
            self.vx = (dx / dist) * self.speed
            self.vy = (dy / dist) * self.speed

    def update(self):
        self.x_float += self.vx
        self.y_float += self.vy
        self.x = int(self.x_float)
        self.y = int(self.y_float)

    def draw(self, screen):
        pygame.draw.rect(screen, DARK_BLUE, self)

# スコア
score = 0
font = pygame.font.Font(None, 36)

# 難易度調整に関する変数
game_start_time = pygame.time.get_ticks()
current_difficulty_level = 1
DIFFICULTY_INTERVAL = 30000 # 30秒ごとに難易度アップ
MAX_DIFFICULTY_LEVEL = 10

def get_adjusted_value(base_value, level, reduction_rate=0.9, increase_rate=1.1):
    if base_value > 100: # 間隔（ミリ秒）やクールダウン（ミリ秒）の場合
        return int(base_value * (reduction_rate ** (level - 1)))
    else: # 速度の場合
        return base_value * (increase_rate ** (level - 1))

# ゲームのフレームレート制御
clock = pygame.time.Clock()
FPS = 60

# ゲームループ
running = True
game_over = False

while running:
    clock.tick(FPS)
    current_time = pygame.time.get_ticks()
    
    # 難易度調整
    elapsed_game_time = current_time - game_start_time
    new_difficulty_level = 1 + elapsed_game_time // DIFFICULTY_INTERVAL
    if new_difficulty_level > MAX_DIFFICULTY_LEVEL:
        new_difficulty_level = MAX_DIFFICULTY_LEVEL
    
    if new_difficulty_level != current_difficulty_level:
        current_difficulty_level = new_difficulty_level
        print(f"難易度レベルが {current_difficulty_level} に上昇しました！")

    # 現在の難易度に応じたパラメータ
    current_enemy_speed = get_adjusted_value(enemy_speed_base, current_difficulty_level, increase_rate=1.05)
    current_enemy_spawn_interval = get_adjusted_value(ENEMY_SPAWN_INTERVAL_BASE, current_difficulty_level)
    current_freeroam_enemy_speed = get_adjusted_value(freeroam_enemy_speed_base, current_difficulty_level, increase_rate=1.07)
    current_freeroam_spawn_interval = get_adjusted_value(FREEROAM_ENEMY_SPAWN_INTERVAL_BASE, current_difficulty_level)
    current_elite_shot_cooldown = get_adjusted_value(EliteEnemy().shot_cooldown_base, current_difficulty_level)
    current_barrage_orb_cooldown = get_adjusted_value(BarrageEnemy().orb_spawn_cooldown_base, current_difficulty_level) # 新しいクールダウン
    current_final_boss_cooldown = get_adjusted_value(FinalBoss().shot_cooldown_base, current_difficulty_level)

    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        
    if game_over:
        keys = pygame.key.get_pressed()
        if keys[pygame.K_r]:
            # ゲーム状態を初期化
            player_hp = player_max_hp
            player_x = (SCREEN_WIDTH - player_width) // 2
            player_y = SCREEN_HEIGHT - player_height - 30
            bullets.clear()
            enemies.clear()
            free_roam_enemies.clear()
            explosion_bullets.clear() # ★爆発弾もクリア
            if current_elite_enemy:
                current_elite_enemy = None
            if current_barrage_enemy:
                current_barrage_enemy = None
            if current_final_boss:
                current_final_boss = None
            score = 0
            game_start_time = pygame.time.get_ticks()
            current_difficulty_level = 1
            last_shot_time = 0
            last_enemy_spawn_time = 0
            last_elite_enemy_spawn_time = 0
            last_freeroam_spawn_time = 0
            last_barrage_spawn_time = 0
            game_over = False
        screen.fill(BLACK)
        game_over_text = font.render("GAME OVER", True, WHITE)
        restart_text = font.render("Press 'R' to Restart", True, WHITE)
        final_score_text = font.render(f"Final Score: {score}", True, WHITE)

        text_rect = game_over_text.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2 - 50))
        restart_rect = restart_text.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2 + 0))
        score_rect = final_score_text.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2 + 50))
        
        screen.blit(game_over_text, text_rect)
        screen.blit(restart_text, restart_rect)
        screen.blit(final_score_text, score_rect)
        pygame.display.flip()
        continue

    # プレイヤーの移動処理
    keys = pygame.key.get_pressed()
    if keys[pygame.K_a]:
        player_x -= player_speed
    if keys[pygame.K_d]:
        player_x += player_speed
    if keys[pygame.K_w]:
        player_y -= player_speed
    if keys[pygame.K_s]:
        player_y += player_speed

    player_x = max(0.0, min(player_x, float(SCREEN_WIDTH - player_width)))
    player_y = max(0.0, min(player_y, float(SCREEN_HEIGHT - player_height)))
    player_rect = pygame.Rect(int(player_x), int(player_y), player_width, player_height)


    # スペースキー長押しでの射撃処理
    if keys[pygame.K_SPACE]:
        if current_time - last_shot_time > BULLET_COOLDOWN:
            bullet_x = player_x + (player_width // 2) - (bullet_width // 2)
            bullet_y = player_y
            bullets.append(pygame.Rect(int(bullet_x), int(bullet_y), bullet_width, bullet_height))
            last_shot_time = current_time

    # 弾の移動処理 (プレイヤーの弾)
    for bullet in list(bullets):
        bullet.y -= bullet_speed
        if bullet.y < 0:
            bullets.remove(bullet)

    # 隊列雑魚敵の出現処理
    if current_time - last_enemy_spawn_time > current_enemy_spawn_interval:
        start_x = random.randint(0, SCREEN_WIDTH - (enemy_width + ENEMY_SPACING) * ENEMIES_PER_WAVE)
        for i in range(ENEMIES_PER_WAVE):
            enemy_x = start_x + (enemy_width + ENEMY_SPACING) * i
            enemy_y = -enemy_height 
            enemies.append(Enemy(enemy_x, enemy_y, enemy_width, enemy_height, current_enemy_speed, type="wave"))
        last_enemy_spawn_time = current_time

    # 隊列雑魚敵の移動処理
    for enemy in list(enemies):
        enemy.update()
        if enemy.y > SCREEN_HEIGHT:
            enemies.remove(enemy)

    # エリート敵の出現と更新
    if not current_elite_enemy and current_time - last_elite_enemy_spawn_time > ELITE_ENEMY_SPAWN_INTERVAL_BASE:
        current_elite_enemy = EliteEnemy()
        current_elite_enemy.is_active = True
        last_elite_enemy_spawn_time = current_time

    if current_elite_enemy and current_elite_enemy.is_active:
        current_elite_enemy.update(player_x, player_y, current_elite_shot_cooldown)

    # 自由飛行雑魚敵の出現と更新
    if current_time - last_freeroam_spawn_time > current_freeroam_spawn_interval:
        spawn_x = random.choice([-20, SCREEN_WIDTH + 20])
        spawn_y = random.randint(0, SCREEN_HEIGHT // 3)
        free_roam_enemies.append(FreeRoamEnemy(spawn_x, spawn_y, current_freeroam_enemy_speed))
        last_freeroam_spawn_time = current_time

    for freeroam_enemy in list(free_roam_enemies):
        freeroam_enemy.update(player_x, player_y)
        if freeroam_enemy.y > SCREEN_HEIGHT + freeroam_enemy.height or \
           freeroam_enemy.x < -freeroam_enemy.width or \
           freeroam_enemy.x > SCREEN_WIDTH + freeroam_enemy.width:
            free_roam_enemies.remove(freeroam_enemy)

    # 花火弾幕敵の出現と更新
    if not current_barrage_enemy and current_time - last_barrage_spawn_time > BARRAGE_ENEMY_SPAWN_INTERVAL_BASE:
        current_barrage_enemy = BarrageEnemy()
        current_barrage_enemy.is_active = True
        last_barrage_spawn_time = current_time

    if current_barrage_enemy and current_barrage_enemy.is_active:
        current_barrage_enemy.update(current_barrage_orb_cooldown) # ここでオーブクールダウンを渡す

    # 爆発弾の移動処理
    for exp_bullet in list(explosion_bullets):
        exp_bullet.update()
        if exp_bullet.y > SCREEN_HEIGHT or exp_bullet.x < -exp_bullet.width or exp_bullet.x > SCREEN_WIDTH + exp_bullet.width:
            explosion_bullets.remove(exp_bullet)

    # 最終ボスの出現と更新
    if not current_final_boss and elapsed_game_time > FINAL_BOSS_SPAWN_TIME:
        current_final_boss = FinalBoss()
        current_final_boss.is_active = True

    if current_final_boss and current_final_boss.is_active:
        current_final_boss.update(player_x, player_y, current_final_boss_cooldown)


    # 衝突判定処理 (プレイヤーの弾 vs 敵)
    bullets_to_remove = []
    enemies_to_remove_normal = []
    enemies_to_remove_elite = []
    enemies_to_remove_freeroam = []
    barrage_orbs_to_remove = [] # BarrageOrb用
    # FinalBossの弾丸はプレイヤー弾で消えない

    for bullet in bullets:
        # 隊列雑魚との衝突
        for enemy in enemies:
            if bullet.colliderect(enemy):
                if bullet not in bullets_to_remove:
                    bullets_to_remove.append(bullet)
                if enemy not in enemies_to_remove_normal:
                    enemies_to_remove_normal.append(enemy)
                score += 10
        
        # エリート敵との衝突
        if current_elite_enemy and current_elite_enemy.is_active:
            if bullet.colliderect(current_elite_enemy.rect):
                if bullet not in bullets_to_remove:
                    bullets_to_remove.append(bullet)
                current_elite_enemy.hp -= 10
                score += 5
                if current_elite_enemy.hp <= 0:
                    score += 100
                    print("エリート敵を撃破しました！")
                    current_elite_enemy.is_active = False
                    current_elite_enemy = None
        
        # 自由飛行雑魚との衝突
        for freeroam_enemy in free_roam_enemies:
            if bullet.colliderect(freeroam_enemy):
                if bullet not in bullets_to_remove:
                    bullets_to_remove.append(bullet)
                if freeroam_enemy not in enemies_to_remove_freeroam:
                    enemies_to_remove_freeroam.append(freeroam_enemy)
                score += 15

        # ★BarrageOrbとの衝突
        if current_barrage_enemy and current_barrage_enemy.is_active:
            for orb in current_barrage_enemy.barrage_orbs:
                if bullet.colliderect(orb):
                    if bullet not in bullets_to_remove:
                        bullets_to_remove.append(bullet)
                    orb.hp -= 1 # オーブのHPを減らす
                    score += 5 # ヒットスコア
                    if orb.hp <= 0:
                        if orb not in barrage_orbs_to_remove:
                            barrage_orbs_to_remove.append(orb) # 破壊対象として追加
                            current_barrage_enemy.generate_explosion_bullets(orb.x, orb.y) # 爆発生成
                            score += 20 # オーブ破壊ボーナス
        
        # 花火弾幕敵本体との衝突
        if current_barrage_enemy and current_barrage_enemy.is_active:
            if bullet.colliderect(current_barrage_enemy.rect):
                if bullet not in bullets_to_remove:
                    bullets_to_remove.append(bullet)
                current_barrage_enemy.hp -= 5
                score += 3
                if current_barrage_enemy.hp <= 0:
                    score += 150
                    print("花火弾幕敵を撃破しました！")
                    current_barrage_enemy.is_active = False
                    current_barrage_enemy = None
        
        # 最終ボスとの衝突
        if current_final_boss and current_final_boss.is_active:
            if bullet.colliderect(current_final_boss.rect):
                if bullet not in bullets_to_remove:
                    bullets_to_remove.append(bullet)
                current_final_boss.hp -= 2
                score += 1
                if current_final_boss.hp <= 0:
                    score += 1000
                    print("最終ボスを撃破しました！ゲームクリア！")
                    running = False


    for bullet in bullets_to_remove:
        if bullet in bullets:
            bullets.remove(bullet)
    for enemy in enemies_to_remove_normal:
        if enemy in enemies:
            enemies.remove(enemy)
    for freeroam_enemy in enemies_to_remove_freeroam:
        if freeroam_enemy in free_roam_enemies:
            free_roam_enemies.remove(freeroam_enemy)
    for orb in barrage_orbs_to_remove: # オーブも削除
        if orb in current_barrage_enemy.barrage_orbs:
            current_barrage_enemy.barrage_orbs.remove(orb)


    # プレイヤーへの衝突判定（HPシステム導入）
    if current_time - player_last_hit_time > player_invincibility_duration:
        damage_taken = 0
        # 隊列雑魚
        for enemy in enemies:
            if player_rect.colliderect(enemy):
                damage_taken += 20
                enemies.remove(enemy) # 衝突した雑魚は消滅
                break # 複数に一度に当たらないよう
        
        # エリート敵
        if current_elite_enemy and current_elite_enemy.is_active:
            if player_rect.colliderect(current_elite_enemy.rect):
                damage_taken += 30
                # エリート敵は衝突しても消滅しない
        
            # エリート敵の弾丸
            for e_bullet in list(current_elite_enemy.bullets):
                if player_rect.colliderect(e_bullet):
                    damage_taken += e_bullet.damage # エリート弾のダメージ
                    current_elite_enemy.bullets.remove(e_bullet) # 弾はヒットしたら消える
                    break # 弾丸ループを抜ける

        # 自由飛行雑魚敵
        for freeroam_enemy in free_roam_enemies:
            if player_rect.colliderect(freeroam_enemy):
                damage_taken += 20
                free_roam_enemies.remove(freeroam_enemy) # 衝突した雑魚は消滅
                break # 複数に一度に当たらないよう

        # 花火弾幕敵本体
        if current_barrage_enemy and current_barrage_enemy.is_active:
            if player_rect.colliderect(current_barrage_enemy.rect):
                damage_taken += 30 # 本体衝突ダメージ
        
        # BarrageOrb
        if current_barrage_enemy and current_barrage_enemy.is_active:
            for orb in list(current_barrage_enemy.barrage_orbs):
                if player_rect.colliderect(orb):
                    damage_taken += 15 # オーブ本体ダメージ
                    if orb not in barrage_orbs_to_remove: # 既に爆発リストになければ
                        barrage_orbs_to_remove.append(orb) # 削除対象として追加
                        current_barrage_enemy.generate_explosion_bullets(orb.x, orb.y) # 爆発生成
                    break

        # 爆発弾
        for exp_bullet in list(explosion_bullets):
            if player_rect.colliderect(exp_bullet):
                damage_taken += exp_bullet.damage # 爆発弾のダメージ
                explosion_bullets.remove(exp_bullet) # 弾はヒットしたら消える
                break # 弾丸ループを抜ける
        
        # 最終ボス本体
        if current_final_boss and current_final_boss.is_active:
            if player_rect.colliderect(current_final_boss.rect):
                damage_taken += 50 # 最終ボス本体ダメージ

            # 最終ボスの弾丸
            for fb_bullet in list(current_final_boss.bullets):
                if player_rect.colliderect(fb_bullet):
                    damage_taken += fb_bullet.damage # 最終ボス弾のダメージ
                    current_final_boss.bullets.remove(fb_bullet) # 弾はヒットしたら消える
                    break # 弾丸ループを抜ける


        if damage_taken > 0:
            player_hp -= damage_taken
            player_last_hit_time = current_time
            print(f"ダメージ！HP: {player_hp} (-{damage_taken})")


    # HPチェック
    if player_hp <= 0:
        print("ゲームオーバー！ プレイヤーのHPが0になりました。")
        game_over = True
        running = True

    # 画面を黒で塗りつぶす (背景)
    screen.fill(BLACK)

    # プレイヤーを描画 (無敵時間中は点滅)
    if not (current_time - player_last_hit_time < player_invincibility_duration and (current_time // 100) % 2 == 0):
        pygame.draw.rect(screen, WHITE, player_rect)

    # 弾を描画 (プレイヤーの弾)
    for bullet in bullets:
        pygame.draw.rect(screen, WHITE, bullet)
    
    # 隊列雑魚敵を描画
    for enemy in enemies:
        pygame.draw.rect(screen, RED, enemy)

    # エリート敵とエリート敵の弾丸を描画
    if current_elite_enemy and current_elite_enemy.is_active:
        current_elite_enemy.draw(screen)
        for e_bullet in current_elite_enemy.bullets:
            e_bullet.draw(screen)

    # 自由飛行雑魚敵を描画
    for freeroam_enemy in free_roam_enemies:
        pygame.draw.rect(screen, CYAN, freeroam_enemy)

    # 花火弾幕敵とBarrageOrbを描画
    if current_barrage_enemy and current_barrage_enemy.is_active:
        current_barrage_enemy.draw(screen)
        for orb in current_barrage_enemy.barrage_orbs:
            orb.draw(screen) # オーブを描画
    
    # 爆発弾を描画
    for exp_bullet in explosion_bullets:
        exp_bullet.draw(screen)

    # 最終ボスと最終ボスの弾丸を描画
    if current_final_boss and current_final_boss.is_active:
        current_final_boss.draw(screen)
        for fb_bullet in current_final_boss.bullets:
            fb_bullet.draw(screen)

    # スコアを描画
    score_text = font.render(f"Score: {score}", True, WHITE)
    screen.blit(score_text, (10, 10))

    # プレイヤーHPバーを描画
    hp_bar_x = SCREEN_WIDTH - 160
    hp_bar_y = 10
    hp_bar_width = 150
    hp_bar_height = 20
    hp_ratio = max(0, player_hp / player_max_hp) # HPがマイナスにならないよう
    pygame.draw.rect(screen, RED, (hp_bar_x, hp_bar_y, hp_bar_width, hp_bar_height))
    pygame.draw.rect(screen, GREEN, (hp_bar_x, hp_bar_y, hp_bar_width * hp_ratio, hp_bar_height))
    hp_text = font.render(f"HP: {player_hp}/{player_max_hp}", True, WHITE)
    screen.blit(hp_text, (hp_bar_x + 5, hp_bar_y + 2))

    # 難易度レベル表示
    difficulty_text = font.render(f"Difficulty: {current_difficulty_level}", True, WHITE)
    screen.blit(difficulty_text, (10, 40))


    # 画面を更新
    pygame.display.flip()

# Pygameの終了
pygame.quit()