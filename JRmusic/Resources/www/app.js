/**
 * JRmusic Studio Runtime Engine
 * 1:1 Architecture with Enhanced macOS DMG/WebKit & Offline Guardrails
 */
const CONFIG = {
  SPOTIFY_CLIENT_ID: "ca0dd7e0e54c4e9aad140edf72c13ce3",
  GOOGLE_CLIENT_ID: "808147352261-93do7ovt86lo55dustq2gqodk9f53qe4.apps.googleusercontent.com",
  REDIRECT_URI: "com.googleusercontent.apps.808147352261-93do7ovt86lo55dustq2gqodk9f53qe4:/oauth2callback",
  WORKER_API_BASE: "https://jrmusic-premium.zhangzhanhang855.workers.dev",
  BACKEND_API_BASE: "https://neteasemusicdl.onrender.com",
  DEFAULT_DOWNLOAD_QUOTA: 10,
  DB_NAME: "JRMusicOfflineStore",
  DB_VERSION: 3,
  PREMIUM_QUALITIES: ['lossless', 'hires', 'jymaster', 'sky', 'dolby']
};

const UIToast = {
  show(message, type = 'info', duration = 3400) {
    const container = document.getElementById("ui-toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `ui-toast ${type}`;
    toast.innerHTML = `<div style="flex:1;">${message}</div>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("toast-fade-out");
      setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }, duration);
  }
};

const CustomPrompt = {
  resolver: null,
  show(title, desc, defaultVal = '') {
    return new Promise((resolve) => {
      CustomPrompt.resolver = resolve;
      document.getElementById("custom-prompt-title").innerText = title;
      const input = document.getElementById("custom-prompt-input");
      input.value = defaultVal;
      document.getElementById("custom-prompt-modal").classList.add("is-open");
      input.focus();
    });
  },
  confirm() {
    const val = document.getElementById("custom-prompt-input").value;
    document.getElementById("custom-prompt-modal").classList.remove("is-open");
    if (CustomPrompt.resolver) CustomPrompt.resolver(val);
    CustomPrompt.resolver = null;
  },
  cancel() {
    document.getElementById("custom-prompt-modal").classList.remove("is-open");
    if (CustomPrompt.resolver) CustomPrompt.resolver(null);
    CustomPrompt.resolver = null;
  }
};

const OfflineAudioStore = {
  db: null,
  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("audio_blobs")) {
          db.createObjectStore("audio_blobs", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("custom_playlists")) {
          db.createObjectStore("custom_playlists", { keyPath: "id" });
        }
      };
      req.onsuccess = async (e) => {
        OfflineAudioStore.db = e.target.result;
        await OfflineAudioStore.refreshCatalog();
        await CustomPlaylistsModule.loadFromStorage();
        resolve();
      };
      req.onerror = (err) => reject(err);
    });
  },
  async saveTrackBlob(trackObj, blob) {
    return new Promise((resolve, reject) => {
      const tx = OfflineAudioStore.db.transaction(["audio_blobs"], "readwrite");
      const store = tx.objectStore("audio_blobs");
      const record = {
        id: String(trackObj.id),
        title: trackObj.title,
        artist: trackObj.artist,
        album: trackObj.album,
        picUrl: trackObj.picUrl,
        quality: trackObj.quality || 'lossless',
        lyric: trackObj.lyric || '',
        tlyric: trackObj.tlyric || '',
        blob: blob,
        timestamp: Date.now()
      };
      store.put(record);
      tx.oncomplete = () => {
        PlaybackState.offlineCacheCatalog.add(String(trackObj.id));
        resolve();
      };
      tx.onerror = (err) => reject(err);
    });
  },
  async getTrackRecord(songId) {
    return new Promise((resolve) => {
      const tx = OfflineAudioStore.db.transaction(["audio_blobs"], "readonly");
      const store = tx.objectStore("audio_blobs");
      const req = store.get(String(songId));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  },
  async getAllCachedRecords() {
    return new Promise((resolve) => {
      const tx = OfflineAudioStore.db.transaction(["audio_blobs"], "readonly");
      const store = tx.objectStore("audio_blobs");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  },
  async refreshCatalog() {
    const records = await OfflineAudioStore.getAllCachedRecords();
    PlaybackState.offlineCacheCatalog.clear();
    records.forEach(r => PlaybackState.offlineCacheCatalog.add(String(r.id)));
  },
  async getAllLocalPlaylists() {
    return new Promise((resolve) => {
      if (!OfflineAudioStore.db.objectStoreNames.contains("custom_playlists")) return resolve([]);
      const tx = OfflineAudioStore.db.transaction(["custom_playlists"], "readonly");
      const store = tx.objectStore("custom_playlists");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  },
  async saveLocalPlaylist(playlistObj) {
    return new Promise((resolve, reject) => {
      const tx = OfflineAudioStore.db.transaction(["custom_playlists"], "readwrite");
      const store = tx.objectStore("custom_playlists");
      store.put(playlistObj);
      tx.oncomplete = () => resolve();
      tx.onerror = (err) => reject(err);
    });
  }
};

const MetaParser = {
  lrctrim(lyrics) {
    if (!lyrics) return [];
    const lines = lyrics.split('\n');
    const data = [];
    lines.forEach((line, index) => {
      const matches = line.match(/\[(\d{2}):(\d{2}[\.:]?\d*)]/);
      if (matches) {
        const minutes = parseInt(matches[1], 10);
        const seconds = parseFloat(matches[2].replace('.', ':')) || 0;
        const timestamp = minutes * 60 + seconds;
        let text = line.replace(/\[\d{2}:\d{2}[\.:]?\d*\]/g, '').trim();
        data.push({ time: timestamp, index, text });
      }
    });
    data.sort((a, b) => a.time - b.time);
    return data;
  },
  lrctran(lyric, tlyric) {
    let base = MetaParser.lrctrim(lyric);
    let trans = MetaParser.lrctrim(tlyric);
    if (!trans || trans.length === 0) return base;
    let len1 = base.length, len2 = trans.length;
    for (let i = 0, j = 0; i < len1 && j < len2; i++) {
      while (base[i].time > trans[j].time && j + 1 < len2) j++;
      if (Math.abs(base[i].time - trans[j].time) < 0.5) {
        const tText = trans[j].text.replace('/', '').trim();
        if (tText) base[i].text += ` (${tText})`;
        j++;
      }
    }
    return base;
  },
  parseFullLyrics(lrcRaw, tLrcRaw) {
    if (!lrcRaw) {
      PlaybackState.activeLyrics = [];
      LyricsView.renderSpotlightText("Instrumental / No Lyrics");
      return;
    }
    const merged = MetaParser.lrctran(lrcRaw, tLrcRaw);
    PlaybackState.activeLyrics = merged;
    LyricsView.renderSpotlightText(merged.length > 0 ? merged[0].text : lrcRaw.substring(0, 80));
  }
};

const PlaybackState = {
  currentUser: null,
  sessionToken: null,
  quotaRemainder: 0,
  currentQuality: 'lossless',
  flatTrackIndex: [],
  currentPlaylist: [],
  currentTrackPointer: -1,
  favorites: [],
  customPlaylists: [
    { id: "pl_my_jrmusic", name: "My JRmusic", tracks: [] }
  ],
  offlineCacheCatalog: new Set(),
  activeLyrics: [],
  currentLyricIndex: -1
};

/**
 * SPOTIFY OAUTH 2.0 PKCE ENGINE (With WebKit/DMG Fallbacks)
 */
const SpotifyIntegration = {
  getRedirectUri() {
    // When mounted in DMG or running under file://, fallback to official custom scheme
    if (window.location.protocol === "file:" || !window.location.origin || window.location.origin === "null") {
      return "jrmusic://spotify-callback";
    }
    return window.location.origin + window.location.pathname;
  },

  generateRandomString(length) {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    const randomValues = new Uint8Array(length);
    window.crypto.getRandomValues(randomValues);
    for (let i = 0; i < length; i++) {
      result += charset[randomValues[i] % charset.length];
    }
    return result;
  },

  async generateCodeChallenge(codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);

    const bytes = new Uint8Array(digest);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  },

  async initiateLogin() {
    try {
      const verifier = SpotifyIntegration.generateRandomString(64);
      const challenge = await SpotifyIntegration.generateCodeChallenge(verifier);

      localStorage.setItem("spotify_verifier", verifier);

      const redirectUri = SpotifyIntegration.getRedirectUri();
      const params = new URLSearchParams({
        client_id: CONFIG.SPOTIFY_CLIENT_ID,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: 'user-top-read user-read-private user-read-email',
        code_challenge_method: 'S256',
        code_challenge: challenge
      });

      const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;

      // In macOS WebKit sandbox, check if running as local file
      if (window.location.protocol === "file:") {
        const inputUrl = await CustomPrompt.show("Spotify DMG Auth", "Open link in Safari, then paste callback URL below:", authUrl);
        if (inputUrl && inputUrl.includes("code=")) {
          SpotifyIntegration.handleManualCallback(inputUrl);
        }
      } else {
        window.location.href = authUrl;
      }
    } catch (err) {
      console.error("PKCE Init Error:", err);
      UIToast.show(`PKCE Generation Error: ${err.message}`, "error");
    }
  },

  async handleManualCallback(urlString) {
    try {
      const url = new URL(urlString);
      const code = url.searchParams.get("code");
      if (code) {
        await SpotifyIntegration.exchangeCode(code);
      }
    } catch (e) {
      UIToast.show("Invalid callback URL", "error");
    }
  },

  async checkRedirectCallback() {
    let queryString = window.location.search;
    if (!queryString && window.location.hash.includes('?')) {
      queryString = '?' + window.location.hash.split('?')[1];
    }
    if (!queryString) return;

    const urlParams = new URLSearchParams(queryString);
    const code = urlParams.get("code");
    const error = urlParams.get("error");

    if (error) {
      UIToast.show(`Spotify Error: ${error}`, "error");
      return;
    }
    if (!code) return;

    if (window.location.protocol !== "file:") {
      window.history.replaceState({}, document.title, SpotifyIntegration.getRedirectUri());
    }

    await SpotifyIntegration.exchangeCode(code);
  },

  async exchangeCode(code) {
    const verifier = localStorage.getItem("spotify_verifier");
    if (!verifier) {
      UIToast.show("PKCE verification session lost. Please login again.", "error");
      return;
    }

    UIToast.show("Synchronizing Spotify profile & Top 20...", "spotify");

    try {
      const res = await fetch(`${CONFIG.WORKER_API_BASE}/api/spotify-code-auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code,
          verifier: verifier,
          redirectUri: SpotifyIntegration.getRedirectUri()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to exchange Spotify token");

      localStorage.removeItem("spotify_verifier");
      AuthModalController.setSession(data.user);

      UIToast.show(`Welcome, ${data.user.username}! Imported ${data.importedCount || 0} tracks to "My JRmusic".`, "success", 4000);

      const myJr = data.user.customPlaylists?.find(p => p.name === "My JRmusic");
      if (myJr && myJr.tracks) {
        TrackListView.renderList("My JRmusic", myJr.tracks);
      }
    } catch (err) {
      console.error("Spotify Auth Error:", err);
      UIToast.show(`Spotify Error: ${err.message}`, "error");
    }
  }
};

