// Частицы и эффекты: кровь, гильзы, вспышки, цифры урона
(function () {
  // Следы взрывов на земле — рисуются ОТДЕЛЬНО от карты и исчезают через 7 сек
  const scorches = [];
  const SCORCH_LIFE = 7;

  function updateScorches(dt) {
    for (let i = scorches.length - 1; i >= 0; i--) {
      scorches[i].life -= dt;
      if (scorches[i].life <= 0) scorches.splice(i, 1);
    }
  }

  function drawScorches(g) {
    for (const s of scorches) {
      const a = clamp(s.life / s.maxLife, 0, 1) * s.alpha;
      g.globalAlpha = a;
      g.fillStyle = s.color;
      g.beginPath();
      g.ellipse(s.x, s.y, s.rx, s.ry, s.rot, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = s.rim;
      g.lineWidth = 3;
      g.stroke();
      g.globalAlpha = 1;
    }
  }

  function addScorch(x, y, rx, ry, rot, color, alpha, rim) {
    if (scorches.length > 120) scorches.shift();
    scorches.push({
      x, y, rx, ry, rot,
      color: color || 'rgba(30,24,16,0.5)',
      rim: rim || 'rgba(18,12,8,0.5)',
      alpha: alpha !== undefined ? alpha : 0.5,
      life: SCORCH_LIFE,
      maxLife: SCORCH_LIFE
    });
  }

  function Pool() {
    this.list = [];
  }
  Pool.prototype.spawn = function (p) {
    if (this.list.length > 420) this.list.shift();
    this.list.push(p);
  };
  Pool.prototype.update = function (dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { this.list.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(p.friction, dt * 60);
      p.vy *= Math.pow(p.friction, dt * 60);
      if (p.rot !== undefined) p.rot += p.vr * dt;
    }
  };
  Pool.prototype.draw = function (g) {
    for (const p of this.list) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      if (p.fn) { p.fn(g, a, p); continue; }
      g.globalAlpha = a * (p.alpha !== undefined ? p.alpha : 1);
      g.fillStyle = p.color;
      if (p.rot !== undefined) {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        g.restore();
      } else {
        g.beginPath();
        g.arc(p.x, p.y, Math.max(0.5, p.size * a), 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }
  };

  const pool = new Pool();

  function blood(x, y, dirAngle, count) {
    for (let i = 0; i < count; i++) {
      const spread = dirAngle + rand(-0.6, 0.6);
      const sp = rand(30, 160);
      pool.spawn({
        x, y,
        vx: Math.cos(spread) * sp, vy: Math.sin(spread) * sp,
        life: rand(0.3, 0.7), maxLife: 0.7,
        friction: 0.82, size: rand(1.5, 4),
        color: Math.random() < 0.6 ? 'rgb(150,18,14)' : 'rgb(96,8,6)', alpha: 0.9
      });
    }
  }

  function gibs(x, y, dirAngle) {
    for (let i = 0; i < 8; i++) {
      const spread = dirAngle + rand(-1.2, 1.2);
      pool.spawn({
        x, y,
        vx: Math.cos(spread) * rand(40, 170), vy: Math.sin(spread) * rand(40, 170),
        life: rand(0.5, 1.1), maxLife: 1.1,
        friction: 0.85, size: rand(2, 5),
        color: 'rgb(120,20,12)', alpha: 0.95,
        rot: rand(0, 6), vr: rand(-8, 8)
      });
    }
  }

  function casing(x, y, dirAngle) {
    pool.spawn({
      x, y,
      vx: Math.cos(dirAngle) * 260 + rand(-40, 40),
      vy: Math.sin(dirAngle) * 260 + rand(-40, 40),
      life: 0.9, maxLife: 0.9,
      friction: 0.88, size: 5,
      color: '#c99a3c', alpha: 0.9,
      rot: rand(0, 6), vr: rand(-20, 20)
    });
  }

  function muzzleFlash(x, y, angle) {
    for (let i = 0; i < 3; i++) {
      const spread = angle + rand(-0.35, 0.35);
      pool.spawn({
        x: x + Math.cos(angle) * 12, y: y + Math.sin(angle) * 12,
        vx: Math.cos(spread) * rand(240, 380), vy: Math.sin(spread) * rand(240, 380),
        life: rand(0.06, 0.12), maxLife: 0.12,
        friction: 0.6, size: rand(2, 3.5), color: '#ffd76a', alpha: 1
      });
    }
    pool.spawn({
      x, y, vx: 0, vy: 0,
      life: 0.06, maxLife: 0.06,
      friction: 1, size: rand(14, 20), color: '#ffb52e', alpha: 0.9
    });
    pool.spawn({
      x, y, vx: 0, vy: 0,
      life: 0.05, maxLife: 0.05,
      friction: 1, size: rand(8, 11), color: '#fff3b0', alpha: 1
    });
  }

  function floatingText(x, y, text, color, size) {
    pool.spawn({
      x, y, vx: 0, vy: -34,
      life: 0.9, maxLife: 0.9,
      friction: 0.9, size: size || 15,
      color: color || '#ffd76a', alpha: 1,
      text,
      fn: function (g, a, p) {
        const grow = 1 + (1 - a) * 0.4;
        g.globalAlpha = a;
        g.font = 'bold ' + Math.round(p.size * grow) + 'px Consolas, monospace';
        g.textAlign = 'center';
        g.strokeStyle = 'rgba(0,0,0,0.8)';
        g.lineWidth = 3;
        g.strokeText(p.text, p.x, p.y);
        g.fillStyle = p.color;
        g.fillText(p.text, p.x, p.y);
        g.globalAlpha = 1;
      }
    });
  }

  function hitMarker(x, y) {
    pool.spawn({
      x, y, vx: 0, vy: -40,
      life: 0.4, maxLife: 0.4,
      friction: 0.9, size: 10,
      color: '#ffffff', alpha: 1,
      fn: function (g, a, p) {
        g.globalAlpha = a;
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        const s = p.size;
        g.beginPath();
        g.moveTo(p.x - s, p.y - s); g.lineTo(p.x - s * 0.35, p.y - s * 0.35);
        g.moveTo(p.x - s, p.y + s); g.lineTo(p.x - s * 0.35, p.y + s * 0.35);
        g.moveTo(p.x + s, p.y - s); g.lineTo(p.x + s * 0.35, p.y - s * 0.35);
        g.moveTo(p.x + s, p.y + s); g.lineTo(p.x + s * 0.35, p.y + s * 0.35);
        g.stroke();
        g.globalAlpha = 1;
      }
    });
  }

  function smoke(x, y) {
    pool.spawn({
      x, y,
      vx: rand(-12, 12), vy: rand(-18, -6),
      life: 0.7, maxLife: 0.7,
      friction: 0.94, size: rand(4, 7),
      color: 'rgba(60,60,55,0.5)', alpha: 0.5
    });
  }

  // Реалистичная лужа крови, остаётся на карте навсегда (впекается в фоновое полотно)
  function bloodPool(x, y, radius, count) {
    const burn = Game.assets.mapCache.getContext('2d');
    const n = count || 24;

    // Центральный блоб — много пересекающихся эллипсов неправильной формы
    for (let i = 0; i < n; i++) {
      const t = rand(0, Math.PI * 2);
      const d = Math.pow(Math.random(), 1.7) * radius * 0.7;
      const rr = rand(radius * 0.16, radius * 0.4);
      const roll = Math.random();
      // Внутренняя часть — свежая яркая, края — подсохшая тёмная
      if (roll < 0.3) {
        burn.fillStyle = 'rgba(' + randInt(140, 175) + ',' + randInt(8, 18) + ',' + randInt(6, 12) + ',' + rand(0.6, 0.8) + ')';
      } else {
        burn.fillStyle = 'rgba(' + randInt(60, 100) + ',' + randInt(6, 14) + ',' + randInt(4, 10) + ',' + rand(0.4, 0.6) + ')';
      }
      burn.beginPath();
      burn.ellipse(
        x + Math.cos(t) * d, y + Math.sin(t) * d,
        rr * rand(0.7, 1.3), rr * rand(0.55, 0.9),
        rand(0, Math.PI), 0, Math.PI * 2
      );
      burn.fill();
    }

    // Тёмная влажная кайма — очертание лужи
    burn.strokeStyle = 'rgba(25,3,2,0.5)';
    burn.lineWidth = 3;
    burn.beginPath();
    burn.ellipse(x, y, radius * 0.85, radius * 0.62, rand(0, Math.PI), 0, Math.PI * 2);
    burn.stroke();

    // Брызги-капли во все стороны
    for (let i = 0; i < 8; i++) {
      const a = rand(0, Math.PI * 2);
      const dd = rand(radius * 0.7, radius * 1.7);
      burn.fillStyle = 'rgba(' + randInt(90, 125) + ',' + randInt(8, 16) + ',' + randInt(6, 12) + ',' + rand(0.35, 0.6) + ')';
      burn.beginPath();
      burn.arc(x + Math.cos(a) * dd, y + Math.sin(a) * dd, rand(1.5, 4), 0, Math.PI * 2);
      burn.fill();
    }

    // Пара длинных "дорожек" — как будто волочили тело
    for (let i = 0; i < 3; i++) {
      const a = rand(0, Math.PI * 2);
      const len = rand(radius * 0.8, radius * 1.6);
      burn.strokeStyle = 'rgba(' + randInt(80, 110) + ',' + randInt(8, 14) + ',' + randInt(6, 10) + ',' + rand(0.3, 0.5) + ')';
      burn.lineWidth = rand(2, 5);
      burn.lineCap = 'round';
      burn.beginPath();
      burn.moveTo(x, y);
      burn.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      burn.stroke();
    }
  }

  // Взрыв гранаты: огненный шар, искры, дым, ударная волна, гарь на земле
  function explosion(x, y) {
    // Яркая вспышка
    pool.spawn({ x, y, vx: 0, vy: 0, life: 0.09, maxLife: 0.09, friction: 1, size: 46, color: '#ffffff', alpha: 1 });
    pool.spawn({ x, y, vx: 0, vy: 0, life: 0.14, maxLife: 0.14, friction: 1, size: 34, color: '#ffe29a', alpha: 1 });
    pool.spawn({ x, y, vx: 0, vy: 0, life: 0.2, maxLife: 0.2, friction: 1, size: 24, color: '#ff9020', alpha: 1 });

    // Расширяющаяся ударная волна
    pool.spawn({
      x, y, vx: 0, vy: 0, life: 0.45, maxLife: 0.45, friction: 1, size: 190,
      color: '', alpha: 1,
      fn: function (g, a, p) {
        const rA = 1 - a;
        const rr = p.size * rA * rA;
        g.globalAlpha = a * 0.5;
        g.strokeStyle = 'rgba(255,200,120,0.9)';
        g.lineWidth = 6 * (0.4 + a);
        g.beginPath();
        g.arc(p.x, p.y, rr, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
    });

    // Огненные частицы
    for (let i = 0; i < 34; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(60, 360);
      const roll = Math.random();
      pool.spawn({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.25, 0.6), maxLife: 0.6,
        friction: 0.82, size: rand(4, 9),
        color: roll < 0.4 ? '#ffefb0' : roll < 0.7 ? '#ff9420' : '#ff5a10', alpha: 0.95
      });
    }

    // Искры
    for (let i = 0; i < 18; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(220, 520);
      pool.spawn({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.2, 0.5), maxLife: 0.5,
        friction: 0.7, size: rand(1.5, 3),
        color: '#fff3b0', alpha: 1
      });
    }

    // Дым
    for (let i = 0; i < 16; i++) {
      const a = rand(0, Math.PI * 2);
      pool.spawn({
        x: x + Math.cos(a) * rand(0, 26), y: y + Math.sin(a) * rand(0, 26),
        vx: Math.cos(a) * rand(30, 120), vy: Math.sin(a) * rand(30, 120) - 30,
        life: rand(0.7, 1.4), maxLife: 1.4,
        friction: 0.94, size: rand(10, 22),
        color: 'rgba(40,40,38,0.55)', alpha: 0.55
      });
    }

    // Гарь на земле — след, который исчезает через 7 секунд
    for (let i = 0; i < 12; i++) {
      const a = rand(0, Math.PI * 2);
      const d = Math.pow(Math.random(), 1.6) * 110;
      const rr = rand(9, 26);
      addScorch(
        x + Math.cos(a) * d, y + Math.sin(a) * d,
        rr, rr * rand(0.6, 1), rand(0, Math.PI),
        'rgba(' + randInt(20, 42) + ',' + randInt(16, 30) + ',' + randInt(10, 22) + ',0.55)',
        0.55
      );
    }
    // Тёмная обугленная кайма по центру взрыва
    addScorch(x, y, 112, 84, rand(0, Math.PI), 'rgba(15,10,7,0.45)', 0.7, 'rgba(18,12,8,0.55)');
  }

  function resetEffects() {
    scorches.length = 0;
    pool.list.length = 0;
  }

  Game.effects = {
    pool,
    blood, gibs, casing, muzzleFlash, bloodPool, explosion,
    floatingText, hitMarker, smoke,
    updateScorches, drawScorches, resetEffects
  };
})();