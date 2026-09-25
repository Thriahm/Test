/* Undercover — jeu d'ambiance à jouer sur un seul téléphone.
   Règle fixe : 1 Undercover, 0 Mr White. Les paires de mots sont fournies
   par words.js (window.UNDERCOVER_THEMES). */

(function () {
  "use strict";

  var THEMES = (Array.isArray(window.UNDERCOVER_THEMES) ? window.UNDERCOVER_THEMES : [])
    .filter(function (t) { return t && t.id && Array.isArray(t.pairs) && t.pairs.length; });

  var MIN_PLAYERS = 3;
  var MAX_PLAYERS = 8;
  var DEFAULT_PLAYERS = 4;
  var POINTS_CIVIL = 2;
  var POINTS_UNDERCOVER = 10;
  var DEFAULT_ACCENT = "#8b7bff";
  var COLORS = ["#ff6b6b", "#4dabf7", "#ffd43b", "#69db7c", "#da77f2", "#ff922b", "#38d9a9", "#f783ac"];

  var KEYS = {
    settings: "undercover:settings",
    game: "undercover:game",
    scores: "undercover:scores",
    used: "undercover:used"
  };

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- Stockage local ---------- */

  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* stockage indisponible */ }
  }

  function drop(key) {
    try { localStorage.removeItem(key); } catch (e) { /* stockage indisponible */ }
  }

  /* ---------- Utilitaires ---------- */

  // Entier aléatoire dans [0, n[, sans biais de modulo.
  function randomInt(n) {
    if (window.crypto && crypto.getRandomValues) {
      var buf = new Uint32Array(1);
      var limit = Math.floor(0x100000000 / n) * n;
      do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
      return buf[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  function themeById(id) {
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
    return null;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function fill(parent, child) {
    parent.textContent = "";
    parent.appendChild(child);
  }

  function avatar(name, seat, extraClass) {
    var node = el("span", "avatar" + (extraClass ? " " + extraClass : ""));
    node.style.setProperty("--c", COLORS[seat % COLORS.length]);
    node.textContent = initial(name) || String(seat + 1);
    node.setAttribute("aria-hidden", "true");
    return node;
  }

  function initial(name) {
    var chars = Array.from(String(name || "").trim());
    return chars.length ? chars[0].toUpperCase() : "";
  }

  function plural(n, one, many) { return n + " " + (n > 1 ? many : one); }

  var toastTimer = null;
  function toast(message) {
    var node = $("toast");
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.hidden = true; }, 2200);
  }

  function buzz(pattern) {
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* ignoré */ } }
  }

  /* ---------- État ---------- */

  var stored = load(KEYS.settings, null) || {};
  var settings = {
    names: Array.isArray(stored.names) ? stored.names.map(String) : [],
    count: clamp(parseInt(stored.count, 10) || DEFAULT_PLAYERS, MIN_PLAYERS, MAX_PLAYERS),
    // Première visite : tous les thèmes sont cochés.
    themes: Array.isArray(stored.themes) ? stored.themes.filter(themeById) : THEMES.map(function (t) { return t.id; })
  };

  var scores = load(KEYS.scores, {}) || {};
  var game = restoreGame();
  var voteChoice = null;

  function saveSettings() { save(KEYS.settings, settings); }
  function saveGame() { if (game) save(KEYS.game, game); else drop(KEYS.game); }

  function restoreGame() {
    var g = load(KEYS.game, null);
    if (!g || !Array.isArray(g.players) || g.players.length < MIN_PLAYERS || !g.phase) return null;
    // Ne jamais réafficher un mot après un rechargement : on repasse par l'écran « passe le téléphone ».
    if (g.phase === "reveal") g.phase = "pass";
    if (g.peek != null && g.phase === "pass") { g.peek = null; g.phase = "discuss"; }
    return g;
  }

  function wordOf(player) { return player.role === "undercover" ? game.underWord : game.civilWord; }
  function alivePlayers() { return game.players.filter(function (p) { return p.alive; }); }

  /* ---------- Garder l'écran allumé pendant la partie ---------- */

  var wakeLock = null;
  function keepAwake(on) {
    if (!("wakeLock" in navigator)) return;
    if (on && !wakeLock && document.visibilityState === "visible") {
      navigator.wakeLock.request("screen").then(function (lock) {
        wakeLock = lock;
        lock.addEventListener("release", function () { wakeLock = null; });
      }).catch(function () { /* refusé : sans importance */ });
    } else if (!on && wakeLock) {
      wakeLock.release().catch(function () {});
      wakeLock = null;
    }
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      if (game) keepAwake(true);
    } else if (game && game.phase === "reveal") {
      // Téléphone verrouillé ou appli quittée pendant qu'un mot est affiché : on le cache.
      game.phase = "pass";
      saveGame();
      render();
    }
  });

  /* ---------- Préparation ---------- */

  function renderSetup() {
    renderPlayerInputs();
    renderThemes();
    renderScoreboard($("setup-scores"), Object.keys(scores));
    $("scores-panel").hidden = !Object.keys(scores).length;
  }

  function renderPlayerInputs() {
    var list = $("player-list");
    list.textContent = "";
    for (var i = 0; i < settings.count; i++) {
      var li = el("li", "player-row");
      var input = el("input");
      input.type = "text";
      input.maxLength = 16;
      input.autocomplete = "off";
      input.spellcheck = false;
      input.enterKeyHint = i === settings.count - 1 ? "done" : "next";
      input.placeholder = "Joueur " + (i + 1);
      input.value = settings.names[i] || "";
      input.dataset.index = String(i);
      input.setAttribute("aria-label", "Prénom du joueur " + (i + 1));
      li.appendChild(avatar(input.value, i));
      li.appendChild(input);
      list.appendChild(li);
    }
    $("players-count").textContent = String(settings.count);
    $("players-minus").disabled = settings.count <= MIN_PLAYERS;
    $("players-plus").disabled = settings.count >= MAX_PLAYERS;
  }

  $("player-list").addEventListener("input", function (e) {
    var input = e.target;
    if (!input.dataset || input.dataset.index == null) return;
    var i = Number(input.dataset.index);
    settings.names[i] = input.value;
    var badge = input.parentNode.querySelector(".avatar");
    badge.textContent = initial(input.value) || String(i + 1);
    saveSettings();
  });

  $("player-list").addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    var next = $("player-list").querySelector('input[data-index="' + (Number(e.target.dataset.index) + 1) + '"]');
    if (next) next.focus(); else e.target.blur();
  });

  $("players-minus").addEventListener("click", function () {
    settings.count = clamp(settings.count - 1, MIN_PLAYERS, MAX_PLAYERS);
    saveSettings();
    renderPlayerInputs();
  });

  $("players-plus").addEventListener("click", function () {
    settings.count = clamp(settings.count + 1, MIN_PLAYERS, MAX_PLAYERS);
    saveSettings();
    renderPlayerInputs();
  });

  function renderThemes() {
    var grid = $("theme-grid");
    grid.textContent = "";
    THEMES.forEach(function (t) {
      var btn = el("button", "theme-card");
      btn.type = "button";
      btn.dataset.id = t.id;
      btn.style.setProperty("--theme", t.color || DEFAULT_ACCENT);
      btn.setAttribute("aria-pressed", String(settings.themes.indexOf(t.id) !== -1));
      btn.appendChild(el("span", "theme-emoji", t.emoji || "🎲"));
      btn.appendChild(el("span", "theme-name", t.name));
      btn.appendChild(el("span", "theme-count", plural(t.pairs.length, "paire", "paires")));
      grid.appendChild(btn);
    });
    updateThemeSummary();
  }

  function updateThemeSummary() {
    var chosen = settings.themes.map(themeById).filter(Boolean);
    var pairs = chosen.reduce(function (sum, t) { return sum + t.pairs.length; }, 0);
    var all = chosen.length === THEMES.length;
    $("themes-toggle").textContent = all ? "Tout désélectionner" : "Tout sélectionner";
    $("themes-summary").textContent = chosen.length
      ? (chosen.length === 1 ? "Thème\u00a0: " + chosen[0].name : plural(chosen.length, "thème", "thèmes") + " mélangés")
        + " · " + plural(pairs, "paire", "paires") + " de mots"
      : "Choisis au moins un thème.";
    $("btn-start").disabled = !chosen.length;
  }

  $("theme-grid").addEventListener("click", function (e) {
    var btn = e.target.closest(".theme-card");
    if (!btn) return;
    var id = btn.dataset.id;
    var at = settings.themes.indexOf(id);
    if (at === -1) settings.themes.push(id); else settings.themes.splice(at, 1);
    btn.setAttribute("aria-pressed", String(at === -1));
    saveSettings();
    updateThemeSummary();
  });

  $("themes-toggle").addEventListener("click", function () {
    settings.themes = settings.themes.length === THEMES.length ? [] : THEMES.map(function (t) { return t.id; });
    saveSettings();
    renderThemes();
  });

  $("scores-reset").addEventListener("click", function () {
    confirmDialog("Remettre les scores à zéro\u00a0?", "Le classement de tous les joueurs sera effacé.", "Effacer", function () {
      scores = {};
      save(KEYS.scores, scores);
      renderSetup();
    });
  });

  // Prénoms définitifs : vides → « Joueur N », doublons → suffixe numéroté.
  function collectNames() {
    var names = [];
    var seen = {};
    for (var i = 0; i < settings.count; i++) {
      var base = String(settings.names[i] || "").trim().replace(/\s+/g, " ") || "Joueur " + (i + 1);
      var name = base;
      var n = 2;
      while (seen[name.toLowerCase()]) name = base + " " + n++;
      seen[name.toLowerCase()] = true;
      names.push(name);
    }
    return names;
  }

  // Tire une paire parmi les thèmes choisis, en évitant celles déjà jouées.
  function pickPair(themeIds) {
    var pool = [];
    themeIds.map(themeById).filter(Boolean).forEach(function (t) {
      t.pairs.forEach(function (pair) {
        pool.push({ theme: t, pair: pair, key: t.id + ":" + pair.join("/") });
      });
    });
    var used = load(KEYS.used, []);
    if (!Array.isArray(used)) used = [];
    var fresh = pool.filter(function (c) { return used.indexOf(c.key) === -1; });
    if (!fresh.length) {
      // Toutes les paires de ces thèmes ont été jouées : on repart de zéro pour elles.
      var keys = pool.map(function (c) { return c.key; });
      used = used.filter(function (k) { return keys.indexOf(k) === -1; });
      fresh = pool;
    }
    var choice = fresh[randomInt(fresh.length)];
    used.push(choice.key);
    save(KEYS.used, used);
    return choice;
  }

  function startGame() {
    if (!settings.themes.length) { toast("Choisis au moins un thème."); return; }
    var names = collectNames();
    var pick = pickPair(settings.themes);
    var swap = randomInt(2) === 1;
    var undercover = randomInt(names.length);

    game = {
      phase: "pass",
      themeId: pick.theme.id,
      civilWord: pick.pair[swap ? 1 : 0],
      underWord: pick.pair[swap ? 0 : 1],
      players: names.map(function (name, i) {
        return { name: name, seat: i, role: i === undercover ? "undercover" : "civil", alive: true, outRound: 0 };
      }),
      turn: 0,
      round: 1,
      starter: 0,
      peek: null,
      eliminated: null,
      revealed: false,
      winner: null,
      scored: false
    };
    voteChoice = null;
    saveGame();
    keepAwake(true);
    render();
  }

  $("btn-start").addEventListener("click", startGame);

  /* ---------- Distribution des mots ---------- */

  function currentHolder() {
    return game.players[game.peek != null ? game.peek : game.turn];
  }

  function renderPass() {
    var p = currentHolder();
    $("pass-step").textContent = game.peek != null
      ? "Revoir son mot"
      : "Distribution · " + (game.turn + 1) + " / " + game.players.length;
    fill($("pass-avatar"), avatar(p.name, p.seat, "avatar-xl"));
    $("pass-name").textContent = p.name;
    $("btn-show-word").textContent = "Je suis " + p.name + ", voir mon mot";
  }

  function renderReveal() {
    var p = currentHolder();
    var t = themeById(game.themeId);
    $("reveal-for").textContent = p.name;
    $("reveal-word").textContent = wordOf(p);
    $("reveal-theme").textContent = t ? t.emoji + " " + t.name : "";
    var last = game.peek == null && game.turn === game.players.length - 1;
    $("btn-hide-word").textContent = game.peek != null
      ? "C'est bon, cacher"
      : last ? "C'est retenu, on commence\u00a0!" : "C'est retenu, cacher";
  }

  $("btn-show-word").addEventListener("click", function () {
    game.phase = "reveal";
    saveGame();
    render();
  });

  $("btn-hide-word").addEventListener("click", function () {
    if (game.peek != null) {
      game.peek = null;
      game.phase = "discuss";
    } else if (game.turn < game.players.length - 1) {
      game.turn++;
      game.phase = "pass";
    } else {
      startRound();
      return;
    }
    saveGame();
    render();
  });

  /* ---------- Tours d'indices ---------- */

  function startRound() {
    var alive = alivePlayers();
    game.starter = alive[randomInt(alive.length)].seat;
    game.phase = "discuss";
    voteChoice = null;
    saveGame();
    render();
  }

  // Joueurs en vie, dans l'ordre de la table, à partir de celui qui commence.
  function speakingOrder() {
    var n = game.players.length;
    var order = [];
    for (var k = 0; k < n; k++) {
      var p = game.players[(game.starter + k) % n];
      if (p.alive) order.push(p);
    }
    return order;
  }

  function renderDiscuss() {
    $("discuss-step").textContent = "Tour " + game.round + " · " + plural(alivePlayers().length, "joueur", "joueurs") + " en jeu";
    var list = $("speak-order");
    list.textContent = "";
    speakingOrder().forEach(function (p, i) {
      var li = el("li", i === 0 ? "first" : "");
      li.appendChild(avatar(p.name, p.seat));
      li.appendChild(el("span", "", p.name));
      if (i === 0) li.appendChild(el("span", "tag", "commence"));
      list.appendChild(li);
    });
    renderOutList();
  }

  function renderOutList() {
    var out = game.players.filter(function (p) { return !p.alive; });
    $("out-block").hidden = !out.length;
    var list = $("out-list");
    list.textContent = "";
    out.forEach(function (p) {
      var li = el("li");
      li.appendChild(avatar(p.name, p.seat));
      li.appendChild(el("s", "", p.name));
      li.appendChild(el("span", "", "· civil"));
      list.appendChild(li);
    });
  }

  $("btn-to-vote").addEventListener("click", function () {
    game.phase = "vote";
    voteChoice = null;
    saveGame();
    render();
  });

  $("btn-peek").addEventListener("click", function () {
    var grid = el("div", "pick-list");
    alivePlayers().forEach(function (p) {
      var btn = el("button", "vote-card");
      btn.type = "button";
      btn.appendChild(avatar(p.name, p.seat));
      btn.appendChild(el("span", "", p.name));
      btn.addEventListener("click", function () {
        closeModal();
        game.peek = p.seat;
        game.phase = "pass";
        saveGame();
        render();
      });
      grid.appendChild(btn);
    });
    openModal("Qui veut revoir son mot\u00a0?", grid, [{ label: "Annuler", className: "btn-ghost" }]);
  });

  /* ---------- Vote ---------- */

  function renderVote() {
    $("vote-step").textContent = "Tour " + game.round + " · Vote";
    var grid = $("vote-grid");
    grid.textContent = "";
    alivePlayers().forEach(function (p) {
      var btn = el("button", "vote-card");
      btn.type = "button";
      btn.dataset.seat = String(p.seat);
      btn.setAttribute("aria-pressed", String(voteChoice === p.seat));
      btn.appendChild(avatar(p.name, p.seat));
      btn.appendChild(el("span", "", p.name));
      grid.appendChild(btn);
    });
    updateVoteButton();
  }

  function updateVoteButton() {
    var btn = $("btn-eliminate");
    btn.disabled = voteChoice == null;
    btn.textContent = voteChoice == null ? "Éliminer" : "Éliminer " + game.players[voteChoice].name;
  }

  $("vote-grid").addEventListener("click", function (e) {
    var card = e.target.closest(".vote-card");
    if (!card) return;
    voteChoice = Number(card.dataset.seat);
    Array.prototype.forEach.call($("vote-grid").children, function (c) {
      c.setAttribute("aria-pressed", String(c === card));
    });
    updateVoteButton();
  });

  $("btn-back-discuss").addEventListener("click", function () {
    game.phase = "discuss";
    saveGame();
    render();
  });

  $("btn-eliminate").addEventListener("click", function () {
    if (voteChoice == null) return;
    var p = game.players[voteChoice];
    p.alive = false;
    p.outRound = game.round;
    game.eliminated = p.seat;
    game.revealed = false;
    game.phase = "elim";
    voteChoice = null;
    saveGame();
    render();
  });

  /* ---------- Élimination ---------- */

  function renderElim() {
    var p = game.players[game.eliminated];
    $("elim-step").textContent = "Tour " + game.round + " · Verdict";
    fill($("elim-avatar"), avatar(p.name, p.seat, "avatar-xl"));
    $("elim-name").textContent = p.name;

    var role = $("elim-role");
    var msg = $("elim-msg");
    $("btn-elim-reveal").hidden = game.revealed;
    $("btn-elim-next").hidden = !game.revealed;

    if (!game.revealed) {
      role.className = "role-card";
      role.textContent = "?";
      msg.textContent = "";
      return;
    }

    var isUnder = p.role === "undercover";
    role.className = "role-card " + (isUnder ? "is-under" : "is-civil");
    role.textContent = isUnder ? "Undercover 🕵️" : "Civil 😇";
    var small = el("small", "", "Son mot\u00a0: " + wordOf(p));
    role.appendChild(small);

    if (isUnder) {
      msg.textContent = "Bien joué, vous avez démasqué l'Undercover\u00a0!";
    } else if (game.winner === "undercover") {
      msg.textContent = "Raté… Il ne reste que 2 joueurs\u00a0: l'Undercover l'emporte\u00a0!";
    } else {
      msg.textContent = "Raté\u00a0! L'Undercover court toujours… Encore " + plural(alivePlayers().length, "joueur", "joueurs") + " en lice.";
    }
    $("btn-elim-next").textContent = game.winner ? "Voir les résultats" : "Tour suivant";
  }

  $("btn-elim-reveal").addEventListener("click", function () {
    var p = game.players[game.eliminated];
    if (p.role === "undercover") game.winner = "civil";
    else if (alivePlayers().length <= 2) game.winner = "undercover";
    game.revealed = true;
    buzz(p.role === "undercover" ? [90, 60, 90] : 60);
    saveGame();
    render();
  });

  $("btn-elim-next").addEventListener("click", function () {
    if (game.winner) {
      finishGame();
    } else {
      game.round++;
      startRound();
    }
  });

  /* ---------- Fin de partie et scores ---------- */

  function pointsFor(p) {
    if (game.winner === "civil") return p.role === "civil" ? POINTS_CIVIL : 0;
    return p.role === "undercover" ? POINTS_UNDERCOVER : 0;
  }

  function finishGame() {
    if (!game.scored) {
      game.players.forEach(function (p) {
        scores[p.name] = (scores[p.name] || 0) + pointsFor(p);
      });
      save(KEYS.scores, scores);
      game.scored = true;
    }
    game.phase = "end";
    saveGame();
    render();
  }

  function renderEnd() {
    var civilWin = game.winner === "civil";
    var banner = $("end-banner");
    banner.className = "end-banner " + (civilWin ? "win-civil" : "win-under");
    banner.textContent = civilWin ? "🎉 Les civils gagnent\u00a0!" : "🕵️ L'Undercover gagne\u00a0!";
    var under = game.players.filter(function (p) { return p.role === "undercover"; })[0];
    banner.appendChild(el("small", "", civilWin
      ? under.name + " a été démasqué·e au tour " + under.outRound + "."
      : under.name + " a survécu jusqu'au bout."));

    $("end-civil-word").textContent = game.civilWord;
    $("end-under-word").textContent = game.underWord;

    var list = $("end-players");
    list.textContent = "";
    game.players.forEach(function (p) {
      var isUnder = p.role === "undercover";
      var li = el("li", isUnder ? "is-under" : "");
      li.appendChild(avatar(p.name, p.seat));
      var who = el("div", "who");
      who.appendChild(el("strong", "", p.name + (isUnder ? " 🕵️" : "")));
      who.appendChild(el("span", "", (isUnder ? "Undercover" : "Civil")
        + " · " + (p.alive ? "encore en jeu" : "éliminé·e au tour " + p.outRound)));
      li.appendChild(who);
      var pts = pointsFor(p);
      li.appendChild(el("span", "pts" + (pts ? "" : " zero"), pts ? "+" + pts : "+0"));
      list.appendChild(li);
    });

    renderScoreboard($("end-scores"), game.players.map(function (p) { return p.name; }));
  }

  function renderScoreboard(list, names) {
    list.textContent = "";
    var seats = {};
    if (game) game.players.forEach(function (p) { seats[p.name] = p.seat; });
    else collectNames().forEach(function (n, i) { seats[n] = i; });
    names
      .map(function (name) { return { name: name, score: scores[name] || 0 }; })
      .sort(function (a, b) { return b.score - a.score || a.name.localeCompare(b.name, "fr"); })
      .forEach(function (row, i) {
        var li = el("li");
        li.appendChild(avatar(row.name, seats[row.name] != null ? seats[row.name] : i));
        li.appendChild(el("span", "name", row.name));
        li.appendChild(el("span", "score", plural(row.score, "pt", "pts")));
        list.appendChild(li);
      });
  }

  $("btn-replay").addEventListener("click", startGame);

  $("btn-menu").addEventListener("click", function () {
    quitGame();
  });

  function quitGame() {
    game = null;
    voteChoice = null;
    saveGame();
    keepAwake(false);
    render();
  }

  $("btn-quit").addEventListener("click", function () {
    if (game.phase === "end") { quitGame(); return; }
    confirmDialog("Quitter la partie\u00a0?", "La partie en cours sera abandonnée (les scores déjà gagnés sont conservés).", "Quitter", quitGame);
  });

  /* ---------- Boîtes de dialogue ---------- */

  var modal = $("modal");

  function openModal(title, content, buttons) {
    $("modal-title").textContent = title;
    var body = $("modal-content");
    body.textContent = "";
    if (typeof content === "string") body.appendChild(el("p", "", content));
    else if (content) body.appendChild(content);
    var actions = $("modal-actions");
    actions.textContent = "";
    buttons.forEach(function (b) {
      var btn = el("button", "btn btn-big " + (b.className || "btn-primary"), b.label);
      btn.type = "button";
      btn.addEventListener("click", function () {
        closeModal();
        if (b.action) b.action();
      });
      actions.appendChild(btn);
    });
    if (modal.showModal) modal.showModal(); else modal.setAttribute("open", "");
  }

  function closeModal() {
    if (modal.close) modal.close(); else modal.removeAttribute("open");
  }

  function confirmDialog(title, text, confirmLabel, onConfirm) {
    openModal(title, text, [
      { label: "Annuler", className: "btn-ghost" },
      { label: confirmLabel, className: "btn-danger", action: onConfirm }
    ]);
  }

  // Un appui sur le fond assombri ferme la feuille.
  [modal, $("rules")].forEach(function (dialog) {
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog) dialog.close();
    });
  });

  $("btn-rules").addEventListener("click", function () {
    var rules = $("rules");
    if (rules.showModal) rules.showModal(); else rules.setAttribute("open", "");
  });

  /* ---------- Rendu ---------- */

  var RENDERERS = {
    setup: renderSetup,
    pass: renderPass,
    reveal: renderReveal,
    discuss: renderDiscuss,
    vote: renderVote,
    elim: renderElim,
    end: renderEnd
  };

  var shownPhase = null;

  function render() {
    var phase = game ? game.phase : "setup";
    if (!RENDERERS[phase]) { game = null; phase = "setup"; saveGame(); }

    var theme = game ? themeById(game.themeId) : null;
    document.documentElement.style.setProperty("--accent", theme && theme.color ? theme.color : DEFAULT_ACCENT);
    var badge = $("brand-theme");
    badge.hidden = !theme;
    $("brand-name").hidden = !!theme;
    if (theme) badge.textContent = theme.emoji + " " + theme.name;
    $("btn-quit").hidden = !game;

    RENDERERS[phase]();

    var screens = document.querySelectorAll(".screen");
    for (var i = 0; i < screens.length; i++) screens[i].hidden = screens[i].id !== "screen-" + phase;
    if (shownPhase !== phase) window.scrollTo(0, 0);
    shownPhase = phase;
  }

  if (!THEMES.length) {
    document.body.textContent = "Aucun thème trouvé\u00a0: vérifiez le fichier words.js.";
    return;
  }

  render();
  if (game) keepAwake(true);

  /* ---------- Mode hors-ligne (installation sur l'écran d'accueil) ---------- */

  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () { /* hors-ligne indisponible */ });
    });
  }
})();