const MusicAPIEngine = {
  onQualityChanged(val) {
    PlaybackState.currentQuality = val;
    UIToast.show(`Audio Quality: ${val.toUpperCase()}`, "info");
  },
  async search() {
    const keyword = document.getElementById("api-search-input").value.trim();
    if (!keyword) return;
    UIToast.show(`Searching for "${keyword}"...`);
    try {
      const formData = new FormData();
      formData.append("keyword", keyword);
      formData.append("limit", "30");
      const res = await fetch(`${CONFIG.BACKEND_API_BASE}/Search`, { method: "POST", body: formData });
      const json = await res.json();
      if (json.status === 200 && Array.isArray(json.data)) {
        const tracks = json.data.map(item => ({
          id: String(item.id),
          title: item.name,
          artist: item.artists,
          album: item.album,
          picUrl: item.picUrl,
          level: PlaybackState.currentQuality
        }));
        PlaybackState.flatTrackIndex = tracks;
        TrackListView.renderList(`Search: ${keyword}`, tracks);
      }
    } catch (err) {
      UIToast.show(`API Error: ${err.message}`, "error");
    }
  },
  async resolveSongStream(songId, level = null) {
    const targetLevel = level || PlaybackState.currentQuality;
    const formData = new FormData();
    formData.append("url", songId);
    formData.append("level", targetLevel);
    formData.append("type", "json");
    const res = await fetch(`${CONFIG.BACKEND_API_BASE}/Song_V1`, { method: "POST", body: formData });
    const json = await res.json();
    if (json.status === 200 && json.data) return json.data;
    throw new Error("Unable to resolve stream");
  },
  async downloadDirect(songId) {
    if (!PlaybackState.currentUser) {
      AuthModalController.openModal();
      return;
    }
    try {
      const streamData = await MusicAPIEngine.resolveSongStream(songId);
      const audioRes = await fetch(streamData.url);
      const blob = await audioRes.blob();
      const trackRecord = {
        id: String(songId),
        title: streamData.name,
        artist: streamData.ar_name,
        album: streamData.al_name,
        picUrl: streamData.pic,
        quality: PlaybackState.currentQuality,
        lyric: streamData.lyric,
        tlyric: streamData.tlyric
      };
      await OfflineAudioStore.saveTrackBlob(trackRecord, blob);
      UIToast.show(`Downloaded "${streamData.name}"!`, "success");
    } catch (e) {
      UIToast.show(`Download failed: ${e.message}`, "error");
    }
  },
  async promptDirectParse() {
    const idOrUrl = await CustomPrompt.show("Direct Parse", "Enter Song ID:");
    if (!idOrUrl) return;
    let songId = idOrUrl.trim();
    try {
      const streamData = await MusicAPIEngine.resolveSongStream(songId);
      const track = {
        id: String(songId),
        title: streamData.name,
        artist: streamData.ar_name,
        album: streamData.al_name,
        picUrl: streamData.pic,
        resolvedUrl: streamData.url,
        lyric: streamData.lyric,
        tlyric: streamData.tlyric
      };
      AudioEngine.loadAndPlay(track);
    } catch (e) {
      UIToast.show(`Parse failed: ${e.message}`, "error");
    }
  }
};

