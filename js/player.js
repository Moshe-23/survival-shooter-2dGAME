// Игрок: фигура в чёрном плаще с капюшоном, лицо скрыто тьмой.
// Все рисуется процедурно (кроме дробовика из assets).
(function () {
  const RADIUS = 22;
  const SPEED = 250;
  const MAX_HP = 100;
  const MAX_AMMO = 6;
  const RELOAD_TIME = 1.45;
  const FIRE_CD = 0.5;

  const CLOAK = '#0b0b0d';
  const CLOAK_DARK = '#050506';
  const CLOAK_EDGE = '#1c1c20';

  function Player(spawnX, spawnY) {
    this.x = spawnX;
    this.y = spawnY;
    this.radius = RADIUS;
    this.hp = MAX_HP;
    this.maxHp = MAX_HP;
    this.aim = 0;
    this.bodyAngle = 0;
    this.moveAngle = 0;
    this.vx = 0;
    this.vy = 0;
    this.moving = false;
    this.walkPhase = 0;
    this.ammo = MAX_AMMO;
    this.reloadTimer = 0;
    this.reloading = false;
    this.fireCd = 0;
    this.recoil = 0;
    this.invuln = 0;
    this.contactCd = 0;
    this.kills = 0;
    this.alive = true;
    this.chestOffset = 0;
  }

  Player.prototype.update = function (dt, state) {
    if (!this.alive) return;

    const input = state.input;
    let ix = 0, iy = 0;
    if (input.keys['KeyW']) iy -= 1;
    if (input.keys['KeyS']) iy += 1;
    if (input.keys['KeyA']) ix -= 1;
    if (input.keys['KeyD']) ix += 1;
    const len = Math.hypot(ix, iy);
    this.moving = len > 0;
    if (this.moving) {
      ix /= len; iy /= len;
      this.moveAngle = Math.atan2(iy, ix);
    }

    this.x += ix * SPEED * dt;
    this.y += iy * SPEED * dt;

    // За края карты можно выйти (там начинается следующая зона мира)

    // Глаза — прицел
    this.aim = angleTo(this.x, this.y, input.mx, input.my);
    // Корпус плавно поворачивается к прицелу
    this.bodyAngle = angleLerp(this.bodyAngle, this.aim, clamp(12 * dt, 0, 1));

    // Анимация ходьбы
    this.walkPhase += (this.moving ? SPEED : 0) * dt * 0.07;
    this.chestOffset = Math.sin(this.walkPhase * 2) * 1.2;

    // Звук ходьбы: включается во время движения, тихо гаснет при остановке
    Game.audio.setWalking(this.moving);

    // Стрельба
    this.fireCd -= dt;
    if (input.mouseDown && this.fireCd <= 0 && this.ammo > 0 && !this.reloading) {
      this.shoot(state);
    }

    // Перезарядка
    this.updateReload(dt);
    if (input.reloadPressed && !this.reloading && this.ammo < MAX_AMMO) {
      this.reloading = true;
      this.reloadTimer = RELOAD_TIME;
      Game.audio.reload();
    }

    // Авто-перезарядка при пустом магазине
    if (this.ammo <= 0 && !this.reloading) {
      this.reloading = true;
      this.reloadTimer = RELOAD_TIME;
      Game.audio.reload();
    }

    // Отдача затухает
    this.recoil *= Math.pow(0.001, dt);
    this.invuln -= dt;
    this.contactCd -= dt;
  };

  Player.prototype.updateReload = function (dt) {
    if (!this.reloading) return;
    this.reloadTimer -= dt;
    if (this.reloadTimer <= 0) {
      this.reloading = false;
      this.ammo = MAX_AMMO;
    }
  };

  Player.prototype.shoot = function (state) {
    this.ammo--;
    this.fireCd = FIRE_CD;
    this.recoil = 1;

    Game.audio.shoot();
    Game.effects.casing(
      this.x + Math.cos(this.aim) * 20 + Math.cos(this.aim + Math.PI / 2) * 26,
      this.y + Math.sin(this.aim) * 20 + Math.sin(this.aim + Math.PI / 2) * 26,
      this.aim + Math.PI / 2 + rand(-0.3, 0.3)
    );

    const M = this.x + Math.cos(this.aim) * 58;
    const N = this.y + Math.sin(this.aim) * 58;
    Game.effects.muzzleFlash(M, N, this.aim);

    // 6 дробин с разлётом
    const damage = 6;
    for (let i = 0; i < 6; i++) {
      const spread = this.aim + rand(-0.12, 0.12) * (1 + this.recoil * 0.6);
      const sp = 760 + rand(-60, 60);
      state.bullets.push({
        x: M, y: N,
        vx: Math.cos(spread) * sp, vy: Math.sin(spread) * sp,
        life: 0.55, damage: damage,
        used: false
      });
    }
    Game.shake(7);
  };

  Player.prototype.takeHit = function (dmg) {
    if (this.invuln > 0) return;
    this.hp -= dmg;
    this.invuln = 0.7;
    this.contactCd = 0.9;
    Game.audio.setWalking(false);
    Game.audio.bite();
    Game.shake(5);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      Game.audio.setWalking(false);
    }
  };

  // ---- ОТРИСОВКА ----
  Player.prototype.draw = function (g, dt) {
    const x = this.x, y = this.y;
    const a = this.aim;

    // Тень
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(x + 3, y + 5, this.radius + 6, this.radius + 3, 0, 0, Math.PI * 2);
    g.fill();

    // Персонаж из картинки «гг» — биллборд, как зомби
    const heroImg = Game.assets.hero;
    const heroCrop = Game.assets.heroCrop;
    if (heroImg && heroCrop) {
      const S = this.radius * 2.9;
      const sc = S / Math.max(heroCrop.w, heroCrop.h);
      const w = heroCrop.w * sc, h = heroCrop.h * sc;
      const bob = this.moving ? Math.abs(Math.sin(this.walkPhase)) * 2.5 : 0;
      const roll = this.moving ? Math.sin(this.walkPhase * 2) * 0.05 : 0;

      g.save();
      g.translate(x, y);
      g.rotate(roll);
      g.drawImage(heroImg, heroCrop.x, heroCrop.y, heroCrop.w, heroCrop.h, -w / 2, -h / 2 - bob, w, h);
      g.restore();

      // Дробовик — туда, куда целимся (поверх спрайта)
      g.save();
      g.translate(x, y);
      g.rotate(this.bodyAngle);
      this.drawShotgun(g);
      g.restore();
    } else {
      // Запасной вид: чёрный плащ с капюшоном (если картинка не загрузилась)
      this.drawBoots(g, x, y);
      g.save();
      g.translate(x, y);
      g.rotate(this.bodyAngle);
      this.drawTorso(g, this.chestOffset);
      this.drawShotgun(g);
      g.restore();
      g.save();
      g.translate(x + Math.cos(this.bodyAngle) * 2, y + Math.sin(this.bodyAngle) * 2);
      g.rotate(this.aim);
      this.drawHead(g);
      g.restore();
    }

    // Мигание при уроне
    if (this.invuln > 0 && Math.floor(this.invuln * 14) % 2 === 0) {
      g.strokeStyle = 'rgba(255,60,40,0.7)';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(x, y, this.radius + 5, 0, Math.PI * 2);
      g.stroke();
    }
  };

  Player.prototype.drawBoots = function (g, x, y) {
    const step = this.moving ? Math.sin(this.walkPhase) : 0;
    const px = Math.cos(this.moveAngle + Math.PI / 2) * 9;
    const py = Math.sin(this.moveAngle + Math.PI / 2) * 9;
    for (let s = -1; s <= 1; s += 2) {
      const back = s * step * 6;
      g.save();
      g.translate(x + px * s, y + py * s + back * 0.5);
      g.rotate(this.moveAngle);
      g.fillStyle = '#08080a';
      g.beginPath();
      g.ellipse(0, 4, 4.5, 7, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#131316';
      g.beginPath();
      g.ellipse(-1, 10, 4.5, 4, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  };

  Player.prototype.drawTorso = function (g, chestOffset) {
    // Плащ: широкие ниспадающие плечи, почти чёрный силуэт
    g.save();
    const blade = g.createLinearGradient(-chestOffset - 16, -14, -chestOffset - 8, 14);
    blade.addColorStop(0, CLOAK_EDGE);
    blade.addColorStop(1, CLOAK);
    g.fillStyle = blade;
    g.beginPath();
    g.ellipse(-chestOffset - 14, 0, 5, 15, 0, 0, Math.PI * 2);
    g.fill();

    const blade2 = g.createLinearGradient(chestOffset + 8, -14, chestOffset + 16, 14);
    blade2.addColorStop(0, CLOAK_EDGE);
    blade2.addColorStop(1, CLOAK);
    g.fillStyle = blade2;
    g.beginPath();
    g.ellipse(chestOffset + 14, 0, 5, 15, 0, 0, Math.PI * 2);
    g.fill();

    const body = g.createLinearGradient(-chestOffset, -13, -chestOffset, 13);
    body.addColorStop(0, '#141416');
    body.addColorStop(0.55, CLOAK);
    body.addColorStop(1, CLOAK_DARK);
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(-chestOffset, 0, 16, 16, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = CLOAK_EDGE;
    g.stroke();

    // Полы плаща — тёмные лоскуты по бокам
    g.fillStyle = CLOAK_DARK;
    g.beginPath();
    g.moveTo(-chestOffset - 13, -6);
    g.quadraticCurveTo(-chestOffset - 24, 2, -chestOffset - 18, 16);
    g.quadraticCurveTo(-chestOffset - 6, 14, -chestOffset, 12);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(chestOffset + 13, -6);
    g.quadraticCurveTo(chestOffset + 24, 2, chestOffset + 18, 16);
    g.quadraticCurveTo(chestOffset + 6, 14, chestOffset, 12);
    g.closePath();
    g.fill();

    // Слабое свечение шва на груди
    g.strokeStyle = 'rgba(70,70,80,0.5)';
    g.lineWidth = 1.5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-chestOffset, 10);
    g.lineTo(-chestOffset, -6);
    g.stroke();
    g.restore();
  };

  Player.prototype.drawShotgun = function (g) {
    const img = Game.assets.shotgun;
    if (!img) return;

    const crop = Game.assets.shotgunCrop || { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
    const W = 92;
    const H = W * (crop.h / crop.w || 0.4);

    if (this.reloading) {
      // Во время перезарядки держим ствол наклонённым вниз
      g.rotate(0.35);
    }
    // Отдача: ствол уходит назад
    const rx = -this.recoil * 14;

    const pivotX = W * 0.42; // точка хвата (немного ближе к центру после обрезки)
    g.save();
    g.translate(rx, 0);
    if (this.recoil > 0.15) g.rotate(-this.recoil * 0.08);
    g.drawImage(img, crop.x, crop.y, crop.w, crop.h, -pivotX, -H / 2, W, H);
    g.restore();

    // Блик на стволе
    g.strokeStyle = 'rgba(255,255,255,0.14)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(W - pivotX - 30, -H / 2 + 6);
    g.lineTo(W - pivotX - 2, -H / 2 + 6);
    g.stroke();
  };

  Player.prototype.drawHead = function (g) {
    const r = 13;

    // Капюшон — тёмный объёмный конус
    const hood = g.createRadialGradient(-r * 0.35, -r * 0.45, 2, 0, 0, r + 2);
    hood.addColorStop(0, '#19191d');
    hood.addColorStop(0.6, CLOAK);
    hood.addColorStop(1, '#020203');
    g.fillStyle = hood;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = CLOAK_EDGE;
    g.stroke();

    // Передний край капюшона — чуть светлее, чтобы был виден объём
    g.strokeStyle = 'rgba(52,52,58,0.8)';
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(r * 0.1, 0, r * 0.94, -Math.PI / 2.2, Math.PI / 2.2);
    g.stroke();

    // Лицо — чернота без черт (глубокий провал капюшона)
    const face = g.createRadialGradient(r * 0.2, 0, 1, r * 0.15, 0, r * 0.8);
    face.addColorStop(0, '#000000');
    face.addColorStop(1, '#020203');
    g.fillStyle = face;
    g.beginPath();
    g.ellipse(r * 0.15, 0, r * 0.78, r * 0.78, 0, 0, Math.PI * 2);
    g.fill();

    // Лёгкое свечение из-под капюшона — только контур, лицо остаётся тьмой
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(r * 0.15, 0, r * 0.78, r * 0.78, 0, 0.15, Math.PI - 0.15);
    g.stroke();
  };

  // Портрет для инвентаря: картинка персонажа, если загружена
  Player.prototype.drawPortrait = function (canvas, size) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2 + size * 0.04;

    // Свечение позади
    const glow = g.createRadialGradient(cx, cy, 2, cx, cy, size * 0.48);
    glow.addColorStop(0, 'rgba(120,120,140,0.16)');
    glow.addColorStop(1, 'rgba(120,120,140,0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(cx, cy, size * 0.48, 0, Math.PI * 2);
    g.fill();

    // Картинка «гг»
    const heroImg = Game.assets.hero;
    const heroCrop = Game.assets.heroCrop;
    if (heroImg && heroCrop) {
      const maxDim = size * 0.8;
      const sc = maxDim / Math.max(heroCrop.w, heroCrop.h);
      const w = heroCrop.w * sc, h = heroCrop.h * sc;
      g.drawImage(heroImg, heroCrop.x, heroCrop.y, heroCrop.w, heroCrop.h,
        (size - w) / 2, (size - h) / 2, w, h);
      return;
    }

    // Запасной портрет: фигура в плаще анфас (если картинки нет)
    const s = size / 96; // масштаб: персонаж высотой ~90px в портрете

    g.save();
    g.translate(cx, cy);
    g.scale(s, s);

    // Капюшон (сзади — спина плаща)
    const backHood = g.createLinearGradient(0, -52, 0, -16);
    backHood.addColorStop(0, '#141417');
    backHood.addColorStop(1, CLOAK);
    g.fillStyle = backHood;
    g.beginPath();
    g.moveTo(-24, -10);
    g.quadraticCurveTo(-30, -44, -4, -52);
    g.quadraticCurveTo(24, -52, 28, -30);
    g.quadraticCurveTo(32, -6, 26, -10);
    g.closePath();
    g.fill();

    // Плечи плаща
    const sh = g.createLinearGradient(0, -20, 0, 30);
    sh.addColorStop(0, '#18181b');
    sh.addColorStop(0.5, CLOAK);
    sh.addColorStop(1, CLOAK_DARK);
    g.fillStyle = sh;
    g.beginPath();
    g.ellipse(0, 6, 30, 26, 0, 0, Math.PI * 2);
    g.fill();

    // Полы плаща по бокам
    g.fillStyle = CLOAK_DARK;
    g.beginPath();
    g.moveTo(-26, -8);
    g.quadraticCurveTo(-42, 8, -34, 32);
    g.quadraticCurveTo(-14, 30, -6, 26);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(26, -8);
    g.quadraticCurveTo(42, 8, 34, 32);
    g.quadraticCurveTo(14, 30, 6, 26);
    g.closePath();
    g.fill();

    // Лоскут-накидка за плечами
    const back = g.createLinearGradient(0, -14, 0, 8);
    back.addColorStop(0, '#101013');
    back.addColorStop(1, CLOAK);
    g.fillStyle = back;
    g.beginPath();
    g.ellipse(-2, -2, 20, 18, 0.1, 0, Math.PI * 2);
    g.fill();

    // Голова в капюшоне
    g.save();
    g.translate(0, -32);
    const hd = g.createRadialGradient(-3, -5, 2, 0, 0, 16);
    hd.addColorStop(0, '#1c1c20');
    hd.addColorStop(0.6, CLOAK);
    hd.addColorStop(1, '#010102');
    g.fillStyle = hd;
    g.beginPath();
    g.arc(0, 0, 15, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(56,56,62,0.9)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(1, 0, 14, -Math.PI / 2.2, Math.PI / 2.2);
    g.stroke();
    // Лицо — чёрная пустота
    g.fillStyle = '#000000';
    g.beginPath();
    g.ellipse(1, 0, 11, 11, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();

    g.restore();
  };

  Game.Player = Player;
})();