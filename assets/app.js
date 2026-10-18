/* =========================================================
   声波闯关 · 网页版逻辑
   内置曲库 + IndexedDB 本机曲库 + 三种闯关模式
   ========================================================= */

(function () {
  "use strict";

  const BUILT_INS = (window.SONGS || []).slice();
  const PREVIEW_SONGS = (window.PREVIEW_SONGS || []).slice().map((song) => ({
    ...song,
    audioUrl: song.previewUrl,
    difficulty: "30 秒试听",
    accent: "#5ee6ff",
    preview: true
  }));
  const MAX_HEARTS = 3;
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const BEST_KEY = "sonic_quiz_web_best_v2";
  const LEGACY_BEST_KEY = "sonic-quiz-best-v1";
  const MUTE_KEY = "sonic_quiz_web_muted_v1";
  const DB_NAME = "sonic_quiz_web";
  const DB_STORE = "songs";
  const AUDIO_EXTENSIONS = ["mp3", "m4a", "aac", "wav", "ogg", "oga", "flac", "webm", "mp4"];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SFX = window.SFX || {
    success: "audio/success.wav",
    wrong: "audio/wrong.wav",
    victory: "audio/victory.wav"
  };

  const $ = (id) => document.getElementById(id);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const dom = {
    screens: { home: $("homeScreen"), game: $("gameScreen"), result: $("resultScreen") },
    bestMixed: $("bestMixed"),
    bestEndless: $("bestEndless"),
    bestCategory: $("bestCategory"),
    mixedBestInline: $("mixedBestInline"),
    categoryBestInline: $("categoryBestInline"),
    endlessBestInline: $("endlessBestInline"),
    totalSongs: $("totalSongs"),
    categoryCount: $("categoryCount"),
    libraryCount: $("libraryCount"),
    libraryStripCount: $("libraryStripCount"),
    libraryTotal: $("libraryTotal"),
    previewSongCount: $("previewSongCount"),
    previewSongList: $("previewSongList"),
    songArtistInput: $("songArtistInput"),
    recordBtn: $("recordBtn"),
    recordLabel: $("recordLabel"),
    recordStatus: $("recordStatus"),
    batchInput: $("batchInput"),
    libraryBtn: $("libraryBtn"),
    libraryStrip: $("libraryStrip"),
    muteBtn: $("muteBtn"),
    quickStartBtn: $("quickStartBtn"),
    howBtn: $("howBtn"),
    howDialog: $("howDialog"),
    howStartBtn: $("howStartBtn"),
    categoryDialog: $("categoryDialog"),
    categoryList: $("categoryList"),
    openLibraryFromCategory: $("openLibraryFromCategory"),
    libraryDialog: $("libraryDialog"),
    fileInput: $("fileInput"),
    fileDropTitle: $("fileDropTitle"),
    fileDropHint: $("fileDropHint"),
    songTitleInput: $("songTitleInput"),
    songCategorySelect: $("songCategorySelect"),
    saveSongBtn: $("saveSongBtn"),
    clearUploadBtn: $("clearUploadBtn"),
    uploadHint: $("uploadHint"),
    userSongList: $("userSongList"),
    userSongCount: $("userSongCount"),
    libraryEmpty: $("libraryEmpty"),
    exitDialog: $("exitDialog"),
    exitBtn: $("exitBtn"),
    cancelExit: $("cancelExit"),
    confirmExit: $("confirmExit"),
    endBtn: $("endBtn"),
    modeTag: $("modeTag"),
    progressText: $("progressText"),
    progressFill: $("progressFill"),
    scoreValue: $("scoreValue"),
    hearts: $("hearts"),
    trackNo: $("trackNo"),
    difficultyTag: $("difficultyTag"),
    questionNo: $("questionNo"),
    categoryTag: $("categoryTag"),
    vinyl: $("vinyl"),
    playBtn: $("playBtn"),
    playLabel: $("playLabel"),
    replayBtn: $("replayBtn"),
    playStateText: $("playStateText"),
    options: $("options"),
    feedback: $("feedback"),
    hintBtn: $("hintBtn"),
    comboBadge: $("comboBadge"),
    resultKicker: $("resultKicker"),
    resultTitle: $("resultTitle"),
    rankRing: $("rankRing"),
    rankLetter: $("rankLetter"),
    rankLabel: $("rankLabel"),
    resultScore: $("resultScore"),
    newBest: $("newBest"),
    resultCorrect: $("resultCorrect"),
    resultCombo: $("resultCombo"),
    resultHearts: $("resultHearts"),
    resultHints: $("resultHints"),
    resultMessage: $("resultMessage"),
    playAgainBtn: $("playAgainBtn"),
    resultHomeBtn: $("resultHomeBtn"),
    shareBtn: $("shareBtn"),
    toast: $("toast"),
    confettiLayer: $("confettiLayer")
  };

  const state = {
    screen: "home",
    mode: "mixed",
    category: "",
    queue: [],
    index: 0,
    total: 0,
    score: 0,
    hearts: MAX_HEARTS,
    combo: 0,
    maxCombo: 0,
    correct: 0,
    wrong: 0,
    answered: 0,
    hints: 0,
    hintUsed: false,
    locked: false,
    finished: false,
    playing: false,
    current: null,
    options: [],
    previewId: ""
  };

  let best = readBest();
  let muted = readMuted();
  let userSongs = [];
  let pendingFile = null;
  let mediaRecorder = null;
  let mediaStream = null;
  let recordChunks = [];
  let recordTimer = null;
  let recordTicker = null;
  let recordSeconds = 0;
  let toastTimer = null;
  let playTimer = null;
  let loseTimer = null;
  let clipTimer = null;
  let dbPromise = null;
  let starting = false;
  const objectUrls = new Map();

  /* =========================================================
     Audio
     ========================================================= */

  class AudioManager {
    constructor() {
      this.audio = new Audio();
      this.audio.preload = "auto";
      this.audio.addEventListener("ended", () => {
        this.playing = false;
        if (this.onended) this.onended();
      });
      this.audio.addEventListener("error", () => {
        this.playing = false;
        if (this.onerror) this.onerror();
      });
      this.playing = false;
      this.muted = false;
      this.onended = null;
      this.onerror = null;
    }

    setMuted(value) {
      this.muted = value;
      this.audio.muted = value;
    }

    play(url, { onended, onerror } = {}) {
      if (!url) return Promise.reject(new Error("没有音频地址"));
      this.stop();
      this.onended = onended || null;
      this.onerror = onerror || null;
      this.audio.muted = this.muted;
      this.audio.src = url;
      this.audio.currentTime = 0;
      this.playing = true;
      const result = this.audio.play();
      if (result && typeof result.catch === "function") {
        return result.catch((error) => {
          this.playing = false;
          if (onerror) onerror(error);
          throw error;
        });
      }
      return Promise.resolve();
    }

    stop() {
      this.onended = null;
      this.onerror = null;
      this.playing = false;
      try {
        this.audio.pause();
        this.audio.currentTime = 0;
      } catch (error) {
        // noop
      }
    }

    effect(name) {
      if (this.muted) return;
      const effect = new Audio(SFX[name] || "audio/" + name + ".wav");
      effect.volume = 0.58;
      effect.play().catch(() => {});
    }
  }

  const audio = new AudioManager();

  function playCurrent(auto = false) {
    if (!state.current || state.locked || state.screen !== "game") return;
    const source = state.current.previewUrl || state.current.audioUrl || state.current.audio;

    if (!source) {
      setPlaying(false);
      if (!auto) showToast("这首暂时没有可站内播放的试听");
      return;
    }

    clearClipTimer();
    const token = state.current.id;
    setPlaying(true);
    clipTimer = window.setTimeout(() => {
      if (state.current && state.current.id === token) {
        stopAudio();
        showToast("30 秒试听结束，可以重听");
      }
    }, 30000);
    audio.play(source, {
      onended: () => {
        clearClipTimer();
        if (state.current && state.current.id === token) setPlaying(false);
      },
      onerror: () => {
        clearClipTimer();
        if (state.current && state.current.id === token) setPlaying(false);
      }
    }).catch(() => {
      clearClipTimer();
      setPlaying(false);
      if (!auto) showToast("浏览器拦截了播放，请再点一次「播放旋律」");
    });
  }

  function clearClipTimer() {
    if (clipTimer) {
      clearTimeout(clipTimer);
      clipTimer = null;
    }
  }

  function stopAudio() {
    clearClipTimer();
    audio.stop();
    setPlaying(false);
  }

  function setPlaying(playing) {
    state.playing = playing;
    dom.vinyl.classList.toggle("is-playing", playing);
    dom.playBtn.closest(".player-card").classList.toggle("is-playing", playing);
    const isPreview = Boolean(state.current && state.current.preview);
    const idleLabel = isPreview ? "播放 30 秒" : "播放旋律";
    dom.playLabel.textContent = playing ? "停止" : idleLabel;
    dom.playBtn.setAttribute("aria-label", playing ? "停止播放" : idleLabel);
    dom.playStateText.textContent = playing
      ? isPreview
        ? "正在播放 30 秒试听…"
        : "正在播放，仔细听…"
      : isPreview
        ? "30 秒试听结束，可以重听"
        : state.current
          ? "旋律结束，可以重听"
          : "点击播放，仔细听";
  }

  /* =========================================================
     Storage / best
     ========================================================= */

  function readBest() {
    const fallback = { mixed: 0, category: 0, endless: 0 };
    try {
      const raw = window.localStorage.getItem(BEST_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          mixed: Number(parsed.mixed) || 0,
          category: Number(parsed.category) || 0,
          endless: Number(parsed.endless) || 0
        };
      }
      const legacy = parseInt(window.localStorage.getItem(LEGACY_BEST_KEY) || "0", 10);
      if (Number.isFinite(legacy) && legacy > 0) {
        return { mixed: legacy, category: 0, endless: 0 };
      }
    } catch (error) {
      // noop
    }
    return fallback;
  }

  function writeBest() {
    try {
      window.localStorage.setItem(BEST_KEY, JSON.stringify(best));
    } catch (error) {
      // noop
    }
  }

  function readMuted() {
    try {
      return window.localStorage.getItem(MUTE_KEY) === "1";
    } catch (error) {
      return false;
    }
  }

  function writeMuted(value) {
    try {
      window.localStorage.setItem(MUTE_KEY, value ? "1" : "0");
    } catch (error) {
      // noop
    }
  }

  /* =========================================================
     IndexedDB user library
     ========================================================= */

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("当前浏览器不支持本机曲库存储"));
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("本机曲库打开失败"));
    });
    return dbPromise;
  }

  async function loadUserSongs() {
    try {
      const db = await openDb();
      const records = await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const request = tx.objectStore(DB_STORE).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      userSongs = records
        .filter((record) => record && record.blob && record.title)
        .map((record) => {
          if (objectUrls.has(record.id)) URL.revokeObjectURL(objectUrls.get(record.id));
          const audioUrl = URL.createObjectURL(record.blob);
          objectUrls.set(record.id, audioUrl);
          return {
            id: record.id,
            title: record.title,
            artist: record.artist || "",
            category: record.category || "自定义",
            difficulty: "本机",
            accent: "#5ee6ff",
            audio: "",
            audioUrl,
            size: record.size || record.blob.size || 0,
            createdAt: record.createdAt || Date.now(),
            custom: true
          };
        });
    } catch (error) {
      userSongs = [];
      console.warn("load user songs failed", error);
    }
    updateHome();
    renderLibrary();
  }

  async function saveUserSong(record) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function removeUserSong(id) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    if (objectUrls.has(id)) {
      URL.revokeObjectURL(objectUrls.get(id));
      objectUrls.delete(id);
    }
  }

  /* =========================================================
     Song helpers
     ========================================================= */

  function allSongs() {
    return BUILT_INS.concat(PREVIEW_SONGS).concat(userSongs);
  }

  function songLabel(song) {
    if (!song) return "";
    return song.artist ? `${song.title} · ${song.artist}` : String(song.title || "");
  }

  function getCategories() {
    const counts = {};
    allSongs().forEach((song) => {
      counts[song.category] = (counts[song.category] || 0) + 1;
    });
    const order = ["儿歌", "古典", "民谣", "民歌", "经典老歌", "节日", "庆典", "自定义"];
    return order
      .filter((name) => counts[name] > 0)
      .map((name) => ({ name, count: counts[name] }));
  }

  function shuffle(items) {
    const array = items.slice();
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function buildOptions(answer, pool) {
    const answerLabel = songLabel(answer);
    const labels = [];
    pool.forEach((song) => {
      if (!song || song.id === answer.id) return;
      const label = songLabel(song);
      if (label && label !== answerLabel && labels.indexOf(label) === -1) labels.push(label);
    });
    const distractors = shuffle(labels).slice(0, 3);
    return shuffle([answerLabel].concat(distractors));
  }

  function formatScore(value) {
    return Number(value || 0).toLocaleString("zh-CN");
  }

  function formatSize(bytes) {
    const value = Number(bytes) || 0;
    if (!value) return "大小未知";
    if (value < 1024 * 1024) return Math.max(1, Math.round(value / 1024)) + " KB";
    return (value / 1024 / 1024).toFixed(1) + " MB";
  }

  function formatDate(timestamp) {
    const date = new Date(timestamp || Date.now());
    if (isNaN(date.getTime())) return "";
    return date.getFullYear() + "." + (date.getMonth() + 1) + "." + date.getDate();
  }

  function titleFromFile(name) {
    return String(name || "")
      .replace(/\.[^.]+$/, "")
      .replace(/[_]+/g, " ")
      .trim()
      .slice(0, 30);
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /* =========================================================
     UI helpers
     ========================================================= */

  function showToast(message, duration = 1900) {
    if (toastTimer) clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.classList.add("is-show");
    toastTimer = window.setTimeout(() => {
      dom.toast.classList.remove("is-show");
    }, duration);
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function") {
      if (dialog.open) dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  }

  function showScreen(name) {
    state.screen = name;
    Object.keys(dom.screens).forEach((key) => {
      dom.screens[key].classList.toggle("is-active", key === name);
    });
    document.body.dataset.screen = name;
    if (name !== "game") stopAudio();
    if (name === "home") updateHome();
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }

  function updateMuteUI() {
    dom.muteBtn.classList.toggle("is-muted", muted);
    dom.muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    dom.muteBtn.setAttribute("aria-label", muted ? "开启声音" : "关闭声音");
  }

  function toggleMute() {
    muted = !muted;
    writeMuted(muted);
    audio.setMuted(muted);
    updateMuteUI();
    showToast(muted ? "已静音，点击右上角可重新开启" : "声音已开启");
  }

  function updateHearts(hurt = false) {
    dom.hearts.innerHTML = "";
    for (let i = 0; i < MAX_HEARTS; i += 1) {
      const heart = document.createElement("span");
      heart.className = "heart" + (i >= state.hearts ? " is-lost" : "");
      heart.textContent = "♥";
      heart.setAttribute("aria-hidden", "true");
      dom.hearts.appendChild(heart);
    }
    dom.hearts.setAttribute("aria-label", `剩余生命 ${Math.max(0, state.hearts)} 条`);
    if (hurt) {
      dom.hearts.classList.remove("is-hurt");
      void dom.hearts.offsetWidth;
      dom.hearts.classList.add("is-hurt");
      window.setTimeout(() => dom.hearts.classList.remove("is-hurt"), 520);
    }
  }

  function updateScoreUI() {
    dom.scoreValue.textContent = formatScore(state.score);
  }

  function updateCombo() {
    if (state.combo > 1) {
      dom.comboBadge.textContent = `连击 ×${state.combo}`;
      dom.comboBadge.classList.add("is-on");
    } else {
      dom.comboBadge.textContent = "连击 ×0";
      dom.comboBadge.classList.remove("is-on");
    }
  }

  function updateHome() {
    const songs = allSongs();
    const categories = getCategories();
    dom.bestMixed.textContent = formatScore(best.mixed);
    dom.bestEndless.textContent = formatScore(best.endless);
    dom.bestCategory.textContent = formatScore(best.category);
    dom.previewSongCount.textContent = String(PREVIEW_SONGS.length);
    dom.mixedBestInline.textContent = `最高 ${formatScore(best.mixed)}`;
    dom.categoryBestInline.textContent = `最高 ${formatScore(best.category)}`;
    dom.endlessBestInline.textContent = `最高 ${formatScore(best.endless)}`;
    dom.totalSongs.textContent = String(songs.length);
    dom.categoryCount.textContent = String(categories.length);
    dom.libraryCount.textContent = String(songs.length);
    dom.libraryStripCount.textContent = String(songs.length);
    dom.libraryTotal.textContent = String(songs.length);
    dom.userSongCount.textContent = String(userSongs.length);
    dom.libraryEmpty.classList.toggle("hidden", userSongs.length > 0);
    dom.userSongList.classList.toggle("hidden", userSongs.length === 0);
  }

  /* =========================================================
     Category dialog
     ========================================================= */

  function renderCategories() {
    const categories = getCategories();
    dom.categoryList.innerHTML = "";
    if (!categories.length) {
      dom.categoryList.innerHTML = '<p class="library-empty">曲库为空，请先添加曲目。</p>';
      return;
    }
    categories.forEach((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "category-button";
      button.dataset.category = category.name;
      button.innerHTML = `<span><b>${escapeHTML(category.name)}</b><span>${category.count} 首曲目</span></span><em>→</em>`;
      button.addEventListener("click", () => {
        closeDialog(dom.categoryDialog);
        startGame("category", category.name);
      });
      dom.categoryList.appendChild(button);
    });
  }

  function openCategories() {
    renderCategories();
    openDialog(dom.categoryDialog);
  }

  /* =========================================================
     Library dialog
     ========================================================= */

  function openLibrary() {
    stopAudio();
    if (dom.categoryDialog.open) closeDialog(dom.categoryDialog);
    renderLibrary();
    openDialog(dom.libraryDialog);
  }

  function renderLibrary() {
    updateHome();
    dom.previewSongList.innerHTML = "";
    PREVIEW_SONGS.forEach((song, index) => {
      const row = document.createElement("div");
      row.className = "song-row";
      row.innerHTML = `
        <span class="song-row-index">${index + 1}</span>
        <span class="song-row-main">
          <span class="song-row-title">${escapeHTML(song.title)}${song.artist ? " · " + escapeHTML(song.artist) : ""}</span>
          <span class="song-row-meta">${escapeHTML(song.category)} · 30 秒试听</span>
        </span>
        <span class="song-row-actions">
          <button class="mini-button" type="button" data-preview="${escapeHTML(song.id)}">${state.previewId === song.id ? "停止" : "试听"}</button>
        </span>
      `;
      dom.previewSongList.appendChild(row);
    });

    dom.userSongList.innerHTML = "";
    if (!userSongs.length) {
      dom.libraryEmpty.classList.remove("hidden");
      dom.userSongList.classList.add("hidden");
      return;
    }
    dom.libraryEmpty.classList.add("hidden");
    dom.userSongList.classList.remove("hidden");

    userSongs
      .slice()
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .forEach((song, index) => {
        const row = document.createElement("div");
        row.className = "song-row";
        row.innerHTML = `
          <span class="song-row-index">${index + 1}</span>
          <span class="song-row-main">
            <span class="song-row-title">${escapeHTML(song.title)}${song.artist ? " · " + escapeHTML(song.artist) : ""}</span>
            <span class="song-row-meta">${escapeHTML(song.category)} · ${formatSize(song.size)} · ${formatDate(song.createdAt)}${song.cover ? " · 翻唱" : ""}</span>
          </span>
          <span class="song-row-actions">
            <button class="mini-button" type="button" data-preview="${escapeHTML(song.id)}">${state.previewId === song.id ? "停止" : "试听"}</button>
            <button class="mini-button danger" type="button" data-delete="${escapeHTML(song.id)}">删除</button>
          </span>
        `;
        dom.userSongList.appendChild(row);
      });
  }

  function previewUserSong(id) {
    const song = allSongs().find((item) => item.id === id);
    if (!song) return;
    if (state.previewId === id) {
      stopAudio();
      state.previewId = "";
      renderLibrary();
      return;
    }
    stopAudio();
    state.previewId = id;
    renderLibrary();
    clearClipTimer();
    clipTimer = window.setTimeout(() => {
      stopAudio();
      state.previewId = "";
      renderLibrary();
    }, 30000);
    audio.play(song.audioUrl || song.audio, {
      onended: () => {
        clearClipTimer();
        state.previewId = "";
        renderLibrary();
      },
      onerror: () => {
        clearClipTimer();
        state.previewId = "";
        renderLibrary();
        showToast("试听失败，请检查文件");
      }
    }).catch(() => {
      clearClipTimer();
      state.previewId = "";
      renderLibrary();
      showToast("浏览器拦截了试听，请再点一次");
    });
  }

  async function deleteUserSong(id) {
    const song = userSongs.find((item) => item.id === id);
    if (!song) return;
    if (!window.confirm(`确定从本机曲库删除《${song.title}》吗？`)) return;
    if (state.previewId === id) {
      stopAudio();
      state.previewId = "";
    }
    try {
      await removeUserSong(id);
      userSongs = userSongs.filter((item) => item.id !== id);
      renderLibrary();
      updateHome();
      showToast("已从本机曲库删除");
    } catch (error) {
      showToast("删除失败，请稍后再试");
    }
  }

  function resetUpload() {
    pendingFile = null;
    dom.fileInput.value = "";
    dom.songTitleInput.value = "";
    dom.songArtistInput.value = "";
    dom.songCategorySelect.value = "自定义";
    dom.fileDropTitle.textContent = "选择翻唱音频";
    dom.fileDropHint.textContent = "支持 mp3 / m4a / aac / wav / ogg / webm，单首不超过 10MB";
    dom.uploadHint.textContent = "请只添加你拥有使用权的翻唱或音频；音频只保存在本机浏览器。";
    dom.saveSongBtn.disabled = true;
    setRecordUI(false);
  }

  function updateSaveState() {
    dom.saveSongBtn.disabled = !pendingFile || !dom.songTitleInput.value.trim() || Boolean(mediaRecorder && mediaRecorder.state === "recording");
  }

  function setRecordUI(recording) {
    dom.recordBtn.classList.toggle("is-recording", recording);
    dom.recordLabel.textContent = recording
      ? `停止录音（${String(recordSeconds).padStart(2, "0")}s）`
      : "录制 30 秒翻唱";
    dom.recordStatus.textContent = recording
      ? "正在录音，最多 30 秒，只保存在本机"
      : "用麦克风录一段，只保存在本机";
    dom.saveSongBtn.disabled = recording || !pendingFile || !dom.songTitleInput.value.trim();
  }

  function stopRecording() {
    clearTimeout(recordTimer);
    clearInterval(recordTicker);
    recordTimer = null;
    recordTicker = null;
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      try {
        mediaRecorder.stop();
      } catch (error) {
        // noop
      }
    }
  }

  async function toggleRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      stopRecording();
      return;
    }
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      showToast("当前浏览器不支持录音，请改用上传音频");
      return;
    }
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mimeType = candidates.find((type) => window.MediaRecorder.isTypeSupported(type)) || "";
      mediaRecorder = mimeType
        ? new MediaRecorder(mediaStream, { mimeType })
        : new MediaRecorder(mediaStream);
      recordChunks = [];
      recordSeconds = 0;
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size) recordChunks.push(event.data);
      };
      mediaRecorder.onstop = () => {
        clearTimeout(recordTimer);
        clearInterval(recordTicker);
        recordTimer = null;
        recordTicker = null;
        if (mediaStream) {
          mediaStream.getTracks().forEach((track) => track.stop());
          mediaStream = null;
        }
        const type = (mediaRecorder && mediaRecorder.mimeType) || "audio/webm";
        const extension = type.indexOf("mp4") >= 0 ? "mp4" : "webm";
        const blob = new Blob(recordChunks, { type });
        recordChunks = [];
        if (!blob.size) {
          showToast("没有录到声音，请再试一次");
          setRecordUI(false);
          return;
        }
        const file = new File([blob], `我的翻唱-${Date.now()}.${extension}`, { type });
        handleFile(file);
        dom.songTitleInput.value = "我的翻唱";
        dom.songArtistInput.value = dom.songArtistInput.value || "";
        updateSaveState();
        setRecordUI(false);
        dom.recordStatus.textContent = "录音完成，填写歌名后加入本机曲库";
      };
      mediaRecorder.start();
      setRecordUI(true);
      recordTicker = window.setInterval(() => {
        recordSeconds += 1;
        setRecordUI(true);
        if (recordSeconds >= 30) stopRecording();
      }, 1000);
      recordTimer = window.setTimeout(stopRecording, 30500);
    } catch (error) {
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
      }
      showToast("无法使用麦克风，请检查浏览器权限");
      setRecordUI(false);
    }
  }

  async function importCoverBatch(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    let added = 0;
    for (const file of list) {
      const extension = (file.name.split(".").pop() || "").toLowerCase();
      if (AUDIO_EXTENSIONS.indexOf(extension) === -1 || file.size > MAX_FILE_SIZE) continue;
      let title = titleFromFile(file.name) || "我的翻唱";
      let suffix = 2;
      while (allSongs().some((song) => String(song.title).trim() === title)) {
        title = `${titleFromFile(file.name) || "我的翻唱"} (${suffix})`;
        suffix += 1;
      }
      const record = {
        id: "user_" + Date.now() + "_" + Math.floor(Math.random() * 100000),
        title,
        artist: "",
        category: "自定义",
        cover: true,
        size: file.size,
        type: file.type || "",
        createdAt: Date.now(),
        blob: file
      };
      try {
        await saveUserSong(record);
        const audioUrl = URL.createObjectURL(record.blob);
        objectUrls.set(record.id, audioUrl);
        userSongs.push({
          id: record.id,
          title: record.title,
          artist: "",
          category: record.category,
          difficulty: "本机",
          accent: "#5ee6ff",
          audio: "",
          audioUrl,
          size: record.size,
          createdAt: record.createdAt,
          custom: true,
          cover: true
        });
        added += 1;
      } catch (error) {
        // Skip individual failures and keep importing.
      }
    }
    renderLibrary();
    updateHome();
    if (added) showToast(`已批量加入 ${added} 首翻唱`);
    else showToast("没有可加入的音频");
  }

  function handleFile(file) {
    if (!file) return;
    const extension = (file.name.split(".").pop() || "").toLowerCase();
    if (AUDIO_EXTENSIONS.indexOf(extension) === -1) {
      pendingFile = null;
      dom.saveSongBtn.disabled = true;
      showToast("不支持这种音频格式");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      pendingFile = null;
      dom.saveSongBtn.disabled = true;
      showToast("单首音频请控制在 10MB 以内");
      return;
    }
    pendingFile = file;
    dom.fileDropTitle.textContent = file.name;
    dom.fileDropHint.textContent = `${formatSize(file.size)} · 已选择，填写歌名后保存`;
    dom.uploadHint.textContent = "文件只会保存在当前浏览器，不会上传服务器。";
    if (!dom.songTitleInput.value.trim()) {
      dom.songTitleInput.value = titleFromFile(file.name);
    }
    updateSaveState();
  }

  async function saveUpload() {
    if (!pendingFile) {
      showToast("请先选择音频文件");
      return;
    }
    const title = dom.songTitleInput.value.trim();
    if (!title) {
      showToast("请填写歌名");
      return;
    }
    const category = dom.songCategorySelect.value || "自定义";
    const artist = dom.songArtistInput.value.trim();
    if (
      allSongs().some(
        (song) => String(song.title).trim() === title && String(song.artist || "").trim() === artist
      )
    ) {
      showToast("同名且同演唱者的曲目已经存在");
      return;
    }
    dom.saveSongBtn.disabled = true;
    const record = {
      id: "user_" + Date.now() + "_" + Math.floor(Math.random() * 100000),
      title,
      artist,
      category,
      cover: true,
      size: pendingFile.size,
      type: pendingFile.type || "",
      createdAt: Date.now(),
      blob: pendingFile
    };
    try {
      await saveUserSong(record);
      const audioUrl = URL.createObjectURL(record.blob);
      objectUrls.set(record.id, audioUrl);
      userSongs.push({
        id: record.id,
        title: record.title,
        artist: record.artist || "",
        category: record.category,
        difficulty: "本机",
        accent: "#5ee6ff",
        audio: "",
        audioUrl,
        size: record.size,
        createdAt: record.createdAt,
        custom: true
      });
      resetUpload();
      renderLibrary();
      updateHome();
      showToast("已加入本机曲库");
    } catch (error) {
      showToast("保存失败：浏览器存储空间不足或被禁用");
      updateSaveState();
    }
  }

  /* =========================================================
     Game flow
     ========================================================= */

  function resetState() {
    state.queue = [];
    state.index = 0;
    state.total = 0;
    state.score = 0;
    state.hearts = MAX_HEARTS;
    state.combo = 0;
    state.maxCombo = 0;
    state.correct = 0;
    state.wrong = 0;
    state.answered = 0;
    state.hints = 0;
    state.hintUsed = false;
    state.locked = false;
    state.finished = false;
    state.playing = false;
    state.current = null;
    state.options = [];
    updateScoreUI();
    updateHearts();
    updateCombo();
  }

  async function startGame(mode, category = "") {
    if (starting) return;
    starting = true;
    const pool = allSongs();
    if (pool.length < 4) {
      starting = false;
      showToast("至少需要 4 首曲目才能开始");
      return;
    }

    let queue = [];
    if (mode === "mixed") {
      queue = shuffle(pool).slice(0, Math.min(10, pool.length));
    } else if (mode === "category") {
      const filtered = pool.filter((song) => song.category === category);
      if (!filtered.length) {
        starting = false;
        showToast("这个分类下还没有曲目");
        return;
      }
      queue = shuffle(filtered);
    } else {
      queue = shuffle(pool);
    }

    try {
      resetState();
      state.mode = mode;
      state.category = category;
      state.queue = queue;
      state.total = mode === "endless" ? 0 : queue.length;
      state.index = 0;
      state.screen = "game";
      showScreen("game");
      loadQuestion();
      if (muted) showToast("当前处于静音状态，可点击右上角开启声音");
    } finally {
      starting = false;
    }
  }

  function modeLabel() {
    if (state.mode === "category") return `分类 · ${state.category}`;
    if (state.mode === "endless") return "无尽闯关";
    return "混合闯关";
  }

  function updateProgress(completed) {
    if (state.mode === "endless") {
      dom.progressFill.style.width = `${Math.min(96, 10 + (state.index % 10) * 9)}%`;
    } else {
      const ratio = Math.max(0, Math.min(1, completed / Math.max(1, state.total)));
      dom.progressFill.style.width = `${ratio * 100}%`;
    }
  }

  function loadQuestion() {
    clearTimeout(playTimer);
    clearTimeout(loseTimer);
    stopAudio();

    if (state.index >= state.queue.length) {
      if (state.mode === "endless") {
        state.queue = shuffle(allSongs());
        state.index = 0;
        if (state.queue.length > 1 && state.current && state.queue[0].id === state.current.id) {
          state.queue.push(state.queue.shift());
        }
      } else {
        finish(true);
        return;
      }
    }

    const song = state.queue[state.index];
    if (!song) {
      finish(false);
      return;
    }

    state.current = song;
    state.options = buildOptions(song, allSongs());
    state.locked = false;
    state.hintUsed = false;
    setPlaying(false);

    dom.modeTag.textContent = modeLabel();
    dom.progressText.textContent =
      state.mode === "endless"
        ? `第 ${state.index + 1} 题 · 无尽`
        : `第 ${state.index + 1} / ${state.total} 题`;
    dom.trackNo.textContent = `TRACK ${String(state.index + 1).padStart(2, "0")}`;
    dom.difficultyTag.textContent = song.preview ? "30 秒试听" : song.difficulty || "进阶";
    dom.questionNo.textContent = `Q.${String(state.index + 1).padStart(2, "0")}`;
    dom.categoryTag.textContent = song.category;
    document.documentElement.style.setProperty("--hot", song.accent || "#d7ff4f");
    updateScoreUI();
    updateHearts();
    updateCombo();
    updateProgress(state.index);

    dom.feedback.className = "feedback";
    dom.feedback.innerHTML = "";
    dom.hintBtn.disabled = false;
    dom.hintBtn.classList.remove("is-used");
    dom.endBtn.classList.toggle("hidden", state.mode !== "endless");
    dom.options.classList.remove("is-locked");

    dom.playStateText.textContent = song.preview
      ? "30 秒站内试听 · 仔细听前奏或副歌"
      : "点击播放，仔细听";

    renderOptions();
    playTimer = window.setTimeout(() => playCurrent(true), 380);
  }

  function renderOptions() {
    dom.options.innerHTML = "";
    const letters = ["A", "B", "C", "D"];
    state.options.forEach((title, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option";
      button.dataset.title = title;
      button.innerHTML = `
        <span class="option-key">${letters[index] || "?"}</span>
        <span class="option-text">${escapeHTML(title)}</span>
        <svg class="option-mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m5 12.5 4.5 4.5L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
      dom.options.appendChild(button);
    });
  }

  function handleAnswer(button) {
    if (state.locked || button.disabled || !state.current) return;
    const title = button.dataset.title;
    if (!title) return;
    if (title === songLabel(state.current)) {
      handleCorrect(button);
    } else {
      handleWrong(button);
    }
  }

  function handleCorrect(button) {
    state.locked = true;
    state.answered += 1;
    stopAudio();
    const gain = 100 + Math.min(state.combo, 5) * 20 + state.hearts * 10;
    state.combo += 1;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    state.correct += 1;
    state.score += gain;

    Array.from(dom.options.children).forEach((option) => {
      option.disabled = true;
    });
    button.classList.add("is-correct");
    dom.options.classList.add("is-locked");
    dom.hintBtn.disabled = true;

    updateScoreUI();
    updateCombo();
    updateProgress(state.index + 1);
    audio.effect("success");
    burstConfetti(window.innerWidth / 2 + (Math.random() - 0.5) * 120, window.innerHeight * 0.45, 18);

    const isLast = state.mode !== "endless" && state.index === state.queue.length - 1;
    dom.feedback.className = "feedback is-success";
    dom.feedback.innerHTML = `
      <div class="feedback-head">
        <span class="feedback-title">答对了 · 《${escapeHTML(songLabel(state.current))}》</span>
        <span class="feedback-gain">+${gain} 分</span>
      </div>
      <p class="feedback-fact">${escapeHTML(state.current.fact || "")}</p>
      <button class="feedback-next" type="button" data-action="next">
        ${isLast ? "查看战绩" : "下一题"} <span aria-hidden="true">→</span>
      </button>
    `;
    const next = dom.feedback.querySelector("[data-action='next']");
    if (next) next.focus({ preventScroll: true });
  }

  function handleWrong(button) {
    state.answered += 1;
    state.wrong += 1;
    state.hearts = Math.max(0, state.hearts - 1);
    state.combo = 0;
    button.classList.add("is-wrong");
    button.disabled = true;

    updateHearts(true);
    updateCombo();
    stopAudio();
    audio.effect("wrong");

    if (state.hearts <= 0) {
      state.locked = true;
      Array.from(dom.options.children).forEach((option) => {
        option.disabled = true;
        if (option.dataset.title === songLabel(state.current)) option.classList.add("is-correct");
      });
      dom.options.classList.add("is-locked");
      dom.hintBtn.disabled = true;
      dom.feedback.className = "feedback is-wrong";
      dom.feedback.innerHTML = `
        <div class="feedback-head">
          <span class="feedback-title">生命值耗尽</span>
          <span class="feedback-gain">正确答案 · ${escapeHTML(songLabel(state.current))}</span>
        </div>
        <p class="feedback-fact">别急，记住这段旋律，下一轮一定能听出来。</p>
        <button class="feedback-next" type="button" data-action="finish">查看战绩 →</button>
      `;
      clearTimeout(loseTimer);
      loseTimer = window.setTimeout(() => finish(false), 2200);
      return;
    }

    dom.feedback.className = "feedback is-wrong";
    dom.feedback.innerHTML = `
      差一点。已经排除这个选项，还剩 <strong>${state.hearts}</strong> 条生命。
      <button class="feedback-next" type="button" data-action="replay">重听旋律 →</button>
    `;
  }

  function useHint() {
    if (state.locked || state.hintUsed || !state.current) return;
    const candidates = Array.from(dom.options.children).filter((option) => {
      return (
        !option.disabled &&
        !option.classList.contains("is-correct") &&
        option.dataset.title !== songLabel(state.current)
      );
    });
    if (!candidates.length) return;
    state.hintUsed = true;
    state.hints += 1;
    state.score = Math.max(0, state.score - 20);
    updateScoreUI();
    dom.hintBtn.disabled = true;
    dom.hintBtn.classList.add("is-used");
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    target.classList.add("is-eliminated");
    target.disabled = true;
    dom.feedback.className = "feedback is-info";
    dom.feedback.innerHTML = `
      已排除一个错误答案，排除项已变灰。再听一遍，答案更近了。
      <button class="feedback-next" type="button" data-action="replay">重听旋律 →</button>
    `;
  }

  function nextQuestion() {
    if (state.finished) return;
    state.index += 1;
    if (state.mode !== "endless" && state.index >= state.queue.length) {
      finish(true);
    } else {
      loadQuestion();
    }
  }

  function finish(completed) {
    if (state.finished) return;
    state.finished = true;
    clearTimeout(playTimer);
    clearTimeout(loseTimer);
    stopAudio();

    if (completed && state.mode !== "endless") {
      state.score += state.hearts * 150;
    }

    const previous = best[state.mode] || 0;
    const isNewBest = state.score > previous;
    if (isNewBest) {
      best[state.mode] = state.score;
      writeBest();
      updateHome();
    }

    let rank = "C";
    let rankLabel = "耳边风 · 再听一遍就会了";
    let title = "本轮结束";

    if (completed) {
      title = state.wrong === 0 ? "完美通关" : "通关成功";
      if (state.wrong === 0 && state.hints === 0) {
        rank = "S";
        rankLabel = "金耳朵 · 一次都没错，也没用提示";
      } else if (state.wrong <= 1 && state.hints <= 2) {
        rank = "A";
        rankLabel = "旋律猎人 · 只差一点点就完美";
      } else {
        rank = "B";
        rankLabel = "副歌捕手 · 已经很强了";
      }
    } else if (state.correct >= 6) {
      rank = "B";
      rankLabel = "副歌捕手 · 下一轮稳住就能通关";
    } else if (state.correct >= 3) {
      rank = "C";
      rankLabel = "耳边风 · 熟悉的旋律正在回来";
    }

    dom.resultKicker.textContent = completed ? "RUN COMPLETE" : "RUN ENDED";
    dom.resultTitle.textContent = title;
    dom.rankLetter.textContent = rank;
    dom.rankLabel.textContent = rankLabel;
    dom.rankRing.className = `rank-ring rank-${rank.toLowerCase()}`;
    dom.resultCorrect.textContent =
      state.mode === "endless"
        ? `${state.correct} / ${state.answered}`
        : `${state.correct} / ${state.total}`;
    dom.resultCombo.textContent = `×${state.maxCombo}`;
    dom.resultHearts.textContent = String(Math.max(0, state.hearts));
    dom.resultHints.textContent = String(state.hints);
    dom.newBest.classList.toggle("is-on", isNewBest);
    dom.resultScore.textContent = "0";

    const bonus = completed && state.mode !== "endless" ? state.hearts * 150 : 0;
    if (completed) {
      dom.resultMessage.innerHTML =
        state.wrong === 0 && state.hints === 0
          ? "没有答错，也没有用提示。你的耳朵值得一张金唱片。"
          : `剩余 ${state.hearts} 条生命，通关奖励 <b>+${bonus}</b> 分。${
              state.wrong > 0 ? "下一次试试零失误通关。" : ""
            }`;
    } else {
      dom.resultMessage.innerHTML = `你完成了 ${state.answered} 次作答，答对 ${state.correct} 题。${
        state.current ? `最后一题是《${escapeHTML(songLabel(state.current))}》。` : ""
      }再听一遍，下次一定记得住。`;
    }

    animateNumber(dom.resultScore, 0, state.score, 850);
    showScreen("result");
    if (completed) {
      window.setTimeout(() => audio.effect("victory"), 260);
      victoryConfetti();
    }
  }

  function replayCurrent() {
    if (state.locked || !state.current) return;
    stopAudio();
    playCurrent();
  }

  function togglePlay() {
    if (state.locked || !state.current) return;
    if (state.playing) {
      stopAudio();
    } else {
      playCurrent();
    }
  }

  function requestExit() {
    if (state.screen !== "game") {
      goHome();
      return;
    }
    stopAudio();
    clearTimeout(loseTimer);
    openDialog(dom.exitDialog);
  }

  function leaveGame() {
    closeDialog(dom.exitDialog);
    goHome();
  }

  function goHome() {
    clearTimeout(playTimer);
    clearTimeout(loseTimer);
    stopAudio();
    resetState();
    showScreen("home");
  }

  function playAgain() {
    startGame(state.mode, state.category);
  }

  /* =========================================================
     Effects
     ========================================================= */

  function burstConfetti(x, y, count = 22) {
    if (reduceMotion) return;
    const colors = ["#d7ff4f", "#5ee6ff", "#ff7a59", "#ffcf5c", "#b6a5ff", "#ffffff"];
    for (let i = 0; i < count; i += 1) {
      const piece = document.createElement("i");
      piece.className = "confetti";
      piece.style.left = `${x}px`;
      piece.style.top = `${y}px`;
      piece.style.setProperty("--c", colors[Math.floor(Math.random() * colors.length)]);
      piece.style.setProperty("--w", `${4 + Math.random() * 6}px`);
      piece.style.setProperty("--h", `${6 + Math.random() * 9}px`);
      piece.style.setProperty("--dx", `${(Math.random() - 0.5) * 340}px`);
      piece.style.setProperty("--dy", `${80 + Math.random() * 240}px`);
      piece.style.setProperty("--rot", `${(Math.random() - 0.5) * 860}deg`);
      piece.style.setProperty("--dur", `${0.9 + Math.random() * 0.9}s`);
      dom.confettiLayer.appendChild(piece);
      window.setTimeout(() => piece.remove(), 2100);
    }
  }

  function victoryConfetti() {
    if (reduceMotion) return;
    [
      { x: window.innerWidth * 0.2, y: window.innerHeight * 0.3, n: 26 },
      { x: window.innerWidth * 0.8, y: window.innerHeight * 0.28, n: 26 },
      { x: window.innerWidth * 0.5, y: window.innerHeight * 0.18, n: 30 }
    ].forEach((burst, index) => {
      window.setTimeout(() => {
        if (state.screen === "result") burstConfetti(burst.x, burst.y, burst.n);
      }, index * 220);
    });
  }

  function animateNumber(element, from, to, duration) {
    if (reduceMotion || duration <= 0) {
      element.textContent = formatScore(to);
      return;
    }
    const start = performance.now();
    function frame(now) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = formatScore(Math.round(from + (to - from) * eased));
      if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  async function shareResult() {
    const text = `我在《声波闯关》拿到了 ${formatScore(state.score)} 分，答对 ${state.correct} 题，来试试你的耳朵！`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "声波闯关", text, url: location.href });
        return;
      }
      await navigator.clipboard.writeText(text + " " + location.href);
      showToast("成绩已复制，去分享吧");
    } catch (error) {
      if (error && error.name === "AbortError") return;
      showToast("分享失败，请截图分享");
    }
  }

  /* =========================================================
     Events
     ========================================================= */

  function bindEvents() {
    $$("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.mode;
        if (mode === "category") openCategories();
        else startGame(mode);
      });
    });

    dom.quickStartBtn.addEventListener("click", () => startGame("mixed"));
    dom.howStartBtn.addEventListener("click", () => {
      closeDialog(dom.howDialog);
      startGame("mixed");
    });
    dom.howBtn.addEventListener("click", () => openDialog(dom.howDialog));
    dom.libraryBtn.addEventListener("click", openLibrary);
    dom.libraryStrip.addEventListener("click", openLibrary);
    dom.openLibraryFromCategory.addEventListener("click", openLibrary);
    dom.muteBtn.addEventListener("click", toggleMute);

    dom.fileInput.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      handleFile(file);
    });
    dom.songTitleInput.addEventListener("input", updateSaveState);
    dom.songArtistInput.addEventListener("input", updateSaveState);
    dom.saveSongBtn.addEventListener("click", saveUpload);
    dom.clearUploadBtn.addEventListener("click", resetUpload);
    dom.recordBtn.addEventListener("click", toggleRecording);
    dom.batchInput.addEventListener("change", (event) => {
      importCoverBatch(event.target.files);
      event.target.value = "";
    });

    dom.userSongList.addEventListener("click", (event) => {
      const preview = event.target.closest("[data-preview]");
      const del = event.target.closest("[data-delete]");
      if (preview) previewUserSong(preview.dataset.preview);
      if (del) deleteUserSong(del.dataset.delete);
    });
    dom.previewSongList.addEventListener("click", (event) => {
      const preview = event.target.closest("[data-preview]");
      if (preview) previewUserSong(preview.dataset.preview);
    });

    dom.exitBtn.addEventListener("click", requestExit);
    dom.cancelExit.addEventListener("click", () => closeDialog(dom.exitDialog));
    dom.confirmExit.addEventListener("click", leaveGame);
    dom.endBtn.addEventListener("click", () => finish(false));
    dom.playBtn.addEventListener("click", togglePlay);
    dom.replayBtn.addEventListener("click", replayCurrent);
    dom.hintBtn.addEventListener("click", useHint);
    dom.resultHomeBtn.addEventListener("click", goHome);
    dom.playAgainBtn.addEventListener("click", playAgain);
    dom.shareBtn.addEventListener("click", shareResult);

    dom.options.addEventListener("click", (event) => {
      const button = event.target.closest(".option");
      if (button) handleAnswer(button);
    });

    dom.feedback.addEventListener("click", (event) => {
      const next = event.target.closest("[data-action='next']");
      const finishButton = event.target.closest("[data-action='finish']");
      const replay = event.target.closest("[data-action='replay']");
      if (next) nextQuestion();
      if (finishButton) {
        clearTimeout(loseTimer);
        finish(false);
      }
      if (replay) replayCurrent();
    });

    $$("[data-close-dialog]").forEach((button) => {
      button.addEventListener("click", () => {
        const dialog = button.closest("dialog");
        closeDialog(dialog);
      });
    });

    $$("dialog").forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) closeDialog(dialog);
      });
      dialog.addEventListener("close", () => {
        if (dialog === dom.libraryDialog) {
          stopAudio();
          stopRecording();
          state.previewId = "";
        }
      });
    });

    $$("[data-go-home]").forEach((button) => {
      button.addEventListener("click", () => {
        if (state.screen === "game") requestExit();
        else goHome();
      });
    });

    window.addEventListener("keydown", handleKeydown);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopAudio();
    });
  }

  function handleKeydown(event) {
    if (document.querySelector("dialog[open]")) return;
    if (state.screen !== "game") return;
    if (event.key >= "1" && event.key <= "4") {
      const option = dom.options.children[Number(event.key) - 1];
      if (option && !option.disabled && !state.locked) {
        event.preventDefault();
        handleAnswer(option);
      }
      return;
    }
    const target = event.target;
    const onButton = target && typeof target.closest === "function" && target.closest("button");
    if (event.code === "Space" && !onButton) {
      event.preventDefault();
      togglePlay();
      return;
    }
    if (event.key === "r" || event.key === "R") {
      event.preventDefault();
      replayCurrent();
      return;
    }
    if (event.key === "h" || event.key === "H") {
      event.preventDefault();
      useHint();
    }
  }

  /* =========================================================
     Init
     ========================================================= */

  async function init() {
    muted = readMuted();
    audio.setMuted(muted);
    updateMuteUI();
    resetState();
    bindEvents();
    await loadUserSongs();
    updateHome();
    showScreen("home");

    if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