const LyricsView = {
  open() {
    if (!AudioEngine.currentTrack) return;
    document.getElementById("lyrics-fullscreen-overlay").classList.add("is-open");
    document.getElementById("lyrics-nav-song-name").innerText = AudioEngine.currentTrack.title;
    document.getElementById("lyrics-modal-title").innerText = AudioEngine.currentTrack.title;
    document.getElementById("lyrics-hero-cover").src = AudioEngine.currentTrack.picUrl || "";
  },
  close() {
    document.getElementById("lyrics-fullscreen-overlay").classList.remove("is-open");
  },
  renderSpotlightText(text) {
    document.getElementById("lyrics-spotlight-line").innerText = text || "♫ ...";
  },
  updateHighlight(currentTime) {
    if (!PlaybackState.activeLyrics || PlaybackState.activeLyrics.length === 0) return;
    let activeIdx = -1;
    for (let i = 0; i < PlaybackState.activeLyrics.length; i++) {
      if (currentTime >= PlaybackState.activeLyrics[i].time) activeIdx = i;
      else break;
    }
    if (activeIdx !== PlaybackState.currentLyricIndex && activeIdx !== -1) {
      PlaybackState.currentLyricIndex = activeIdx;
      const currentText = PlaybackState.activeLyrics[activeIdx].text;
      document.getElementById("lbl-now-playing-sub").innerText = currentText;
      LyricsView.renderSpotlightText(currentText);
    }
  }
};

