/* Vidéothèque — catalogue de vidéos statique.
   Le catalogue est fourni par data/videos.js (window.VIDEO_CATALOG). */

(function () {
  "use strict";

  var RAW = Array.isArray(window.VIDEO_CATALOG) ? window.VIDEO_CATALOG : [];
  var STORE_KEY = "videotheque:progress";

  var state = {
    query: "",
    category: "all",
    sort: "recent",
    visible: [],
    current: -1
  };

  /* ---------- Normalisation du catalogue ---------- */

  var videos = RAW.map(function (v, i) {
    return {
      id: String(v.id || slug(v.title || "video-" + i) || "video-" + i),
      title: v.title || fileName(v.src) || "Sans titre",
      description: v.description || "",
      category: v.category || "Non classé",
      tags: Array.isArray(v.tags) ? v.tags : [],
      src: v.src || "",
      poster: v.poster || "",
      duration: typeof v.duration === "number" ? v.duration : null,
      size: typeof v.size === "number" ? v.size : null,
      date: v.date || "",
      source: v.source || "",
      index: i
    };
  }).filter(function (v) { return v.src; });

  /* ---------- Utilitaires ---------- */

  function slug(s) {
    return String(s).toLowerCase().normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function fileName(src) {
    if (!src) return "";
    var base = String(src).split("/").pop().split("?")[0];
    return decodeURIComponent(base).replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
  }

  function formatDuration(sec) {
    if (!sec || !isFinite(sec)) return "";
    sec = Math.round(sec);
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    var pad = function (n) { return n < 10 ? "0" + n : String(n); };
    return h ? h + ":" + pad(m) + ":" + pad(s) : m + ":" + pad(s);
  }

  function formatSize(bytes) {
    if (!bytes) return "";
    var units = ["o", "Ko", "Mo", "Go"];
    var i = 0;
    while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
    return (bytes >= 10 || i === 0 ? Math.round(bytes) : bytes.toFixed(1)) + " " + units[i];
  }

  function formatDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  }

  function deaccent(s) {
    return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  /* ---------- Progression de lecture (localStorage) ---------- */

  function readProgress() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch (e) { return {}; }
  }

  function saveProgress(id, time, duration) {
    if (!duration || !isFinite(duration)) return;
    try {
      var all = readProgress();
      if (time < 5 || time / duration > 0.95) delete all[id];
      else all[id] = { t: Math.floor(time), d: Math.floor(duration) };
      localStorage.setItem(STORE_KEY, JSON.stringify(all));
    } catch (e) { /* stockage indisponible : on ignore */ }
  }

  /* ---------- Éléments ---------- */

  var $ = function (sel) { return document.querySelector(sel); };
  var grid = $("#grid");
  var chips = $("#categories");
  var searchInput = $("#search");
  var searchClear = $("#search-clear");
  var sortSelect = $("#sort");
  var resultCount = $("#result-count");
  var emptyMsg = $("#empty");
  var onboarding = $("#onboarding");
  var footerCount = $("#footer-count");

  var player = $("#player");
  var video = $("#video");
  var playerTitle = $("#player-title");
  var playerSub = $("#player-sub");
  var playerDesc = $("#player-desc");
  var playerDownload = $("#player-download");
  var playerSource = $("#player-source");
  var prevBtn = $("#prev-video");
  var nextBtn = $("#next-video");

  /* ---------- Filtres ---------- */

  function matches(v, terms) {
    if (state.category !== "all" && v.category !== state.category) return false;
    if (!terms.length) return true;
    var hay = deaccent([v.title, v.description, v.category, v.tags.join(" ")].join(" "));
    return terms.every(function (t) { return hay.indexOf(t) !== -1; });
  }

  function compare(a, b) {
    switch (state.sort) {
      case "title": return a.title.localeCompare(b.title, "fr", { sensitivity: "base" });
      case "duration": return (b.duration || 0) - (a.duration || 0);
      case "old": return dateKey(a) - dateKey(b) || a.index - b.index;
      default: return dateKey(b) - dateKey(a) || a.index - b.index;
    }
  }

  function dateKey(v) {
    var t = v.date ? Date.parse(v.date) : NaN;
    return isNaN(t) ? 0 : t;
  }

  function applyFilters() {
    var terms = deaccent(state.query).split(/\s+/).filter(Boolean);
    state.visible = videos.filter(function (v) { return matches(v, terms); }).sort(compare);
    render();
  }

  /* ---------- Rendu ---------- */

  function renderCategories() {
    var counts = {};
    videos.forEach(function (v) { counts[v.category] = (counts[v.category] || 0) + 1; });
    var names = Object.keys(counts).sort(function (a, b) {
      return a.localeCompare(b, "fr", { sensitivity: "base" });
    });

    if (names.length < 2) { chips.hidden = true; return; }

    var entries = [["all", "Toutes", videos.length]].concat(names.map(function (n) {
      return [n, n, counts[n]];
    }));

    chips.innerHTML = "";
    entries.forEach(function (e) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.dataset.category = e[0];
      b.setAttribute("aria-pressed", String(state.category === e[0]));
      b.innerHTML = escapeHtml(e[1]) + ' <span class="count">' + e[2] + "</span>";
      chips.appendChild(b);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function render() {
    grid.innerHTML = "";

    if (!videos.length) {
      onboarding.hidden = false;
      resultCount.textContent = "";
      footerCount.textContent = "";
      return;
    }

    var progress = readProgress();
    var frag = document.createDocumentFragment();

    state.visible.forEach(function (v) {
      frag.appendChild(buildCard(v, progress[v.id]));
    });
    grid.appendChild(frag);

    emptyMsg.hidden = state.visible.length > 0;
    resultCount.textContent = state.visible.length
      ? state.visible.length + (state.visible.length > 1 ? " vidéos" : " vidéo")
      : "";
    footerCount.textContent = videos.length + (videos.length > 1 ? " vidéos répertoriées" : " vidéo répertoriée");
  }

  function buildCard(v, progress) {
    var card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    card.dataset.id = v.id;

    var thumb = document.createElement("div");
    thumb.className = "thumb";

    if (v.poster) {
      var img = document.createElement("img");
      img.src = v.poster;
      img.alt = "";
      img.loading = "lazy";
      img.addEventListener("error", function () { thumb.replaceChild(fallback(), img); });
      thumb.appendChild(img);
    } else {
      // Pas de miniature fournie : on affiche une image extraite de la vidéo.
      var prev = document.createElement("video");
      prev.src = v.src + "#t=2";
      prev.muted = true;
      prev.playsInline = true;
      prev.preload = "metadata";
      prev.tabIndex = -1;
      prev.addEventListener("loadedmetadata", function () {
        if (v.duration == null && isFinite(prev.duration)) {
          v.duration = prev.duration;
          var badge = thumb.querySelector(".badge-duration");
          if (badge) badge.textContent = formatDuration(v.duration);
        }
      });
      prev.addEventListener("error", function () { thumb.replaceChild(fallback(), prev); });
      card.addEventListener("mouseenter", function () {
        if (prev.readyState >= 2) { prev.currentTime = 2; prev.play().catch(function () {}); }
      });
      card.addEventListener("mouseleave", function () { prev.pause(); });
      thumb.appendChild(prev);
    }

    var overlay = document.createElement("div");
    overlay.className = "play-overlay";
    overlay.innerHTML = "<span>▶</span>";
    thumb.appendChild(overlay);

    var badge = document.createElement("span");
    badge.className = "badge-duration";
    badge.textContent = formatDuration(v.duration);
    if (!badge.textContent) badge.hidden = true;
    thumb.appendChild(badge);

    if (progress && progress.d) {
      var bar = document.createElement("div");
      bar.className = "progress-bar";
      bar.innerHTML = '<i style="width:' + Math.min(100, (progress.t / progress.d) * 100) + '%"></i>';
      thumb.appendChild(bar);
    }

    var h3 = document.createElement("h3");
    h3.className = "card-title";
    h3.textContent = v.title;

    var meta = document.createElement("p");
    meta.className = "card-meta";
    var bits = [];
    if (v.category && v.category !== "Non classé") {
      bits.push('<span class="tag">' + escapeHtml(v.category) + "</span>");
    }
    if (formatDate(v.date)) bits.push(escapeHtml(formatDate(v.date)));
    if (v.size) bits.push(escapeHtml(formatSize(v.size)));
    meta.innerHTML = bits.join('<span class="dot">·</span>');

    card.append(thumb, h3, meta);
    return card;
  }

  function fallback() {
    var d = document.createElement("div");
    d.className = "thumb-fallback";
    d.textContent = "🎬";
    return d;
  }

  /* ---------- Lecteur ---------- */

  function openVideo(id) {
    var idx = state.visible.findIndex(function (v) { return v.id === id; });
    if (idx === -1) {
      // La vidéo n'est pas dans la sélection courante (lien direct) : on l'ouvre quand même.
      var v = videos.find(function (x) { return x.id === id; });
      if (!v) return;
      state.visible = [v];
      idx = 0;
    }
    state.current = idx;
    load(state.visible[idx]);

    player.hidden = false;
    player.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    video.focus({ preventScroll: true });
  }

  function load(v) {
    video.pause();
    video.src = v.src;
    video.poster = v.poster || "";
    playerTitle.textContent = v.title;
    playerDesc.textContent = v.description;

    var bits = [];
    if (v.category && v.category !== "Non classé") bits.push('<span class="tag">' + escapeHtml(v.category) + "</span>");
    if (formatDate(v.date)) bits.push(escapeHtml(formatDate(v.date)));
    if (v.duration) bits.push(escapeHtml(formatDuration(v.duration)));
    if (v.size) bits.push(escapeHtml(formatSize(v.size)));
    if (v.tags.length) bits.push(escapeHtml(v.tags.join(", ")));
    playerSub.innerHTML = bits.join('<span class="dot">·</span>');

    playerDownload.href = v.src;
    playerSource.hidden = !v.source;
    if (v.source) playerSource.href = v.source;

    prevBtn.disabled = state.current <= 0;
    nextBtn.disabled = state.current >= state.visible.length - 1;

    var saved = readProgress()[v.id];
    video.addEventListener("loadedmetadata", function once() {
      video.removeEventListener("loadedmetadata", once);
      if (v.duration == null && isFinite(video.duration)) v.duration = video.duration;
      if (saved && saved.t && saved.t < video.duration - 5) video.currentTime = saved.t;
      video.play().catch(function () { /* lecture auto refusée : l'utilisateur cliquera */ });
    });
    video.load();

    if (location.hash !== "#v=" + v.id) {
      history.replaceState(null, "", "#v=" + v.id);
    }
  }

  function step(delta) {
    var next = state.current + delta;
    if (next < 0 || next >= state.visible.length) return;
    state.current = next;
    load(state.visible[next]);
  }

  function closePlayer() {
    var v = state.visible[state.current];
    if (v) saveProgress(v.id, video.currentTime, video.duration);
    video.pause();
    video.removeAttribute("src");
    video.load();
    player.hidden = true;
    player.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    state.current = -1;
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    render();
  }

  /* ---------- Événements ---------- */

  grid.addEventListener("click", function (e) {
    var card = e.target.closest(".card");
    if (card) openVideo(card.dataset.id);
  });

  chips.addEventListener("click", function (e) {
    var chip = e.target.closest(".chip");
    if (!chip) return;
    state.category = chip.dataset.category;
    Array.prototype.forEach.call(chips.children, function (c) {
      c.setAttribute("aria-pressed", String(c === chip));
    });
    applyFilters();
  });

  searchInput.addEventListener("input", function () {
    state.query = searchInput.value.trim();
    searchClear.hidden = !state.query;
    applyFilters();
  });

  searchClear.addEventListener("click", function () {
    searchInput.value = "";
    state.query = "";
    searchClear.hidden = true;
    searchInput.focus();
    applyFilters();
  });

  sortSelect.addEventListener("change", function () {
    state.sort = sortSelect.value;
    applyFilters();
  });

  player.addEventListener("click", function (e) {
    if (e.target.hasAttribute("data-close")) closePlayer();
  });

  prevBtn.addEventListener("click", function () { step(-1); });
  nextBtn.addEventListener("click", function () { step(1); });

  video.addEventListener("ended", function () {
    if (state.current < state.visible.length - 1) step(1);
  });

  video.addEventListener("timeupdate", function () {
    var v = state.visible[state.current];
    if (v && Math.floor(video.currentTime) % 5 === 0) {
      saveProgress(v.id, video.currentTime, video.duration);
    }
  });

  window.addEventListener("beforeunload", function () {
    var v = state.visible[state.current];
    if (v) saveProgress(v.id, video.currentTime, video.duration);
  });

  document.addEventListener("keydown", function (e) {
    if (!player.hidden) {
      if (e.key === "Escape") closePlayer();
      else if (e.key === "ArrowRight" && e.shiftKey) step(1);
      else if (e.key === "ArrowLeft" && e.shiftKey) step(-1);
      return;
    }
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (e.key === "/" && !typing) { e.preventDefault(); searchInput.focus(); }
  });

  /* ---------- Démarrage ---------- */

  renderCategories();
  applyFilters();

  var hash = location.hash.match(/^#v=(.+)$/);
  if (hash) openVideo(decodeURIComponent(hash[1]));
})();