const AudioEngine = {
  sink: document.getElementById("core-audio-sink"),
  currentTrack: null,
  init() {
    this.sink.ontimeupdate = this.onTimeUpdate;
    this.sink.onended = this.nextTrack;
  },
  async loadAndPlay(track) {
    this.currentTrack = track;
    document.getElementById("lbl-now-playing-title").innerText = track.title;
    document.getElementById("lbl-now-playing-sub").innerText = "Decoding stream...";
    const thumbImg = document.getElementById("player-thumb-img");
    if (track.picUrl) {
      thumbImg.src = track.picUrl;
      thumbImg.style.display = "block";
    }
    try {
      const localRecord = await OfflineAudioStore.getTrackRecord(track.id);
      if (localRecord && localRecord.blob) {
        this.sink.src = URL.createObjectURL(localRecord.blob);
        MetaParser.parseFullLyrics(localRecord.lyric, localRecord.tlyric);
      } else {
        const streamData = await MusicAPIEngine.resolveSongStream(track.id);
        this.sink.src = streamData.url;
        MetaParser.parseFullLyrics(streamData.lyric, streamData.tlyric);
      }
      await this.sink.play();
      this.updatePlayBtnIcon(true);
    } catch (err) {
      UIToast.show(err.message, "error");
    }
  },
  togglePlayState() {
    if (!this.sink.src) return;
    if (this.sink.paused) {
      this.sink.play();
      this.updatePlayBtnIcon(true);
    } else {
      this.sink.pause();
      this.updatePlayBtnIcon(false);
    }
  },
  updatePlayBtnIcon(isPlaying) {
    document.getElementById("play-btn-vector").innerHTML = isPlaying ? 
      `<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>` : `<path d="M8 5v14l11-7z"/>`;
  },
  nextTrack() {
    if (PlaybackState.currentPlaylist.length === 0) return;
    PlaybackState.currentTrackPointer = (PlaybackState.currentTrackPointer + 1) % PlaybackState.currentPlaylist.length;
    AudioEngine.loadAndPlay(PlaybackState.currentPlaylist[PlaybackState.currentTrackPointer]);
  },
  prevTrack() {
    if (PlaybackState.currentPlaylist.length === 0) return;
    PlaybackState.currentTrackPointer = (PlaybackState.currentTrackPointer - 1 + PlaybackState.currentPlaylist.length) % PlaybackState.currentPlaylist.length;
    AudioEngine.loadAndPlay(PlaybackState.currentPlaylist[PlaybackState.currentTrackPointer]);
  },
  onTimeUpdate() {
    const curr = AudioEngine.sink.currentTime || 0;
    const dur = AudioEngine.sink.duration || 0;
    document.getElementById("lbl-time-elapsed").innerText = AudioEngine.formatTime(curr);
    document.getElementById("lbl-time-duration").innerText = AudioEngine.formatTime(dur);
    if (dur > 0) {
      document.getElementById("seek-fill").style.width = ((curr / dur) * 100) + "%";
    }
    LyricsView.updateHighlight(curr);
  },
  seek(e) {
    const rail = document.getElementById("seek-rail");
    const rect = rail.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (AudioEngine.sink.duration) {
      AudioEngine.sink.currentTime = ratio * AudioEngine.sink.duration;
    }
  },
  toggleCurrentFavorite() {
    if (this.currentTrack) {
      TrackListView.toggleFav(encodeURIComponent(JSON.stringify(this.currentTrack)));
    }
  },
  formatTime(sec) {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }
};

const CustomPlaylistsModule = {
  async loadFromStorage() {
    const localLists = await OfflineAudioStore.getAllLocalPlaylists();
    if (localLists.length > 0) PlaybackState.customPlaylists = localLists;
    CustomPlaylistsModule.renderShelf();
  },
  renderShelf() {
    const shelf = document.getElementById("custom-playlists-shelf");
    if (!shelf) return;
    shelf.innerHTML = `
      <div class="cockpit-card" onclick="TrackListView.renderList('Favorite Musics', PlaybackState.favorites)">
        <div class="cockpit-card-title">Favorite Musics</div>
        <div class="cockpit-card-subtitle">Encrypted personal vault</div>
      </div>
      <div class="cockpit-card" onclick="AppNavigation.switchStage('offlines')">
        <div class="cockpit-card-title">Offline Edge</div>
        <div class="cockpit-card-subtitle">Local persistent store</div>
      </div>
    `;
    PlaybackState.customPlaylists.forEach(pl => {
      const card = document.createElement("div");
      card.className = "cockpit-card";
      card.onclick = () => TrackListView.renderList(`Playlist: ${pl.name}`, pl.tracks);
      card.innerHTML = `
        <div class="cockpit-card-title">${pl.name}</div>
        <div class="cockpit-card-subtitle">${pl.tracks ? pl.tracks.length : 0} tracks · Cloud Vault</div>
      `;
      shelf.appendChild(card);
    });
    const addCard = document.createElement("div");
    addCard.className = "cockpit-card";
    addCard.onclick = () => CustomPlaylistsModule.promptNewPlaylist();
    addCard.innerHTML = `
      <div class="cockpit-card-title">+ New Playlist</div>
      <div class="cockpit-card-subtitle">Instantiate new collection</div>
    `;
    shelf.appendChild(addCard);
  },
  async promptNewPlaylist() {
    const name = await CustomPrompt.show("New Playlist", "Title:");
    if (name && name.trim()) {
      const newPl = {
        id: "pl_" + Date.now(),
        name: name.trim(),
        tracks: []
      };
      PlaybackState.customPlaylists.push(newPl);
      await OfflineAudioStore.saveLocalPlaylist(newPl);
      CustomPlaylistsModule.renderShelf();
      TrackListView.syncUserData();
      UIToast.show(`Playlist "${newPl.name}" created.`, "success");
    }
  }
};

const PlaylistPicker = {
  showCurrentTrack() {
    if (!AudioEngine.currentTrack) return;
    const container = document.getElementById("playlist-chip-container");
    container.innerHTML = "";
    PlaybackState.customPlaylists.forEach(pl => {
      const chip = document.createElement("div");
      chip.className = "playlist-select-chip";
      chip.innerHTML = `<span>${pl.name}</span><span>${pl.tracks ? pl.tracks.length : 0} tracks</span>`;
      chip.onclick = async () => {
        PlaylistPicker.close();
        pl.tracks.push(AudioEngine.currentTrack);
        await OfflineAudioStore.saveLocalPlaylist(pl);
        CustomPlaylistsModule.renderShelf();
        TrackListView.syncUserData();
        UIToast.show(`Added to ${pl.name}`, "success");
      };
      container.appendChild(chip);
    });
    document.getElementById("playlist-picker-modal").classList.add("is-open");
  },
  close() {
    document.getElementById("playlist-picker-modal").classList.remove("is-open");
  }
};

const TrackListView = {
  renderList(title, trackArray) {
    document.getElementById("listing-heading").innerText = title;
    const container = document.getElementById("track-items-container");
    container.innerHTML = "";
    if (!trackArray || trackArray.length === 0) {
      container.innerHTML = `<div style="padding: 40px; color: var(--text-muted); text-align: center;">No tracks found.</div>`;
      return;
    }
    trackArray.forEach((track, index) => {
      const isCached = PlaybackState.offlineCacheCatalog.has(String(track.id));
      const isFav = PlaybackState.favorites.some(f => f.id === track.id);
      const row = document.createElement("div");
      row.className = "track-row-node";
      row.innerHTML = `
        <div class="track-idx-col"><span>${index + 1}</span></div>
        <div class="track-meta-col">
          <span class="track-name-main">${track.title}</span>
          <span class="track-subpath">${track.artist} · ${track.album || ''}</span>
        </div>
        <div class="track-codec-col">LOSSLESS</div>
        <div class="track-cache-col">
          <span class="status-ping ${isCached ? 'cached' : ''}"></span>
          <span>${isCached ? 'Edge Cached' : 'Cloud CDN'}</span>
        </div>
        <div class="track-actions-col">
          <button class="action-icon-hit ${isFav ? 'active-fav' : ''}" onclick="event.stopPropagation(); TrackListView.toggleFav('${encodeURIComponent(JSON.stringify(track))}')">
            <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
          </button>
          <button class="action-icon-hit" onclick="event.stopPropagation(); MusicAPIEngine.downloadDirect('${track.id}')">
            <svg viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>
          </button>
        </div>
      `;
      row.onclick = () => {
        PlaybackState.currentPlaylist = trackArray;
        PlaybackState.currentTrackPointer = index;
        AudioEngine.loadAndPlay(track);
      };
      container.appendChild(row);
    });
  },
  toggleFav(encoded) {
    const track = JSON.parse(decodeURIComponent(encoded));
    const idx = PlaybackState.favorites.findIndex(f => f.id === track.id);
    if (idx >= 0) {
      PlaybackState.favorites.splice(idx, 1);
      UIToast.show(`Removed from favorites`);
    } else {
      PlaybackState.favorites.push(track);
      UIToast.show(`Added to favorites`, "success");
    }
    document.getElementById("fav-counter-label").innerText = `${PlaybackState.favorites.length}`;
    TrackListView.syncUserData();
  },
  async syncUserData() {
    if (!PlaybackState.currentUser) return;
    try {
      await fetch(`${CONFIG.WORKER_API_BASE}/api/user/sync-meta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: PlaybackState.currentUser.username,
          favorites: PlaybackState.favorites,
          customPlaylists: PlaybackState.customPlaylists
        })
      });
    } catch (e) {}
  }
};

const AuthModalController = {
  handleAvatarClick() {
    if (PlaybackState.currentUser) {
      document.getElementById("confirm-logout-modal").classList.add("is-open");
    } else {
      AuthModalController.openModal();
    }
  },
  cancelLogout() {
    document.getElementById("confirm-logout-modal").classList.remove("is-open");
  },
  confirmLogout() {
    document.getElementById("confirm-logout-modal").classList.remove("is-open");
    PlaybackState.currentUser = null;
    localStorage.removeItem("jrmusic_session");
    UIFeedback.updateUserVisuals();
    UIToast.show("Logged out.");
  },
  openModal() {
    document.getElementById("fullscreen-auth-stage").classList.remove("stage-hidden");
  },
  closeModal() {
    document.getElementById("fullscreen-auth-stage").classList.add("stage-hidden");
  },
  triggerGoogleSignIn() {
    if (window.webkit?.messageHandlers?.nativeGoogleLogin) {
      window.webkit.messageHandlers.nativeGoogleLogin.postMessage({ clientId: CONFIG.GOOGLE_CLIENT_ID });
    } else {
      UIToast.show("Starting Google native auth flow...", "info");
    }
  },
  setSession(userObj) {
    PlaybackState.currentUser = userObj;
    localStorage.setItem("jrmusic_session", JSON.stringify(userObj));
    AuthModalController.closeModal();
    UIFeedback.updateUserVisuals();
  },
  restoreSession() {
    const stored = localStorage.getItem("jrmusic_session");
    if (stored) {
      try {
        PlaybackState.currentUser = JSON.parse(stored);
      } catch (e) {}
    }
  }
};

window.handleNativeGoogleCode = async function(authCode, codeVerifier) {
  try {
    const res = await fetch(`${CONFIG.WORKER_API_BASE}/api/google-code-auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: authCode, verifier: codeVerifier, redirectUri: CONFIG.REDIRECT_URI })
    });
    const data = await res.json();
    if (data.user) {
      AuthModalController.setSession(data.user);
      UIToast.show(`Welcome, ${data.user.username}!`, "success");
    }
  } catch (e) {
    UIToast.show("Google Login Failed", "error");
  }
};

const AppNavigation = {
  switchStage(target) {
    document.querySelectorAll(".liquid-nav-item").forEach(el => el.classList.remove("active"));
    if (target === 'home') {
      document.getElementById("nav-main-home").classList.add("active");
      TrackListView.renderList("Discovered Tracks", PlaybackState.flatTrackIndex);
    } else if (target === 'offlines') {
      document.getElementById("nav-offlines").classList.add("active");
      OfflineAudioStore.getAllCachedRecords().then(records => {
        TrackListView.renderList("Offline Edge Vault", records);
      });
    } else if (target === 'my-playlists') {
      document.getElementById("nav-my-playlists").classList.add("active");
      if (PlaybackState.customPlaylists.length > 0) {
        TrackListView.renderList(PlaybackState.customPlaylists[0].name, PlaybackState.customPlaylists[0].tracks);
      }
    }
  }
};

const UIFeedback = {
  updateUserVisuals() {
    if (PlaybackState.currentUser) {
      const name = PlaybackState.currentUser.username;
      document.getElementById("user-display-name").innerText = name;
      const avatarBtn = document.getElementById("user-avatar-initial");
      if (PlaybackState.currentUser.avatar) {
        avatarBtn.innerHTML = `<img src="${PlaybackState.currentUser.avatar}" alt="Avatar" />`;
      } else {
        avatarBtn.innerText = name.charAt(0).toUpperCase();
      }
    } else {
      document.getElementById("user-display-name").innerText = "Not Signed In";
      document.getElementById("user-avatar-initial").innerText = "?";
    }
  }
};

setInterval(() => {
  const isPlaying = AudioEngine.sink && !AudioEngine.sink.paused;
  document.querySelectorAll(".spectrum-bar").forEach(b => {
    b.style.height = isPlaying ? (Math.floor(Math.random() * 18) + 4) + 'px' : '4px';
  });
}, 150);

window.addEventListener("DOMContentLoaded", async () => {
  await OfflineAudioStore.init();
  AudioEngine.init();
  AuthModalController.restoreSession();
  UIFeedback.updateUserVisuals();
  await SpotifyIntegration.checkRedirectCallback();
});
