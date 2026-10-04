    let POKEMON_LIST = [];
    let MOVES_LIST = [];
    let ITEMS_LIST = [];
    let LEARNSETS_DATA = {};
    let MEGA_STONE_MAP = {};
    let POKEMON_MAP_LIST = [];
    let POKEMON_ICON_BY_NAME = {};
    let POKEMON_BY_ICON_FILE = {};
    let _masterDataPromise = null;
    let _isSpectatorMode = false;
    let _spectatorOwnerUid = null;
    let _spectatorPasscode = null;

    // ---- PARTIES (State variables hoisted to top) ----
    const PARTY_PAGE_SIZE = 30;
    let _partySearchQuery = '';
    let _partyCurrentRenderedCount = 0;
    let _partyFilteredCache = [];
    let _partyObserver = null;
    let _partyGridBound = false;
    let mySelFilterName = '';
    let oppPartyFilterName = '';

    // ---- HISTORY (State variables hoisted to top) ----
    const HIST_PAGE_SIZE = 50;
    let _histCurrentRenderedCount = 0;
    let _histFilteredCache = [];
    let _histObserver = null;

    const TYPE_NAME_JA_MAP = {
      "normal": "Normal", "fire": "Fire", "water": "Water", "grass": "Grass", "electric": "Electric", "ice": "Ice",
      "fighting": "Fighting", "poison": "Poison", "ground": "Ground", "flying": "Flying", "psychic": "Psychic",
      "bug": "Bug", "rock": "Rock", "ghost": "Ghost", "dragon": "Dragon", "dark": "Dark", "steel": "Steel", "fairy": "Fairy", "stellar": "Stellar"
    };

    function initPokemonIconMap() {
      POKEMON_ICON_BY_NAME = {};
      POKEMON_BY_ICON_FILE = {};
      if (!POKEMON_MAP_LIST || !POKEMON_MAP_LIST.length) return;

      POKEMON_MAP_LIST.forEach(item => {
        const fName = item.fileName;
        POKEMON_BY_ICON_FILE[fName] = item;

        if (item.nameJa) {
          POKEMON_ICON_BY_NAME[item.nameJa] = fName;
          const cleanJa = item.nameJa.replace(/\(.*\)/, '').trim();
          if (!POKEMON_ICON_BY_NAME[cleanJa]) POKEMON_ICON_BY_NAME[cleanJa] = fName;
        }
        if (item.nameEn) {
          POKEMON_ICON_BY_NAME[item.nameEn.toLowerCase()] = fName;
        }
      });

      // 表記揺れ�E追加補正
      POKEMON_ICON_BY_NAME['ロトム(ヒ�EチE'] = 'heat-rotom.png';
      POKEMON_ICON_BY_NAME['ヒ�Eトロトム'] = 'heat-rotom.png';
      POKEMON_ICON_BY_NAME['ロトム(ウォチE��ュ)'] = 'wash-rotom.png';
      POKEMON_ICON_BY_NAME['ウォチE��ュロトム'] = 'wash-rotom.png';
      POKEMON_ICON_BY_NAME['ロトム(フロスチE'] = 'frost-rotom.png';
      POKEMON_ICON_BY_NAME['フロストロトム'] = 'frost-rotom.png';
      POKEMON_ICON_BY_NAME['ロトム(スピン)'] = 'fan-rotom.png';
      POKEMON_ICON_BY_NAME['スピンロトム'] = 'fan-rotom.png';
      POKEMON_ICON_BY_NAME['ロトム(カチE��)'] = 'mow-rotom.png';
      POKEMON_ICON_BY_NAME['カチE��ロトム'] = 'mow-rotom.png';
      POKEMON_ICON_BY_NAME['ポリゴン�E�E] = 'porygon2.png';
      POKEMON_ICON_BY_NAME['ポリゴン2'] = 'porygon2.png';
      POKEMON_ICON_BY_NAME['ポリゴン�E�'] = 'porygon-z.png';
      POKEMON_ICON_BY_NAME['ポリゴンZ'] = 'porygon-z.png';
      POKEMON_ICON_BY_NAME['パルチE��ケンタロス(かくとぁE'] = 'tauros-paldean-combat.png';
      POKEMON_ICON_BY_NAME['パルチE��ケンタロス(ほのぁE'] = 'tauros-paldean-blaze.png';
      POKEMON_ICON_BY_NAME['パルチE��ケンタロス(みぁE'] = 'tauros-paldean-aqua.png';
      POKEMON_ICON_BY_NAME['ケンタロス(パルチE��十E'] = 'tauros-paldean-combat.png';
      POKEMON_ICON_BY_NAME['ケンタロス(パルチE��炁E'] = 'tauros-paldean-blaze.png';
      POKEMON_ICON_BY_NAME['ケンタロス(パルチE��水)'] = 'tauros-paldean-aqua.png';
      POKEMON_ICON_BY_NAME['イダイトウ(オス)'] = 'basculegion-male.png';
      POKEMON_ICON_BY_NAME['イダイトウ(メス)'] = 'basculegion-female.png';
      POKEMON_ICON_BY_NAME['イダイトウ♁E] = 'basculegion-male.png';
      POKEMON_ICON_BY_NAME['イダイトウ♀'] = 'basculegion-female.png';
    }

    function getPokemonIconFileName(query) {
      if (!query) return 'default.png';
      const p = findPokemon(query);
      const name = p ? p.display : (typeof query === 'string' ? query : query.name || '');
      if (POKEMON_ICON_BY_NAME[name]) return POKEMON_ICON_BY_NAME[name];
      const clean = name.replace(/\(.*\)/, '').replace(/♁E♀/, '').trim();
      if (POKEMON_ICON_BY_NAME[clean]) return POKEMON_ICON_BY_NAME[clean];
      return 'default.png';
    }

    function findPokemonByIconFile(fileName) {
      if (!fileName) return null;
      const item = POKEMON_BY_ICON_FILE[fileName];
      if (item && item.nameJa) {
        const found = findPokemon(item.nameJa);
        if (found) return found;
      }
      return null;
    }

    // 静的マスタチE�Eタの高速読み込み�E�基本マスタ最優先＋AI特徴量バチE��グラウンド�Eリロード！E
    async function loadStaticMasterData() {
      if (_masterDataPromise) return _masterDataPromise;
      _masterDataPromise = (async () => {
        try {
          // 1. 基本マスタを最優先で高速取得（ブラウザキャチE��ュを有効活用�E�E
          const [pokeRes, moveRes, itemRes, verRes, regRes] = await Promise.all([
            fetch('data/pokemon.json?v=' + Date.now()),
            fetch('data/moves.json?v=' + Date.now()),
            fetch('data/items.json?v=' + Date.now()),
            fetch('data/version.json?v=' + Date.now()).catch(() => null),
            fetch('data/regulations.json?v=' + Date.now()).catch(() => null)
          ]);
          POKEMON_LIST = await pokeRes.json();
          window.POKEMON_LIST = POKEMON_LIST;
          MOVES_LIST = await moveRes.json();
          ITEMS_LIST = await itemRes.json();
          if (verRes && verRes.ok) {
            try {
              window.STATIC_VERSION_DATA = await verRes.json();
            } catch (e) { }
          }
          if (regRes && regRes.ok) {
            try {
              const regJson = await regRes.json();
              if (regJson && regJson.list && Array.isArray(regJson.list)) {
                regulationsData = regJson;
              }
            } catch (e) { }
          }

          localPokemon = JSON.parse(JSON.stringify(POKEMON_LIST));
          localMoves = JSON.parse(JSON.stringify(MOVES_LIST)).map(m => ({ confirmed: true, ...m }));
          localItems = ITEMS_LIST.map(name => ({ name, confirmed: true }));
          rebuildPokemonMap();
          initRecordFormMeta();

          // 基本マスタが揃った瞬間に即座にパ�EチE��・履歴を描画�E�E.01秒！E
          try {
            renderParties();
            renderHistory();
          } catch (renderErr) { }

          // 2. Preload dictionaries and AI recognition engine in background
          setTimeout(async () => {
            try {
              const [lsRes, msRes, mapRes] = await Promise.all([
                fetch('data/learnsets.json').catch(() => null),
                fetch('data/mega_stones.json').catch(() => null),
                fetch('assets/pokemon_map.json').catch(() => null)
              ]);

              if (lsRes && lsRes.ok) {
                try { LEARNSETS_DATA = await lsRes.json(); } catch (e) { }
              }
              if (msRes && msRes.ok) {
                try { MEGA_STONE_MAP = await msRes.json(); } catch (e) { }
              }
              if (mapRes && mapRes.ok) {
                try {
                  POKEMON_MAP_LIST = await mapRes.json();
                  initPokemonIconMap();
                } catch (e) { }
              }

              // AI Engine Preload
              ensureAiEngineLoaded().then(() => {
                if (window.recognitionEngine && typeof window.recognitionEngine.loadDictionaries === 'function') {
                  window.recognitionEngine.loadDictionaries().catch(() => { });
                }
              }).catch(() => { });
            } catch (bgErr) {
              console.warn('Background master preload warning:', bgErr);
            }
          }, 300);

        } catch (e) {
          console.error("Error");
        }
      })();
      return _masterDataPromise;
    }

    // ポケモン高速引き出し用ハッシュマップ！E��プライトキャチE��ュ
    const _pokemonMap = new Map();
    const _spriteCache = new Map();

    function rebuildPokemonMap() {
      _pokemonMap.clear();
      _spriteCache.clear();
      const list = localPokemon || POKEMON_LIST;
      if (!list || !list.length) return;
      list.forEach(p => {
        if (!p) return;
        if (p.display && !_pokemonMap.has(p.display)) _pokemonMap.set(p.display, p);
        if (p.name && !_pokemonMap.has(p.name)) _pokemonMap.set(p.name, p);
      });
    }

    // ポケモン名�E表示名�Eメガ名�E表記揺れを完�E吸収してポケモンチE�Eタを取得する�Eルパ�E�E�E(1)高速キャチE��ュ対応！E
    function findPokemon(query) {
      if (!query) return null;
      if (typeof query === 'object' && query.display) return query;
      const q = String(query).trim();
      if (!q) return null;

      // 1. ハッシュマップから�EO(1)高速引き出ぁE
      if (_pokemonMap.has(q)) {
        return _pokemonMap.get(q);
      }

      const list = localPokemon || POKEMON_LIST;
      if (!list || !list.length) return null;

      const norm = s => (s || '').replace(/[�E�！E)]/g, '').replace(/[�E�X]/g, 'X').replace(/[�E�Y]/g, 'Y').replace(/[�E�Z]/g, 'Z').toLowerCase();
      const qNorm = norm(q);

      // 2. display, name, form の正規化完�E一致
      let found = list.find(p => norm(p.display) === qNorm || norm(p.name) === qNorm || norm(p.form) === qNorm);
      if (found) {
        _pokemonMap.set(q, found);
        return found;
      }

      // 3. フォーム名！Eorm�E��E完�E一致�E�侁E "メガリザードンY" -> p.form === "メガリザードン�E�"�E�E
      found = list.find(p => {
        const fNorm = norm(p.form);
        return fNorm && fNorm !== '通常' && fNorm === qNorm;
      });
      if (found) {
        _pokemonMap.set(q, found);
        return found;
      }

      // 4. メガ・フォルム名を含む候補�E中で、最めEname が長ぁE��最も�E体的な�E�ものを探ぁE
      const matchedForms = list.filter(p => {
        const dNorm = norm(p.display);
        const fNorm = norm(p.form);
        return (fNorm && fNorm !== '通常' && (dNorm.includes(qNorm) || qNorm.includes(fNorm)));
      });
      if (matchedForms.length) {
        matchedForms.sort((a, b) => (b.name.length - a.name.length) || (b.display.length - a.display.length));
        _pokemonMap.set(q, matchedForms[0]);
        return matchedForms[0];
      }

      // 5. ベ�Eス名完�E一致フォールバック�E�侁E "リザードン(メガ...)" -> "リザードン"�E�E
      const baseName = q.replace(/\(.*\)/, '').replace(/^メガ/, '').trim();
      const baseNorm = norm(baseName);
      const baseCand = list.filter(p => norm(p.name) === baseNorm);
      if (baseCand.length) {
        const normal = baseCand.find(p => p.form === '通常' || p.display === p.name);
        const res = normal || baseCand[0];
        _pokemonMap.set(q, res);
        return res;
      }

      return null;
    }

    // ---- DATA ----
    let parties = JSON.parse(localStorage.getItem('pkm_parties') || '[]');
    let records = JSON.parse(localStorage.getItem('pkm_records') || '[]');
    let selectedPartyId = null;
    let recordResult = null;
    let editingPartyId = null;
    const mySelFilter = [];
    const oppSelFilter = [];

    // Regulations, Seasons, Match Type, Tags
    let regulationsData = {
      latest: "レギュレーションM-B",
      list: ["レギュレーションM-B", "レギュレーションM-A", "レギュレーションI", "レギュレーションH", "レギュレーションG", "レギュレーションF", "レギュレーションE", "レギュレーションD", "レギュレーションC", "レギュレーションB", "レギュレーションA"]
    };
    let seasons = JSON.parse(localStorage.getItem('pkm_seasons') || '[]');
    let customTags = JSON.parse(localStorage.getItem('pkm_custom_tags') || '[]');
    // 直前�E記録設定（維持用�E�E
    let currentRecordRegulation = localStorage.getItem('pkm_last_regulation') || '';
    let currentRecordSeason = localStorage.getItem('pkm_last_season') || '';
    let currentRecordMatchType = localStorage.getItem('pkm_last_match_type') || 'ランクチE;
    let currentRecordTags = JSON.parse(localStorage.getItem('pkm_last_tags') || '[]');
    // 履歴画面のタグフィルター�E�ER検索用�E�E
    let historyTagFilters = [];

    // 最近選んだポケモン�E�最大20件、�E頭が最新�E�E
    let recentPicks = JSON.parse(localStorage.getItem('pkm_recent_picks') || '[]');
    function recordRecentPick(displayName) {
      recentPicks = recentPicks.filter(n => n !== displayName);
      recentPicks.unshift(displayName);
      if (recentPicks.length > 20) recentPicks = recentPicks.slice(0, 20);
      localStorage.setItem('pkm_recent_picks', JSON.stringify(recentPicks));
    }
    function sortByRecent(arr) {
      return [...arr].sort((a, b) => {
        const ai = recentPicks.indexOf(a.display);
        const bi = recentPicks.indexOf(b.display);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
    }
    let currentUser = null;
    const ADMIN_UID = '9B0bfjR8TPNDAFvWQXkcssCDwbe2';
    function isAdmin(user = currentUser) {
      return Boolean(user && user.uid === ADMIN_UID);
    }
    let _fbReady = false;

    // 吁E��末�E�ブラウザセチE��ョン�E�固有�EクライアンチED
    const CLIENT_ID = 'cli_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now();

    // 最後にこ�E端末が読み込んだ updatedAt�E�ミリ秒！E
    let _lastLoadedAt = 0;

    function isRemoteConflict(data) {
      if (!data || !data.updatedAt) return false;
      // 自刁E��書き込んだ更新なら絶対にリロード要求を出さなぁE
      if (data.updatedBy && data.updatedBy === CLIENT_ID) return false;

      const serverTime = (data.updatedAt && data.updatedAt.toMillis) ? data.updatedAt.toMillis() : 0;
      // こ�E端末がロードした時刻より明確に新しい他端末の更新�E�E1000ms以上�E余裕）�Eみ競合とみなぁE
      if (_lastLoadedAt > 0 && serverTime > (_lastLoadedAt + 1000)) {
        return true;
      }
      return false;
    }

    function getShowdownUsername() {
      return localStorage.getItem('pkm_showdown_username') || '';
    }

    async function saveShowdownUsername(nameFromInput = null) {
      const input = document.getElementById('dm-showdown-username');
      const name = (nameFromInput !== null ? nameFromInput : (input ? input.value : '')).trim();
      localStorage.setItem('pkm_showdown_username', name);
      if (input) input.value = name;

      if (currentUser && _fbReady) {
        const { doc, setDoc } = window._firestoreOps;
        const db = window._db;
        try {
          await setDoc(doc(db, 'users', currentUser.uid, 'data', 'main'), {
            showdownUsername: name,
            updatedAt: window._firestoreOps.serverTimestamp(),
            updatedBy: CLIENT_ID
          }, { merge: true });
        } catch (e) {
          console.error("Error");
        }
      }
      showRecordToast("Notification");
    }

    function updateShowdownUserUI() {
      const input = document.getElementById('dm-showdown-username');
      if (input) {
        input.value = getShowdownUsername();
      }
    }

    // 動画保存�E・連携設宁E(Google Drive / ローカル端末)
    function getVideoStorageType() {
      return localStorage.getItem('pkm_video_storage_type') || 'drive';
    }

    function setVideoStorageType(type) {
      localStorage.setItem('pkm_video_storage_type', type);
    }

    function getLocalDirName() {
      return localStorage.getItem('pkm_local_dir_name') || '';
    }

    function onStorageTypeChanged(type) {
      setVideoStorageType(type);
      updateDriveSettingsUI();
    }
    window.onStorageTypeChanged = onStorageTypeChanged;

    async function verifyFilePermission(handle, readWrite = true) {
      if (!handle) return false;
      const options = {};
      if (readWrite) options.mode = 'readwrite';
      try {
        if ((await handle.queryPermission(options)) === 'granted') {
          return true;
        }
        if ((await handle.requestPermission(options)) === 'granted') {
          return true;
        }
      } catch (e) {
        console.warn('verifyFilePermission error:', e);
      }
      return false;
    }
    window.verifyFilePermission = verifyFilePermission;

    async function selectLocalDirectory() {
      if (!window.showDirectoryPicker) {
        alert("Alert");
        return;
      }
      try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        if (handle) {
          await VideoStore.saveHandle('local_video_dir', handle);
          localStorage.setItem('pkm_local_dir_name', handle.name);
          updateDriveSettingsUI();
          showRecordToast("Notification");
        }
      } catch (e) {
        if (e.name !== 'AbortError') {
          console.error("Error");
          alert("Alert");
        }
      }
    }
    window.selectLocalDirectory = selectLocalDirectory;

    async function saveVideoToLocalDirectory(fileOrBlob, fileName) {
      const handle = await VideoStore.getHandle('local_video_dir');
      if (!handle) {
        throw new Error("Error");
      }
      const ok = await verifyFilePermission(handle, true);
      if (!ok) {
        throw new Error("Error");
      }
      const fileHandle = await handle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(fileOrBlob);
      await writable.close();
      return fileName;
    }
    window.saveVideoToLocalDirectory = saveVideoToLocalDirectory;

    async function checkLocalRecordingPermissionIfNeeded() {
      if (getVideoStorageType() !== 'local') return true;
      const isAutoRecord = localStorage.getItem('autoModeAutoRecord') === 'true';
      if (!isAutoRecord) return true;
      const handle = await VideoStore.getHandle('local_video_dir');
      if (!handle) {
        alert("Alert");
        return false;
      }
      const ok = await verifyFilePermission(handle, true);
      if (!ok) {
        alert("Alert");
        return false;
      }
      return true;
    }
    window.checkLocalRecordingPermissionIfNeeded = checkLocalRecordingPermissionIfNeeded;

    function getDriveFolderId() {
      return localStorage.getItem('pkm_drive_folder_id') || '';
    }

    function getDriveClientId() {
      return localStorage.getItem('pkm_drive_client_id') || '';
    }

    async function saveDriveSettings() {
      const storageType = getVideoStorageType();
      const folderInput = document.getElementById('dm-drive-folder-id');
      const clientInput = document.getElementById('dm-drive-client-id');
      const folderId = (folderInput ? folderInput.value : '').trim();
      const clientId = (clientInput ? clientInput.value : '').trim();

      localStorage.setItem('pkm_drive_folder_id', folderId);
      localStorage.setItem('pkm_drive_client_id', clientId);
      localStorage.setItem('pkm_video_storage_type', storageType);

      if (currentUser && _fbReady) {
        const { doc, setDoc } = window._firestoreOps;
        const db = window._db;
        try {
          await setDoc(doc(db, 'users', currentUser.uid, 'data', 'main'), {
            driveFolderId: folderId,
            driveClientId: clientId,
            videoStorageType: storageType,
            updatedAt: window._firestoreOps.serverTimestamp(),
            updatedBy: CLIENT_ID
          }, { merge: true });
        } catch (e) {
          console.error("Error");
        }
      }
      showRecordToast("Notification");
      updateDriveSettingsUI();
    }

    function updateDriveSettingsUI() {
      const storageType = getVideoStorageType();
      const driveRadio = document.getElementById('storage-type-drive');
      const localRadio = document.getElementById('storage-type-local');
      if (driveRadio) driveRadio.checked = (storageType === 'drive');
      if (localRadio) localRadio.checked = (storageType === 'local');

      const driveSec = document.getElementById('dm-drive-storage-section');
      const localSec = document.getElementById('dm-local-storage-section');
      if (driveSec) driveSec.style.display = (storageType === 'drive') ? 'block' : 'none';
      if (localSec) localSec.style.display = (storageType === 'local') ? 'block' : 'none';

      const localDirNameEl = document.getElementById('dm-local-dir-name');
      if (localDirNameEl) {
        const dirName = getLocalDirName();
        localDirNameEl.textContent = dirName ? `選択中: ${dirName}` : '未選抁E;
      }

      const folderInput = document.getElementById('dm-drive-folder-id');
      const clientInput = document.getElementById('dm-drive-client-id');
      if (folderInput) folderInput.value = getDriveFolderId();
      if (clientInput) clientInput.value = getDriveClientId();

      const badge = document.getElementById('dm-drive-status-badge');
      if (badge) {
        if (storageType === 'local') {
          const dirName = getLocalDirName();
          if (dirName) {
            badge.textContent = `ローカル (${dirName})`;
            badge.style.background = 'rgba(59,130,246,0.15)';
            badge.style.color = '#3b82f6';
          } else {
            badge.textContent = 'フォルダ未選抁E;
            badge.style.background = 'rgba(239,68,68,0.15)';
            badge.style.color = '#ef4444';
          }
        } else {
          if (window._googleDriveAccessToken && Date.now() < window._googleDriveTokenExpiresAt) {
            badge.textContent = '認証済み (接続中)';
            badge.style.background = 'rgba(74,222,128,0.15)';
            badge.style.color = 'var(--win)';
          } else if (getDriveClientId()) {
            badge.textContent = 'Client ID設定渁E(未認証)';
            badge.style.background = 'rgba(245,158,11,0.15)';
            badge.style.color = '#f59e0b';
          } else {
            badge.textContent = '未設宁E;
            badge.style.background = 'var(--surface2)';
            badge.style.color = 'var(--text-muted)';
          }
        }
      }
    }

    // Google Drive認証ト�Eクン永続化 & 要汁E(GIS)
    window._googleDriveAccessToken = null;
    window._googleDriveTokenExpiresAt = 0;

    function loadStoredDriveToken() {
      try {
        const tok = localStorage.getItem('gdrive_access_token');
        const exp = parseInt(localStorage.getItem('gdrive_token_expires_at') || '0', 10);
        if (tok && Date.now() < exp) {
          window._googleDriveAccessToken = tok;
          window._googleDriveTokenExpiresAt = exp;
          return tok;
        }
      } catch(e) {}
      window._googleDriveAccessToken = null;
      window._googleDriveTokenExpiresAt = 0;
      return null;
    }

    function saveStoredDriveToken(token, expiresInSec) {
      try {
        const exp = Date.now() + (parseInt(expiresInSec, 10) - 60) * 1000;
        localStorage.setItem('gdrive_access_token', token);
        localStorage.setItem('gdrive_token_expires_at', exp.toString());
        window._googleDriveAccessToken = token;
        window._googleDriveTokenExpiresAt = exp;
      } catch(e) {}
    }

    // 初期ロード時にローカルストレージからト�Eクン復允E
    loadStoredDriveToken();

    function requestGoogleDriveAccessToken(interactive = true) {
      return new Promise((resolve, reject) => {
        const cached = loadStoredDriveToken();
        if (cached) {
          updateDriveSettingsUI();
          resolve(cached);
          return;
        }
        const cId = getDriveClientId();
        if (!cId) {
          const err = new Error('Google OAuth Client ID が設定されてぁE��せん。「データ管琁E��画面で設定してください、E);
          if (interactive) alert("Alert");
          reject(err);
          return;
        }
        if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
          const err = new Error('Google Identity Services が読み込まれてぁE��せん、E);
          if (interactive) alert("Alert");
          reject(err);
          return;
        }

        try {
          const client = google.accounts.oauth2.initTokenClient({
            client_id: cId,
            scope: 'https://www.googleapis.com/auth/drive.file',
            include_granted_scopes: false,
            callback: (response) => {
              if (response.error) {
                console.warn('Google OAuth response error:', response);
                reject(new Error(response.error_description || response.error));
                return;
              }
              saveStoredDriveToken(response.access_token, response.expires_in);
              updateDriveSettingsUI();
              // 認証成功後にアチE�Eロードキューを開姁E
              setTimeout(() => startUploadQueue(), 500);
              resolve(response.access_token);
            }
          });
          client.requestAccessToken({ prompt: interactive ? 'select_account' : '' });
        } catch (e) {
          reject(e);
        }
      });
    }

    async function testGoogleDriveAuth() {
      try {
        const token = await requestGoogleDriveAccessToken(true);
        if (token) {
          showRecordToast("Notification");
        }
      } catch (e) {
        alert("Alert");
      }
    }

    // FirestoreへのチE�Eタ保孁E

    async function saveRecordDoc(rec) {
      if (_isSpectatorMode || !currentUser || !_fbReady) return;
      try { await window._firestoreOps.setDoc(window._firestoreOps.doc(window._db, 'users', currentUser.uid, 'records', rec.id.toString()), rec, { merge: true }); await window._firestoreOps.setDoc(window._firestoreOps.doc(window._db, 'users', currentUser.uid, 'data', 'main'), { updatedAt: window._firestoreOps.serverTimestamp(), updatedBy: CLIENT_ID }, { merge: true }); } catch (e) { }
    }
    async function deleteRecordDoc(id) {
      if (_isSpectatorMode || !currentUser || !_fbReady) return;
      try { await window._firestoreOps.deleteDoc(window._firestoreOps.doc(window._db, 'users', currentUser.uid, 'records', id.toString())); await window._firestoreOps.setDoc(window._firestoreOps.doc(window._db, 'users', currentUser.uid, 'data', 'main'), { updatedAt: window._firestoreOps.serverTimestamp(), updatedBy: CLIENT_ID }, { merge: true }); } catch (e) { }
    }
    async function savePartyDoc(party) {
      if (_isSpectatorMode || !currentUser || !_fbReady) return;
      try { await window._firestoreOps.setDoc(window._firestoreOps.doc(window._db, 'users', currentUser.uid, 'parties', party.id.toString()), party, { merge: true }); await window._firestoreOps.setDoc(window._firestoreOps.doc(window._db, 'users', currentUser.uid, 'data', 'main'), { updatedAt: window._firestoreOps.serverTimestamp(), updatedBy: CLIENT_ID }, { merge: true }); } catch (e) { }
    }
    async function deletePartyDoc(id) {
      if (_isSpectatorMode || !currentUser || !_fbReady) return;
      try { await window._firestoreOps.deleteDoc(window._firestoreOps.doc(window._db, 'users', currentUser.uid, 'parties', id.toString())); await window._firestoreOps.setDoc(window._firestoreOps.doc(window._db, 'users', currentUser.uid, 'data', 'main'), { updatedAt: window._firestoreOps.serverTimestamp(), updatedBy: CLIENT_ID }, { merge: true }); } catch (e) { }
    }

    async function saveData() {
      if (_isSpectatorMode) return; // 観戦モード中は保存�E琁E��ブロチE��
      localStorage.setItem('pkm_parties', JSON.stringify(parties));
      localStorage.setItem('pkm_records', JSON.stringify(records));
      localStorage.setItem('pkm_seasons', JSON.stringify(seasons));
      localStorage.setItem('pkm_custom_tags', JSON.stringify(customTags));
      if (!currentUser || !_fbReady) return;
      const { doc, setDoc, deleteField } = window._firestoreOps;
      const db = window._db;
      const uid = currentUser.uid;
      try {
        const payload = {
          seasons,
          customTags,
          updatedAt: window._firestoreOps.serverTimestamp(),
          updatedBy: CLIENT_ID,
          parties: deleteField(),
          records: deleteField()
        };
        const apiKey = getGeminiApiKey();
        if (apiKey) payload.geminiApiKey = apiKey;
        const sdUser = getShowdownUsername();
        if (sdUser) payload.showdownUsername = sdUser;
        const driveFolderId = getDriveFolderId();
        if (driveFolderId) payload.driveFolderId = driveFolderId;
        const driveClientId = getDriveClientId();
        if (driveClientId) payload.driveClientId = driveClientId;

        await setDoc(doc(db, 'users', uid, 'data', 'main'), payload, { merge: true });
        const isEnabled = localStorage.getItem('pkm_share_enabled') === 'true';
        const passcode = localStorage.getItem('pkm_share_passcode');
        if (isEnabled && passcode) {
           await syncShareData(uid, passcode);
        }
        _lastLoadedAt = Date.now();
        // 自刁E��保存した�Eでバナーを消す
        _conflictBannerDismissed = false;
        const b = document.getElementById('conflict-banner');
        if (b) b.classList.remove('show');
      } catch (e) { console.error("Error"); }
    }

    // 他端末の変更を検知してリロードを俁E���E��E力前チェチE��用�E�E
    let _conflictCheckBusy = false;
    let _conflictBannerDismissed = false;
    let _latestRemoteData = null;

    // バナーを表示
    function showConflictBanner() {
      const b = document.getElementById('conflict-banner');
      if (b) b.classList.add('show');
    }
    // バナーを閉じる�E�「✕」押下時。保存時に自動消去もする！E
    function dismissConflictBanner() {
      _conflictBannerDismissed = true;
      const b = document.getElementById('conflict-banner');
      if (b) b.classList.remove('show');
    }

    // 最新チE�Eタ�E�他端末の更新�E�を白画面リロードなしで即座に画面へ反映
    async function applyRemoteData() {
      if (_latestRemoteData) {
        if (_latestRemoteData.parties && Array.isArray(_latestRemoteData.parties)) {
          parties = _latestRemoteData.parties;
          localStorage.setItem('pkm_parties', JSON.stringify(parties));
        }
        if (_latestRemoteData.records && Array.isArray(_latestRemoteData.records)) {
          records = _latestRemoteData.records;
          localStorage.setItem('pkm_records', JSON.stringify(records));
        }
        if (_latestRemoteData.seasons && Array.isArray(_latestRemoteData.seasons)) {
          seasons = _latestRemoteData.seasons;
          localStorage.setItem('pkm_seasons', JSON.stringify(seasons));
        }
        if (_latestRemoteData.customTags && Array.isArray(_latestRemoteData.customTags)) {
          customTags = _latestRemoteData.customTags;
          localStorage.setItem('pkm_custom_tags', JSON.stringify(customTags));
        }
        if (_latestRemoteData.updatedAt && _latestRemoteData.updatedAt.toMillis) {
          _lastLoadedAt = _latestRemoteData.updatedAt.toMillis();
        } else {
          _lastLoadedAt = Date.now();
        }
      } else {
        await loadFromFirestore();
      }
      initRecordFormMeta();
      renderParties();
      renderHistory();
      renderRecordPage();
      dismissConflictBanner();
      showRecordToast("Notification");
    }

    // バックグラウンドで競合チェチE��し、変更があれ�Eバナー表示
    async function bgConflictCheck() {
      if (!currentUser || !_fbReady || _conflictCheckBusy) return;
      if (_conflictBannerDismissed) return;
      _conflictCheckBusy = true;
      try {
        const { doc, getDoc } = window._firestoreOps;
        const snap = await getDoc(doc(window._db, 'users', currentUser.uid, 'data', 'main'));
        if (!snap.exists()) return;
        const data = snap.data();
        if (isRemoteConflict(data)) {
          showConflictBanner();
        }
      } catch (e) {
        // チェチE��失敗�E無要E
      } finally {
        _conflictCheckBusy = false;
      }
    }

    // Firestoreからロード（純粋な読み取りのみ�E�E
    async function loadFromFirestore() {
      if (!currentUser || !_fbReady) return;
      const { doc, getDoc, collection, getDocs } = window._firestoreOps;
      const db = window._db;
      const uid = currentUser.uid;
      try {
        const snap = await getDoc(doc(db, 'users', uid, 'data', 'main'));
        let loadedRecords = [];
        if (snap.exists()) {
          const data = snap.data();
          parties = data.parties || [];
          if (data.records && Array.isArray(data.records)) {
            loadedRecords = data.records;
          }
          localStorage.setItem('pkm_parties', JSON.stringify(parties));

          if (data.seasons && Array.isArray(data.seasons)) {
            seasons = data.seasons;
            localStorage.setItem('pkm_seasons', JSON.stringify(seasons));
          }
          if (data.customTags && Array.isArray(data.customTags)) {
            customTags = data.customTags;
            localStorage.setItem('pkm_custom_tags', JSON.stringify(customTags));
          }

          // Gemini APIキーの同期�E�読み取りのみ�E�E
          if (data.geminiApiKey) {
            localStorage.setItem('pkm_gemini_api_key', data.geminiApiKey);
          }
          updateAiApiKeyUI();

          // Showdownユーザー名�E同期�E�読み取りのみ�E�E
          if (data.showdownUsername !== undefined) {
            localStorage.setItem('pkm_showdown_username', data.showdownUsername || '');
          }
          updateShowdownUserUI();

          // Google Drive設定�E同期�E�読み取りのみ�E�E
          if (data.driveFolderId !== undefined) {
            localStorage.setItem('pkm_drive_folder_id', data.driveFolderId || '');
          }
          if (data.driveClientId !== undefined) {
            localStorage.setItem('pkm_drive_client_id', data.driveClientId || '');
          }
          if (data.videoStorageType !== undefined) {
            localStorage.setItem('pkm_video_storage_type', data.videoStorageType || 'drive');
          }
          updateDriveSettingsUI();

          if (data.shareEnabled !== undefined) {
            localStorage.setItem('pkm_share_enabled', data.shareEnabled);
          }
          if (data.sharePasscode !== undefined) {
            localStorage.setItem('pkm_share_passcode', data.sharePasscode);
          }
          if (typeof updateShareUI === 'function') updateShareUI();

          initRecordFormMeta();

          const ud2 = data.updatedAt;
          _lastLoadedAt = (ud2 && ud2.toMillis) ? ud2.toMillis() : Date.now();
        } else {
          _lastLoadedAt = Date.now();
        }

        // サブコレクション�E�Esers/{uid}/records�E�に記録があれ�E読み込んでマ�Eジ�E�書き込みは絶対に行わなぁE��E
        try {
          const recSnap = await getDocs(collection(db, 'users', uid, 'records'));
          const subRecords = [];
          recSnap.forEach(docSnap => {
            if (docSnap.exists()) {
              subRecords.push(docSnap.data());
            }
          });

          if (subRecords.length > 0) {
            const recordMap = new Map();
            loadedRecords.forEach(r => { if (r && r.id) recordMap.set(r.id, r); });
            subRecords.forEach(r => { if (r && r.id) recordMap.set(r.id, r); });
            records = Array.from(recordMap.values());
            records.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
          } else {
            records = loadedRecords;
          }
        } catch (recErr) {
          records = loadedRecords;
        }

        localStorage.setItem('pkm_records', JSON.stringify(records));

        await dmLoadMasterData();
        // リアルタイム他端末変更リスナ�Eを開姁E
        startConflictPolling();
      } catch (e) { console.error("Error"); }
    }

    // リアルタイム他端末変更リスナ�Eの開姁E
    let _conflictUnsubscribe = null;
    function startConflictPolling() {
      if (_conflictUnsubscribe) return;
      if (!currentUser || !_fbReady) return;
      const { doc, onSnapshot } = window._firestoreOps;
      const db = window._db;
      try {
        _conflictUnsubscribe = onSnapshot(doc(db, 'users', currentUser.uid, 'data', 'main'), (snap) => {
          if (!snap.exists()) return;
          const data = snap.data();
          if (isRemoteConflict(data)) {
            _latestRemoteData = data;
            showConflictBanner();
          } else {
            // 自刁E�E更新時�Eバナーを消す
            if (data.updatedBy === CLIENT_ID) {
              const b = document.getElementById('conflict-banner');
              if (b) b.classList.remove('show');
            }
          }
        });
      } catch (err) {
        console.warn('onSnapshot error:', err);
      }

      // タブ復帰時にもチェチE��
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) bgConflictCheck();
      });
    }

    // 認証トグル
    async function toggleAuth() {
      if (currentUser) {
        await window._signOut(window._auth);
      } else {
        const provider = new window._GoogleAuthProvider();
        try {
          await window._signInWithPopup(window._auth, provider);
        } catch (e) { console.error("Error"); }
      }
    }

    // 起動時にまぁElocalStorage のチE�Eタで 0秒即時描画�E�真っ白を完�E根絶�E�E
    try {
      renderParties();
      renderHistory();
    } catch (e) {
      console.warn('Initial local render skipped:', e);
    }

    // Firebase初期化征E��でAuth監視を開姁E
    function initFirebase() {
      _fbReady = true;
      // 未ログインでも�E通�EスタチE�Eタは非同期バチE��グラウンドで読み込む�E�画面をブロチE��しなぁE��E
      setTimeout(() => { dmLoadMasterData().catch(console.warn); }, 50);
      window._onAuthStateChanged(window._auth, async (user) => {
        currentUser = user;
        const nameEl = document.getElementById('user-name');
        const btnEl = document.getElementById('auth-btn');
        const banner = document.getElementById('login-banner');
        // 編雁EIの表示制御�E�管琁E��E�Eみ表示�E�E
        const isAdm = isAdmin(user);
        document.querySelectorAll('.dm-admin-only').forEach(el => {
          el.style.display = isAdm ? '' : 'none';
        });
        // 非管琁E��E��け「権限なし」メチE��ージの表示制御
        const noPermEl = document.getElementById('dm-no-permission');
        if (noPermEl) noPermEl.style.display = isAdm ? 'none' : 'block';
        if (user) {
          nameEl.textContent = user.displayName || user.email;
          btnEl.textContent = 'ログアウチE;
          banner.style.display = 'none';
          await loadFromFirestore();
          renderParties();
          renderHistory();
        } else {
          nameEl.textContent = '';
          btnEl.textContent = 'ログイン';
          banner.style.display = 'block';
        }
      });
    }

    // Firebase準備完亁E��ベント征E��
    if (window._firebaseReady) {
      initFirebase();
    } else {
      document.addEventListener('firebase-ready', initFirebase);
    }

    // ---- NAVIGATION ----
    function showPage(name, btn) {
      document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
        p.style.display = '';
      });
      document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
      const targetPage = document.getElementById('page-' + name);
      if (targetPage) {
        targetPage.classList.add('active');
        targetPage.style.display = '';
      }
      if (btn) btn.classList.add('active');
      else if (event && event.target) event.target.classList.add('active');
      // 記録・履歴・チE�Eタ管琁E��の遷移時�Eコピ�Eボ�Eドを消去
      if (['record', 'history', 'datamanage'].includes(name)) clearCopyBoard();
      if (name === 'parties') { renderParties(); showCopyBoard(); }
      if (name === 'record') renderRecordPage();
      if (name === 'history') renderHistory();
      if (name === 'datamanage') {
        renderDmSeasons();
        renderDmTags();
        updateShowdownUserUI();
        dmType = null; dmAction = null;
        ['dm-tab-pokemon', 'dm-tab-move', 'dm-tab-item', 'dm-btn-list', 'dm-btn-search'].forEach(id => { const el = document.getElementById(id); if (el) el.className = 'btn btn-ghost'; });
        document.getElementById('dm-action-area').style.display = 'none';
        document.getElementById('dm-form-card').style.display = 'none';
        document.getElementById('dm-search-area').style.display = 'none';
        document.getElementById('dm-list-card').style.display = 'none';
      }
    }

    // ---- AUTOCOMPLETE ----
    const BALL_ICON_SRC = 'assets/ball.png';

    function createPokemonSlot(containerId, index, label) {
      const wrap = document.createElement('div');
      wrap.className = 'pokemon-slot';
      wrap.innerHTML = `
    <div class="slot-label">${label}</div>
    <button class="slot-picker-btn" onclick="openPokemonPicker(this)" tabindex="-1" title="アイコンから選ぶ"
      id="picker-btn-${containerId}-${index}">
      <img src="${BALL_ICON_SRC}" alt="選ぶ" class="ball-img">
      <span class="poke-sprite" style="display:none"></span>
    </button>
    <div class="slot-input-wrap" style="position:relative">
      <input type="text" placeholder="ポケモン名を入劁E autocomplete="off"
        data-container="${containerId}" data-index="${index}"
        oninput="onSlotInput(this)" onkeydown="onSlotKeydown(event, this)"
        onfocus="onSlotFocus(this)">
      <button class="slot-clear" onclick="clearSlot(this)" tabindex="-1">ÁE/button>
      <div class="autocomplete-list" id="ac-${containerId}-${index}"></div>
    </div>
  `;

      return wrap;
    }

        function toHiragana(str) {
      return str.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
    }
    function toKatakana(str) {
      return str.replace(/[ぁEゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
    }

    function onSlotInput(input) {
      const val = input.value.trim();
      const listId = `ac-${input.dataset.container}-${input.dataset.index}`;
      const list = document.getElementById(listId);
      if (!val || val.length < 1) { list.classList.remove('open'); return; }
      const valKana = toKatakana(val);
      const valHira = toHiragana(val);
      // 選出スロチE��はパ�EチE��から絞り込む
      let pokemonSource;
      if (input.dataset.container === 'opp-selection-slots' && window._oppPartyOptions && window._oppPartyOptions.length) {
        pokemonSource = window._oppPartyOptions.map(name => ({ display: name, confirmed: true, no: '', type1: '', type2: '' }));
      } else if (input.dataset.container === 'my-selection-slots' && window._myPartyOptions && window._myPartyOptions.length) {
        pokemonSource = window._myPartyOptions.map(name => ({ display: name, confirmed: true, no: '', type1: '', type2: '' }));
      } else {
        pokemonSource = (localPokemon || POKEMON_LIST).filter(p => p.confirmed);
      }
      // 相手パーチE��スロチE��ではメガシンカを除夁E
      const acExcludeMega = input.dataset.container === 'opp-party-slots';

      const allMatches = pokemonSource.filter(p => {
        if (acExcludeMega && isMegaForm(p)) return false;
        const d = p.display;
        const dH = toHiragana(d);
        return d.includes(valKana) || dH.includes(valHira);
      });
      // 頭斁E��一致を�Eに、E��中一致を後に並べめE
      const startsWith = allMatches.filter(p => {
        const dH = toHiragana(p.display);
        return dH.startsWith(valHira) || p.display.startsWith(valKana);
      });
      const others = allMatches.filter(p => {
        const dH = toHiragana(p.display);
        return !dH.startsWith(valHira) && !p.display.startsWith(valKana);
      });
      // 吁E��ループ�Eで最近選んだも�Eを�E頭に
      const matches = [...sortByRecent(startsWith), ...sortByRecent(others)].slice(0, 20);
      if (!matches.length) { list.classList.remove('open'); return; }
      list.innerHTML = matches.map(p =>
        `<div class="autocomplete-item" data-display="${p.display}">${p.display}</div>`
      ).join('');
      // mousedownでクリチE��選択！Enputのblur前に発火する�E�E
      list.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('mousedown', e => {
          e.preventDefault();
          input.value = item.dataset.display;
          recordRecentPick(item.dataset.display);
          updateSlotIcon(input, item.dataset.display);
          list.classList.remove('open');
          // 相手パーチE��スロチE��で選択したら選出プルダウンを更新
          if (input.dataset.container === 'opp-party-slots') rebuildOppSelectionDropdowns();
        });
      });
      list.classList.add('open');
    }

    function onSlotKeydown(e, input) {
      const listId = `ac-${input.dataset.container}-${input.dataset.index}`;
      const list = document.getElementById(listId);
      const items = list.querySelectorAll('.autocomplete-item');
      const current = list.querySelector('.selected');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!current) items[0]?.classList.add('selected');
        else { current.classList.remove('selected'); (current.nextElementSibling || items[0])?.classList.add('selected'); }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (current) { current.classList.remove('selected'); (current.previousElementSibling || items[items.length - 1])?.classList.add('selected'); }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const sel = list.querySelector('.selected') || items[0];
        if (sel) {
          input.value = sel.dataset.display; list.classList.remove('open');
          recordRecentPick(sel.dataset.display);
          updateSlotIcon(input, sel.dataset.display);
          if (input.dataset.container === 'opp-party-slots') rebuildOppSelectionDropdowns();
        }
      } else if (e.key === 'Escape') {
        list.classList.remove('open');
      }
    }

    function selectPokemon(el, listId) {
      const list = document.getElementById(listId);
      const input = list.closest('.slot-input-wrap').querySelector('input[type=text]');
      if (input) input.value = el.dataset.display;
      list.classList.remove('open');
    }

    function clearSlot(btn) {
      const input = btn.closest('.slot-input-wrap').querySelector('input[type=text]');
      input.value = '';
      updateSlotIcon(input, '');
      if (input.dataset.container === 'opp-party-slots') rebuildOppSelectionDropdowns();
    }

    // フォーカス時に予測変換を即座に表示�E�空でも最近選んだ頁E��表示�E�E
    function onSlotFocus(input) {
      const listId = `ac-${input.dataset.container}-${input.dataset.index}`;
      const list = document.getElementById(listId);
      if (!list) return;
      if (input.value.trim()) {
        // 斁E��が入ってぁE��場合�E通常のフィルタ
        onSlotInput(input);
        return;
      }
      // 空の場吁E パ�EチE��候裁Eor 最近選んだ頁E��最大10件表示
      let candidates;
      const cid = input.dataset.container;
      if (cid === 'opp-selection-slots' && window._oppPartyOptions && window._oppPartyOptions.length) {
        candidates = window._oppPartyOptions.map(n => ({ display: n, no: '', type1: '', type2: '' }));
      } else if (cid === 'my-selection-slots' && window._myPartyOptions && window._myPartyOptions.length) {
        candidates = window._myPartyOptions.map(n => ({ display: n, no: '', type1: '', type2: '' }));
      } else {
        const focusExcludeMega = cid === 'opp-party-slots';
        const src = (localPokemon || POKEMON_LIST).filter(p => {
          if (!p.confirmed) return false;
          if (focusExcludeMega && isMegaForm(p)) return false;
          return true;
        });
        candidates = sortByRecent(src).slice(0, 10);
      }
      if (!candidates.length) return;
      list.innerHTML = candidates.map(p =>
        `<div class="autocomplete-item" data-display="${p.display}">${p.display}</div>`
      ).join('');
      list.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('mousedown', e => {
          e.preventDefault();
          input.value = item.dataset.display;
          recordRecentPick(item.dataset.display);
          updateSlotIcon(input, item.dataset.display);
          list.classList.remove('open');
        });
      });
      list.classList.add('open');
    }

    // 選出用プルダウン生�E�E��E刁E相手�Eパ�EチE��6体�Eみ�E�E
    function createSelectionDropdown(containerId, index, label, options) {
      const wrap = document.createElement('div');
      wrap.className = 'pokemon-slot';
      const opts = options.filter(Boolean).map(p => `<option value="${p}">${p}</option>`).join('');
      wrap.innerHTML = `
    <div class="slot-label">${label}</div>
    <select data-container="${containerId}" data-index="${index}">
      <option value="">-- 選抁E--</option>
      ${opts}
    </select>
  `;
      return wrap;
    }

    document.addEventListener('click', e => {
      // pe-col-item-ability(持ち物) / pe-name-cell(ポケモン吁E 冁E�EクリチE��はPEのACを閉じなぁE
      const inPeItemArea = e.target.closest('.pe-col-item-ability') || e.target.closest('.pe-name-input-wrap');
      if (!e.target.closest('.pokemon-slot') && !inPeItemArea) {
        // opp-party-ac / my-sel-ac / pe用ACは除外しなぁE Eすべて閉じる！EE冁E�E上で守る�E�E
        document.querySelectorAll('.autocomplete-list:not(.opp-party-ac):not(.my-sel-ac)').forEach(l => l.classList.remove('open'));
      }
    });

    function getSlotValues(containerId, count) {
      if (containerId === 'my-selection-slots') {
        const party = parties.find(p => p.id === selectedPartyId);
        const myPokemon = party ? party.pokemon : [];
        const result = [];
        for (let i = 0; i < (count || 4); i++) {
          if (i < mySelectionOrder.length) {
            const slotIdx = mySelectionOrder[i];
            const pk = myPokemon[slotIdx];
            const name = (typeof pk === 'string' ? pk : (pk && pk.name || '')) || '';
            result.push(name);
          } else {
            result.push('');
          }
        }
        return result;
      }
      if (containerId === 'opp-selection-slots') {
        const oppInputs = document.querySelectorAll('#opp-party-slots input[type=text]');
        const oppPokemon = Array.from(oppInputs).map(inp => inp.value.trim());
        const result = [];
        for (let i = 0; i < (count || 4); i++) {
          if (i < oppSelectionOrder.length) {
            const slotIdx = oppSelectionOrder[i];
            const name = oppPokemon[slotIdx] || '';
            result.push(name);
          } else {
            result.push('');
          }
        }
        return result;
      }

      const container = document.getElementById(containerId);
      if (!container) return [];
      // input[type=text] と select 両方に対忁E
      const inputs = Array.from(container.querySelectorAll('input[type=text], select'));
      return inputs.slice(0, count).map(i => i.value.trim());
    }

    function setSlotValues(containerId, values) {
      const container = document.getElementById(containerId);
      const inputs = container.querySelectorAll('input[type=text]');
      values.forEach((v, i) => {
        if (inputs[i]) {
          inputs[i].value = v;
          updateSlotIcon(inputs[i], v);
        }
      });
    }

    // ---- FILTER SELECTS ----
    function updateMySelFilterSelect() { /* チE��スチEC方式に変更のため不要E*/ }

    // 相手�E選出フィルター: 全試合�E相手選出から重褁E��去して選択肢を生戁E
    function updateOppSelFilterSelect() { /* 廁E��: チE��スチEC方式に変更 */ }

    function addFilterTagFromSelect(selectEl, filterKey) {
      const name = selectEl.value;
      if (!name) return;
      selectEl.value = ''; // 選択後リセチE��
      addFilterTag(name, filterKey);
    }

    function addFilterTag(name, filterKey) {
      const arr = filterKey === 'mySelFilter' ? mySelFilter : oppSelFilter;
      if (arr.includes(name)) return;
      arr.push(name);
      renderFilterTags(filterKey);
      renderHistory();
    }

    function removeFilterTag(name, filterKey) {
      const arr = filterKey === 'mySelFilter' ? mySelFilter : oppSelFilter;
      const idx = arr.indexOf(name);
      if (idx >= 0) arr.splice(idx, 1);
      renderFilterTags(filterKey);
      renderHistory();
    }

    function renderFilterTags(filterKey) {
      const arr = filterKey === 'mySelFilter' ? mySelFilter : oppSelFilter;
      const containerId = filterKey === 'mySelFilter' ? 'my-sel-filter-tags' : 'opp-sel-filter-tags';
      const container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = arr.map(name =>
        `<span class="filter-tag">${name}<button onclick="removeFilterTag('${name}','${filterKey}')" title="削除">ÁE/button></span>`
      ).join('');
    }

    // ---- PARTIES (無限スクロール�E�E��アルタイム検索対忁E ----

    function onPartySearchInput(val) {
      _partySearchQuery = (val || '').trim().toLowerCase();
      const clearBtn = document.getElementById('party-search-clear');
      if (clearBtn) clearBtn.style.display = _partySearchQuery ? 'block' : 'none';
      renderParties();
    }

    function clearPartySearch() {
      _partySearchQuery = '';
      const input = document.getElementById('party-search-input');
      if (input) input.value = '';
      const clearBtn = document.getElementById('party-search-clear');
      if (clearBtn) clearBtn.style.display = 'none';
      renderParties();
    }

    function initPartyGridDelegation() {
      if (_partyGridBound) return;
      const grid = document.getElementById('party-grid');
      if (!grid) return;
      _partyGridBound = true;

      // クリチE��イベント�E雁E��E��イベント移譲: 1つのリスナ�Eですべてのボタンとカード操作を判別�E�E
      grid.addEventListener('click', (e) => {
        const memoBtn = e.target.closest('.party-memo-btn');
        if (memoBtn) {
          e.stopPropagation();
          openPartyMemo(memoBtn.dataset.partyId);
          return;
        }

        const aiBtn = e.target.closest('.party-ai-edit-btn');
        if (aiBtn) {
          e.stopPropagation();
          openAiPartyModal(aiBtn.dataset.partyId);
          return;
        }

        const copyBtn = e.target.closest('.party-copy-btn');
        if (copyBtn) {
          e.stopPropagation();
          copyParty(copyBtn.dataset.partyId);
          return;
        }

        const deleteBtn = e.target.closest('.party-delete-btn');
        if (deleteBtn) {
          e.stopPropagation();
          deleteParty(deleteBtn.dataset.partyId);
          return;
        }

        // カード本体タチE�E時（�Eタン以外）に編雁E��ーダルを開ぁE
        const card = e.target.closest('.party-card');
        if (card && !e.target.closest('button')) {
          editParty(card.dataset.partyId);
        }
      });
    }

    function renderPartyCardHTML(p) {
      const pokeNames = p.pokemon.map(pk => typeof pk === 'string' ? pk : (pk && pk.name || ''));
      return `
    <div class="party-card" data-party-id="${p.id}">
      <div class="flex justify-between items-center mb-3" style="gap:6px">
        <div class="party-name party-edit-trigger" data-party-id="${p.id}" style="cursor:pointer;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0" title="${p.name}">${p.name}</div>
        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
          <button class="party-action-icon-btn party-memo-btn ${p.memo ? 'has-memo' : ''}" data-party-id="${p.id}" title="${p.memo ? 'メモあり (編雁E' : 'メモを追加'}">📝</button>
          <button class="party-action-icon-btn party-ai-edit-btn" data-party-id="${p.id}" title="画像から編雁E>📸</button>
          <button class="party-action-icon-btn party-copy-btn" data-party-id="${p.id}" title="パ�EチE��をコピ�E">📋</button>
          <button class="party-action-icon-btn party-delete-btn" data-party-id="${p.id}" title="パ�EチE��を削除">🗑�E�E/button>
        </div>
      </div>
      <div class="party-pokemon party-edit-trigger" data-party-id="${p.id}" style="cursor:pointer">
        ${pokeNames.filter(Boolean).map(pk => getPokeSpriteHTMLByDisplay(pk)).join('')}
      </div>
    </div>`;
    }

    function appendMoreParties() {
      if (_partyCurrentRenderedCount >= _partyFilteredCache.length) return;
      const grid = document.getElementById('party-grid');
      const nextItems = _partyFilteredCache.slice(_partyCurrentRenderedCount, _partyCurrentRenderedCount + PARTY_PAGE_SIZE);
      _partyCurrentRenderedCount += nextItems.length;

      const sentinel = document.getElementById('party-sentinel');
      if (sentinel) sentinel.remove();

      const html = nextItems.map(renderPartyCardHTML).join('');
      grid.insertAdjacentHTML('beforeend', html);

      if (_partyCurrentRenderedCount < _partyFilteredCache.length) {
        setupPartySentinel(grid);
      }
    }

    function setupPartySentinel(grid) {
      const sentinel = document.createElement('div');
      sentinel.id = 'party-sentinel';
      sentinel.style.padding = '14px 0';
      sentinel.style.textAlign = 'center';
      sentinel.style.color = 'var(--text-muted)';
      sentinel.style.fontSize = '12px';
      sentinel.style.gridColumn = '1 / -1';
      sentinel.textContent = `パ�EチE��をさらに読み込み中... (${_partyCurrentRenderedCount} / ${_partyFilteredCache.length}件)`;
      grid.appendChild(sentinel);

      if (!_partyObserver) {
        _partyObserver = new IntersectionObserver((entries) => {
          if (entries[0] && entries[0].isIntersecting) {
            appendMoreParties();
          }
        }, { rootMargin: '300px' });
      } else {
        _partyObserver.disconnect();
      }
      _partyObserver.observe(sentinel);
    }

    function renderParties() {
      const grid = document.getElementById('party-grid');
      if (!grid) return;
      initPartyGridDelegation();

      if (!parties.length) {
        grid.innerHTML = '<div class="empty"><div class="empty-icon">🎮</div><p>パ�EチE��がまだありません</p><p>右上�Eボタンから登録してください</p></div>';
        return;
      }

      // 検索絞り込み�E�パーチE��名また�E含まれるポケモン名！E
      let filtered = parties;
      if (_partySearchQuery) {
        filtered = parties.filter(p => {
          const matchName = (p.name || '').toLowerCase().includes(_partySearchQuery);
          if (matchName) return true;
          const pokeNames = p.pokemon.map(pk => typeof pk === 'string' ? pk : (pk && pk.name || '')).filter(Boolean);
          return pokeNames.some(pn => pn.toLowerCase().includes(_partySearchQuery));
        });
      }

      _partyFilteredCache = filtered;

      if (!filtered.length) {
        grid.innerHTML = '<div class="empty"><div class="empty-icon">🔍</div><p>一致するパ�EチE��が見つかりません</p></div>';
        return;
      }

      // 初期30件のみを描画�E�何百パ�EチE��あっても一瞬で完亁E��E
      const initialItems = filtered.slice(0, PARTY_PAGE_SIZE);
      _partyCurrentRenderedCount = initialItems.length;
      grid.innerHTML = initialItems.map(renderPartyCardHTML).join('');

      if (_partyCurrentRenderedCount < filtered.length) {
        setupPartySentinel(grid);
      }

      // PC環墁E�EみドラチE��&ドロチE�E並び替えを初期化（検索時�E無効�E�E
      if (!_partySearchQuery && !('ontouchstart' in window)) {
        initPartyDragSort(grid);
      }
      // コピ�Eボ�Eドを先頭に表示
      showCopyBoard();
    }

    function openPartyModal(id) {
      editingPartyId = id || null;
      const modal = document.getElementById('party-modal');
      document.getElementById('party-modal-title').textContent = id ? 'パ�EチE��を編雁E : 'パ�EチE��を登録';
      const slotsEl = document.getElementById('party-modal-slots');
      slotsEl.innerHTML = '';
      for (let i = 0; i < 6; i++) {
        slotsEl.appendChild(createPokemonSlot('party-modal-slots', i, `${i + 1}体目`));
      }
      document.getElementById('party-name-input').value = '';
      if (id) {
        const p = parties.find(x => x.id === id);
        if (p) {
          document.getElementById('party-name-input').value = p.name;
          setSlotValues('party-modal-slots', p.pokemon.map(pk => typeof pk === 'string' ? pk : (pk && pk.name || '')));
        }
      }
      modal.classList.add('open');
    }

    function closePartyModal() {
      document.getElementById('party-modal').classList.remove('open');
    }

    function saveParty() {
      const name = document.getElementById('party-name-input').value.trim();
      if (!name) { alert("Alert"); return; }
      const pokemon = getSlotValues('party-modal-slots', 6);
      if (!pokemon.some(Boolean)) { alert("Alert"); return; }
      // ② 同名チェチE���E�編雁E��のパ�EチE��自身は除く！E
      const dup = parties.find(p => p.name === name && p.id !== editingPartyId);
      if (dup) { alert("Alert"); return; }
      if (editingPartyId) {
        const idx = parties.findIndex(p => p.id === editingPartyId);
        if (idx >= 0) { parties[idx].name = name; parties[idx].pokemon = pokemon; } savePartyDoc(parties[idx]);
      } else {
        // ③ 新規�E先頭に追加
        parties.unshift({ id: Date.now().toString(), name, pokemon }); parties.forEach((p,i)=>{p.order=i; savePartyDoc(p);});
      }
      saveData();
      closePartyModal();
      renderParties();
      renderRecordPage();
    }

    function editParty(id) {
      openPartyModal(id);
    }

    function deleteParty(id) {
      if (!confirm("Confirm?")) return;
      parties = parties.filter(p => p.id !== id); deletePartyDoc(id);
      saveData();
      renderParties();
    }

    // ---- RECORD PAGE ----
    let currentRecordFormat = 'bo1'; // 'bo1' | 'bo3'
    let currentRecordSourceMode = 'champions'; // 'champions' | 'showdown'
    let editingRecordId = null;
    let mySelectionOrder = [];
    let oppSelectionOrder = [];

    // BO3用ゲームチE�Eタ�E�各試合�E選出と勝敗�E�E
    let bo3Games = [
      { mySelectionOrder: [], oppSelectionOrder: [], result: null },
      { mySelectionOrder: [], oppSelectionOrder: [], result: null },
      { mySelectionOrder: [], oppSelectionOrder: [], result: null }
    ];

    // ===== レギュレーション・シーズン・形式�Eタグ付けロジチE�� =====
    function initRecordFormMeta() {
      // 1. レギュレーションの初期匁E
      const regSel = document.getElementById('rec-regulation');
      if (regSel) {
        if (currentRecordRegulation === null || currentRecordRegulation === undefined || currentRecordRegulation === '') {
          currentRecordRegulation = (regulationsData && regulationsData.latest) ? regulationsData.latest : '';
        }
        initRegulationSelect('rec-regulation', currentRecordRegulation);
      }

      // 2. シーズンの初期匁E
      const seasonSel = document.getElementById('rec-season');
      if (seasonSel) {
        if (currentRecordSeason === null || currentRecordSeason === undefined || currentRecordSeason === '') {
          currentRecordSeason = (seasons && seasons.length > 0) ? seasons[0] : '';
        }
        initSeasonSelect('rec-season', currentRecordSeason);
      }

      // 3. 形式�E初期匁E
      setRecordMatchType(currentRecordMatchType || 'ランクチE);

      // 4. タグの初期匁E
      renderRecordTagChips();

      // 5. 履歴フィルターのレギュ・シーズン・タグ更新
      initRegulationSelect('history-reg-filter', document.getElementById('history-reg-filter')?.value || '', true);
      initSeasonSelect('history-season-filter', document.getElementById('history-season-filter')?.value || '', true);
      renderHistoryTagChips();
    }

    function initRegulationSelect(selectId, selectedVal, isFilter = false) {
      const sel = document.getElementById(selectId);
      if (!sel) return;
      const list = (regulationsData && regulationsData.list) ? regulationsData.list : [];
      let html = '';
      if (isFilter) {
        html += '<option value="">すべて</option>';
        html += '<option value="__none__"' + (selectedVal === '__none__' ? ' selected' : '') + '>記載なぁE/option>';
      } else {
        html += '<option value="">記載なぁE/option>';
      }
      list.forEach(r => {
        const isSel = (r === selectedVal) ? ' selected' : '';
        html += `<option value="${r}"${isSel}>${r}</option>`;
      });
      sel.innerHTML = html;
    }

    function onRecordRegulationChange(val) {
      currentRecordRegulation = val;
      localStorage.setItem('pkm_last_regulation', val);
    }

    function initSeasonSelect(selectId, selectedVal, isFilter = false) {
      const sel = document.getElementById(selectId);
      if (!sel) return;
      let html = '';
      if (isFilter) {
        html += '<option value="">すべて</option>';
        html += '<option value="__none__"' + (selectedVal === '__none__' ? ' selected' : '') + '>記載なぁE/option>';
      } else {
        html += '<option value="">記載なぁE/option>';
      }
      seasons.forEach(s => {
        const isSel = (s === selectedVal) ? ' selected' : '';
        html += `<option value="${s}"${isSel}>${s}</option>`;
      });
      sel.innerHTML = html;
    }

    function onRecordSeasonChange(val) {
      currentRecordSeason = val;
      localStorage.setItem('pkm_last_season', val);
    }

    let editingSeasonName = null;
    let _draggedSeasonIdx = null;

    function renderDmSeasons() {
      const listEl = document.getElementById('dm-seasons-list');
      if (!listEl) return;
      if (!seasons || seasons.length === 0) {
        listEl.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px 0">登録されたシーズンがありません</div>';
        return;
      }

      listEl.innerHTML = seasons.map((s, idx) => {
        const safeS = s.replace(/'/g, "\\'");
        const isDefault = (idx === 0);
        return `
          <div class="sortable-item" draggable="true" data-index="${idx}"
            ondragstart="onDmSeasonDragStart(event, ${idx})"
            ondragover="onDmSeasonDragOver(event, ${idx})"
            ondragleave="onDmSeasonDragLeave(event, ${idx})"
            ondrop="onDmSeasonDrop(event, ${idx})"
            ondragend="onDmSeasonDragEnd(event)">
            <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
              <span class="drag-handle" title="ドラチE��して並び替ぁE>☰</span>
              <span style="font-size:14px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">📅 ${s}</span>
              ${isDefault ? '<span style="font-size:10px;background:var(--accent);color:#fff;padding:1px 6px;border-radius:4px;font-weight:700;white-space:nowrap">最新(チE��ォルチE</span>' : ''}
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0">
              <button type="button" class="btn btn-ghost btn-sm" onclick="editSeason('${safeS}')" style="padding:3px 8px;font-size:12px">✏︁E編雁E/button>
              <button type="button" class="btn btn-ghost btn-sm" onclick="deleteSeason('${safeS}')" style="padding:3px 8px;font-size:12px;color:#ef4444">🗑�E�E削除</button>
            </div>
          </div>
        `;
      }).join('');
    }

    function onDmSeasonDragStart(e, idx) {
      _draggedSeasonIdx = idx;
      e.currentTarget.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', idx);
      }
    }

    function onDmSeasonDragOver(e, idx) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      const target = e.currentTarget;
      const rect = target.getBoundingClientRect();
      const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
      target.classList.toggle('drag-over-top', !next);
      target.classList.toggle('drag-over-bottom', next);
    }

    function onDmSeasonDragLeave(e, idx) {
      e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
    }

    function onDmSeasonDrop(e, targetIdx) {
      e.preventDefault();
      const target = e.currentTarget;
      target.classList.remove('drag-over-top', 'drag-over-bottom');
      if (_draggedSeasonIdx === null || _draggedSeasonIdx === undefined) return;
      const fromIdx = _draggedSeasonIdx;
      const rect = target.getBoundingClientRect();
      const isAfter = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
      let toIdx = targetIdx;
      if (isAfter && fromIdx > targetIdx) toIdx = targetIdx + 1;
      else if (!isAfter && fromIdx < targetIdx) toIdx = targetIdx - 1;
      if (toIdx < 0) toIdx = 0;
      if (toIdx >= seasons.length) toIdx = seasons.length - 1;

      if (fromIdx !== toIdx) {
        const [moved] = seasons.splice(fromIdx, 1);
        seasons.splice(toIdx, 0, moved);
        // 一番上！Endex 0�E�が最新�E�デフォルチE
        if (seasons.length > 0) {
          currentRecordSeason = seasons[0];
          localStorage.setItem('pkm_last_season', seasons[0]);
        }
        saveData();
        renderDmSeasons();
        initSeasonSelect('rec-season', currentRecordSeason);
        initSeasonSelect('history-season-filter', document.getElementById('history-season-filter')?.value || '', true);
        showRecordToast("Notification");
      }
    }

    function onDmSeasonDragEnd(e) {
      _draggedSeasonIdx = null;
      document.querySelectorAll('#dm-seasons-list .sortable-item').forEach(el => {
        el.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom');
      });
    }

    function openCreateSeasonModal() {
      editingSeasonName = null;
      const titleEl = document.getElementById('new-season-modal-title');
      if (titleEl) titleEl.textContent = '📅 新規シーズンの登録';
      const btnEl = document.getElementById('btn-save-season-modal');
      if (btnEl) btnEl.textContent = '登録';

      const inp = document.getElementById('new-season-name-input');
      if (inp) inp.value = '';
      const modal = document.getElementById('new-season-modal');
      if (modal) modal.style.display = 'flex';
      setTimeout(() => { inp?.focus(); }, 50);
    }

    function editSeason(name) {
      editingSeasonName = name;
      const titleEl = document.getElementById('new-season-modal-title');
      if (titleEl) titleEl.textContent = '📅 シーズンの編雁E;
      const btnEl = document.getElementById('btn-save-season-modal');
      if (btnEl) btnEl.textContent = '更新';

      const inp = document.getElementById('new-season-name-input');
      if (inp) inp.value = name;
      const modal = document.getElementById('new-season-modal');
      if (modal) modal.style.display = 'flex';
      setTimeout(() => { inp?.focus(); }, 50);
    }

    function closeCreateSeasonModal() {
      const modal = document.getElementById('new-season-modal');
      if (modal) modal.style.display = 'none';
      editingSeasonName = null;
    }

    function saveNewSeason() {
      const inp = document.getElementById('new-season-name-input');
      const name = (inp?.value || '').trim();
      if (!name) { alert("Alert"); return; }

      if (editingSeasonName) {
        const oldName = editingSeasonName;
        const idx = seasons.indexOf(oldName);
        if (idx !== -1) {
          seasons[idx] = name;
        } else if (!seasons.includes(name)) {
          seasons.unshift(name);
        }
        if (records && records.length) {
          records.forEach(r => {
            if (r.season === oldName) r.season = name;
          });
        }
        if (currentRecordSeason === oldName) {
          currentRecordSeason = name;
        }
        editingSeasonName = null;
        showRecordToast("Notification");
      } else {
        // 新規登録は先頭に追加�E�＝最新・チE��ォルト！E
        seasons = seasons.filter(s => s !== name);
        seasons.unshift(name);
        currentRecordSeason = name;
        showRecordToast("Notification");
      }

      localStorage.setItem('pkm_last_season', currentRecordSeason);
      saveData();
      initSeasonSelect('rec-season', currentRecordSeason);
      initSeasonSelect('history-season-filter', document.getElementById('history-season-filter')?.value || '', true);
      renderDmSeasons();
      closeCreateSeasonModal();
    }

    function deleteSeason(name) {
      if (!confirm("Confirm?")) return;
      seasons = seasons.filter(s => s !== name);
      if (currentRecordSeason === name) {
        currentRecordSeason = (seasons.length > 0) ? seasons[0] : '';
        localStorage.setItem('pkm_last_season', currentRecordSeason);
      }
      saveData();
      initSeasonSelect('rec-season', currentRecordSeason);
      initSeasonSelect('history-season-filter', document.getElementById('history-season-filter')?.value || '', true);
      renderDmSeasons();
      showRecordToast("Notification");
    }

    function setRecordMatchType(type) {
      currentRecordMatchType = type;
      localStorage.setItem('pkm_last_match_type', type);

      const btns = document.querySelectorAll('#rec-match-type-group .match-type-btn');
      btns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
      });

      const tagAc = document.getElementById('rec-tag-ac');
      if (tagAc && tagAc.classList.contains('open')) {
        const input = document.getElementById('rec-tag-input');
        showTagAc(input ? input.value : '');
      }
    }

    function renderRecordTagChips() {
      const container = document.getElementById('rec-tag-chips');
      if (!container) return;
      if (!currentRecordTags || !currentRecordTags.length) {
        container.innerHTML = '';
        return;
      }
      container.innerHTML = currentRecordTags.map(t => `
        <span class="tag-badge">
          <span>🏷�E�E${t}</span>
          <button type="button" class="tag-badge-remove" onclick="event.stopPropagation(); removeRecordTag('${t}')">✁E/button>
        </span>
      `).join('');
    }

    function addRecordTag(name) {
      if (!name) return;
      name = name.trim();
      if (!currentRecordTags.includes(name)) {
        currentRecordTags.push(name);
        localStorage.setItem('pkm_last_tags', JSON.stringify(currentRecordTags));
      }
      renderRecordTagChips();
      const input = document.getElementById('rec-tag-input');
      if (input) {
        input.value = '';
        input.focus();
      }
      closeTagAc();
    }

    function removeRecordTag(name) {
      currentRecordTags = currentRecordTags.filter(t => t !== name);
      localStorage.setItem('pkm_last_tags', JSON.stringify(currentRecordTags));
      renderRecordTagChips();
    }

    function focusTagInput() {
      const input = document.getElementById('rec-tag-input');
      if (input) input.focus();
    }

    function onRecordTagFocus(input) {
      showTagAc(input.value);
    }

    function onRecordTagInput(input) {
      showTagAc(input.value);
    }

    function onRecordTagKeydown(e, input) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const acList = document.getElementById('rec-tag-ac');
        const firstItem = acList ? acList.querySelector('.tag-ac-item') : null;
        if (firstItem && firstItem.dataset.name) {
          addRecordTag(firstItem.dataset.name);
        } else if (input.value.trim()) {
          openCreateTagModal(input.value.trim());
        }
      } else if (e.key === 'Escape') {
        closeTagAc();
      }
    }

    function showTagAc(val) {
      const list = document.getElementById('rec-tag-ac');
      if (!list) return;
      val = (val || '').trim().toLowerCase();

      const currentFmt = currentRecordMatchType || 'ランクチE;
      let availableTags = customTags.filter(t => {
        if (!t.formats || !Array.isArray(t.formats) || t.formats.length === 0) return true;
        return t.formats.includes(currentFmt);
      });

      availableTags = availableTags.filter(t => !currentRecordTags.includes(t.name));

      if (val) {
        availableTags = availableTags.filter(t => t.name.toLowerCase().includes(val));
      }

      let html = '';
      if (availableTags.length > 0) {
        availableTags.forEach(t => {
          const fmts = (t.formats && t.formats.length) ? t.formats.join(', ') : '全形弁E;
          html += `
            <div class="tag-ac-item" data-name="${t.name}" onclick="addRecordTag('${t.name}')">
              <span style="font-weight:600">🏷�E�E${t.name}</span>
              <span style="font-size:11px;color:var(--text-muted)">(${fmts})</span>
            </div>
          `;
        });
      }

      const inputVal = (document.getElementById('rec-tag-input')?.value || '').trim();
      if (inputVal) {
        const exactMatch = customTags.some(t => t.name.toLowerCase() === inputVal.toLowerCase());
        if (!exactMatch) {
          html += `
            <div class="tag-ac-create" onclick="openCreateTagModal('${inputVal}')">
              <span>➁E、E{inputVal}」を新規タグとして作�E...</span>
            </div>
          `;
        }
      } else {
        html += `
          <div class="tag-ac-create" onclick="openCreateTagModal()">
            <span>➁E新規タグを作�E...</span>
          </div>
        `;
      }

      list.innerHTML = html;
      list.classList.add('open');
    }

    function closeTagAc() {
      const list = document.getElementById('rec-tag-ac');
      if (list) list.classList.remove('open');
    }

    document.addEventListener('click', (e) => {
      const box = document.getElementById('rec-tag-container');
      if (box && !box.contains(e.target)) {
        closeTagAc();
      }
      const histBox = document.getElementById('history-tag-container');
      if (histBox && !histBox.contains(e.target)) {
        closeHistoryTagAc();
      }
    });

    let editingTagId = null;
    let _draggedTagIdx = null;

    function renderDmTags() {
      const listEl = document.getElementById('dm-tags-list');
      if (!listEl) return;
      if (!customTags || customTags.length === 0) {
        listEl.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px 0">登録されたタグがありません</div>';
        return;
      }

      listEl.innerHTML = customTags.map((t, idx) => {
        const fmts = (t.formats && t.formats.length) ? t.formats.join(', ') : '全形弁E;
        const safeId = t.id ? t.id.replace(/'/g, "\\'") : '';
        return `
          <div class="sortable-item" draggable="true" data-index="${idx}"
            ondragstart="onDmTagDragStart(event, ${idx})"
            ondragover="onDmTagDragOver(event, ${idx})"
            ondragleave="onDmTagDragLeave(event, ${idx})"
            ondrop="onDmTagDrop(event, ${idx})"
            ondragend="onDmTagDragEnd(event)">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:1;min-width:0">
              <span class="drag-handle" title="ドラチE��して並び替ぁE>☰</span>
              <span style="font-size:14px;font-weight:600;color:var(--text)">🏷�E�E${t.name}</span>
              <span style="font-size:11px;color:var(--text-muted);background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px">形弁E ${fmts}</span>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0">
              <button type="button" class="btn btn-ghost btn-sm" onclick="editTag('${safeId}')" style="padding:3px 8px;font-size:12px">✏︁E編雁E/button>
              <button type="button" class="btn btn-ghost btn-sm" onclick="deleteTag('${safeId}')" style="padding:3px 8px;font-size:12px;color:#ef4444">🗑�E�E削除</button>
            </div>
          </div>
        `;
      }).join('');
    }

    function onDmTagDragStart(e, idx) {
      _draggedTagIdx = idx;
      e.currentTarget.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', idx);
      }
    }

    function onDmTagDragOver(e, idx) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      const target = e.currentTarget;
      const rect = target.getBoundingClientRect();
      const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
      target.classList.toggle('drag-over-top', !next);
      target.classList.toggle('drag-over-bottom', next);
    }

    function onDmTagDragLeave(e, idx) {
      e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
    }

    function onDmTagDrop(e, targetIdx) {
      e.preventDefault();
      const target = e.currentTarget;
      target.classList.remove('drag-over-top', 'drag-over-bottom');
      if (_draggedTagIdx === null || _draggedTagIdx === undefined) return;
      const fromIdx = _draggedTagIdx;
      const rect = target.getBoundingClientRect();
      const isAfter = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
      let toIdx = targetIdx;
      if (isAfter && fromIdx > targetIdx) toIdx = targetIdx + 1;
      else if (!isAfter && fromIdx < targetIdx) toIdx = targetIdx - 1;
      if (toIdx < 0) toIdx = 0;
      if (toIdx >= customTags.length) toIdx = customTags.length - 1;

      if (fromIdx !== toIdx) {
        const [moved] = customTags.splice(fromIdx, 1);
        customTags.splice(toIdx, 0, moved);
        saveData();
        renderDmTags();
        showRecordToast("Notification");
      }
    }

    function onDmTagDragEnd(e) {
      _draggedTagIdx = null;
      document.querySelectorAll('#dm-tags-list .sortable-item').forEach(el => {
        el.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom');
      });
    }

    function openCreateTagModal(initialName = '') {
      editingTagId = null;
      closeTagAc();
      closeHistoryTagAc();

      const titleEl = document.getElementById('new-tag-modal-title');
      if (titleEl) titleEl.textContent = '🏷�E�E新規タグの作�E';
      const btnEl = document.getElementById('btn-save-tag-modal');
      if (btnEl) btnEl.textContent = '作�Eして追加';

      const inp = document.getElementById('new-tag-name-input');
      if (inp) inp.value = initialName;

      const currentFmt = currentRecordMatchType || 'ランクチE;
      const allFmts = ['ランクチE, '公式大企E, '非�E弁E, 'フレ戦', 'showdown'];
      allFmts.forEach(fmt => {
        const cb = document.getElementById(`tag-fmt-${fmt}`);
        if (cb) cb.checked = (fmt === currentFmt);
      });

      const modal = document.getElementById('new-tag-modal');
      if (modal) modal.style.display = 'flex';
      setTimeout(() => { inp?.focus(); }, 50);
    }

    function editTag(id) {
      const tag = customTags.find(t => t.id === id);
      if (!tag) return;
      editingTagId = id;
      closeTagAc();
      closeHistoryTagAc();

      const titleEl = document.getElementById('new-tag-modal-title');
      if (titleEl) titleEl.textContent = '🏷�E�Eタグの編雁E;
      const btnEl = document.getElementById('btn-save-tag-modal');
      if (btnEl) btnEl.textContent = '更新';

      const inp = document.getElementById('new-tag-name-input');
      if (inp) inp.value = tag.name;

      const allFmts = ['ランクチE, '公式大企E, '非�E弁E, 'フレ戦', 'showdown'];
      allFmts.forEach(fmt => {
        const cb = document.getElementById(`tag-fmt-${fmt}`);
        if (cb) cb.checked = (tag.formats && Array.isArray(tag.formats)) ? tag.formats.includes(fmt) : true;
      });

      const modal = document.getElementById('new-tag-modal');
      if (modal) modal.style.display = 'flex';
      setTimeout(() => { inp?.focus(); }, 50);
    }

    function closeCreateTagModal() {
      const modal = document.getElementById('new-tag-modal');
      if (modal) modal.style.display = 'none';
      editingTagId = null;
    }

    function toggleAllTagModalFormats() {
      const allFmts = ['ランクチE, '公式大企E, '非�E弁E, 'フレ戦', 'showdown'];
      const cbs = allFmts.map(fmt => document.getElementById(`tag-fmt-${fmt}`)).filter(Boolean);
      const allChecked = cbs.every(cb => cb.checked);
      cbs.forEach(cb => cb.checked = !allChecked);
      const btn = document.getElementById('btn-toggle-all-tag-formats');
      if (btn) btn.textContent = allChecked ? '全選抁E : '全解除';
    }

    function saveNewTag() {
      const inp = document.getElementById('new-tag-name-input');
      const name = (inp?.value || '').trim();
      if (!name) { alert("Alert"); return; }

      const allFmts = ['ランクチE, '公式大企E, '非�E弁E, 'フレ戦', 'showdown'];
      const selectedFmts = allFmts.filter(fmt => {
        const cb = document.getElementById(`tag-fmt-${fmt}`);
        return cb && cb.checked;
      });

      if (editingTagId) {
        const tag = customTags.find(t => t.id === editingTagId);
        if (tag) {
          const oldName = tag.name;
          tag.name = name;
          tag.formats = selectedFmts;

          if (oldName !== name) {
            if (records && records.length) {
              records.forEach(r => {
                if (r.tags && Array.isArray(r.tags)) {
                  r.tags = r.tags.map(t => t === oldName ? name : t);
                }
              });
            }
            if (currentRecordTags && currentRecordTags.includes(oldName)) {
              currentRecordTags = currentRecordTags.map(t => t === oldName ? name : t);
              localStorage.setItem('pkm_last_tags', JSON.stringify(currentRecordTags));
            }
            if (historyTagFilters && historyTagFilters.includes(oldName)) {
              historyTagFilters = historyTagFilters.map(t => t === oldName ? name : t);
            }
          }
        }
        editingTagId = null;
        showRecordToast("Notification");
      } else {
        const existing = customTags.find(t => t.name === name);
        if (existing) {
          existing.formats = selectedFmts;
        } else {
          customTags.unshift({
            id: 'tag_' + Date.now(),
            name,
            formats: selectedFmts
          });
        }
        addRecordTag(name);
        showRecordToast("Notification");
      }

      saveData();
      renderDmTags();
      renderRecordTagChips();
      renderHistoryTagChips();
      closeCreateTagModal();
    }

    function deleteTag(id) {
      const tag = customTags.find(t => t.id === id);
      if (!tag) return;
      if (!confirm("Confirm?")) return;

      customTags = customTags.filter(t => t.id !== id);
      if (currentRecordTags.includes(tag.name)) {
        currentRecordTags = currentRecordTags.filter(t => t !== tag.name);
        localStorage.setItem('pkm_last_tags', JSON.stringify(currentRecordTags));
      }
      if (historyTagFilters.includes(tag.name)) {
        historyTagFilters = historyTagFilters.filter(t => t !== tag.name);
      }

      saveData();
      renderDmTags();
      renderRecordTagChips();
      renderHistoryTagChips();
      showRecordToast("Notification");
    }

    // 履歴画面のタグフィルター用
    function renderHistoryTagChips() {
      const container = document.getElementById('history-tag-selected-chips');
      if (!container) return;
      if (!historyTagFilters || !historyTagFilters.length) {
        container.innerHTML = '';
        return;
      }
      container.innerHTML = historyTagFilters.map(t => `
        <span class="tag-badge">
          <span>🏷�E�E${t}</span>
          <button type="button" class="tag-badge-remove" onclick="event.stopPropagation(); removeHistoryTagFilter('${t}')">✁E/button>
        </span>
      `).join('');
    }

    function focusHistoryTagInput() {
      const input = document.getElementById('history-tag-filter-input');
      if (input) input.focus();
    }

    function onHistoryTagFilterFocus(input) {
      showHistoryTagAc(input.value);
    }

    function onHistoryTagFilterInput(input) {
      showHistoryTagAc(input.value);
    }

    function onHistoryTagFilterKeydown(e, input) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const acList = document.getElementById('history-tag-filter-ac');
        const firstItem = acList ? acList.querySelector('.tag-ac-item') : null;
        if (firstItem && firstItem.dataset.name) {
          addHistoryTagFilter(firstItem.dataset.name);
        }
      } else if (e.key === 'Escape') {
        closeHistoryTagAc();
      }
    }

    function showHistoryTagAc(val) {
      const list = document.getElementById('history-tag-filter-ac');
      if (!list) return;
      val = (val || '').trim().toLowerCase();

      // 既に選択中のフィルタータグは除夁E
      let availableTags = customTags.filter(t => !historyTagFilters.includes(t.name));

      if (val) {
        availableTags = availableTags.filter(t => t.name.toLowerCase().includes(val));
      }

      let html = '';
      if (availableTags.length > 0) {
        availableTags.forEach(t => {
          const fmts = (t.formats && t.formats.length) ? t.formats.join(', ') : '全形弁E;
          html += `
            <div class="tag-ac-item" data-name="${t.name}" onclick="addHistoryTagFilter('${t.name}')">
              <span style="font-weight:600">🏷�E�E${t.name}</span>
              <span style="font-size:11px;color:var(--text-muted)">(${fmts})</span>
            </div>
          `;
        });
      } else {
        html = '<div style="padding:8px 12px;font-size:12px;color:var(--text-muted)">該当するタグがありません</div>';
      }

      list.innerHTML = html;
      list.classList.add('open');
    }

    function closeHistoryTagAc() {
      const list = document.getElementById('history-tag-filter-ac');
      if (list) list.classList.remove('open');
    }

    function addHistoryTagFilter(tag) {
      if (!tag) return;
      tag = tag.trim();
      if (!historyTagFilters.includes(tag)) {
        historyTagFilters.push(tag);
      }
      renderHistoryTagChips();
      renderHistory();
      const input = document.getElementById('history-tag-filter-input');
      if (input) {
        input.value = '';
        input.focus();
      }
      closeHistoryTagAc();
    }

    function removeHistoryTagFilter(tag) {
      historyTagFilters = historyTagFilters.filter(t => t !== tag);
      renderHistoryTagChips();
      renderHistory();
    }

    function clearHistoryTagFilters() {
      historyTagFilters = [];
      const input = document.getElementById('history-tag-filter-input');
      if (input) input.value = '';
      closeHistoryTagAc();
      renderHistoryTagChips();
      renderHistory();
    }

    function setRecordMode(mode) {
      if (mode === 'showdown') {
        const username = getShowdownUsername();
        if (!username || !username.trim()) {
          alert("Alert");
          return;
        }
      }

      currentRecordSourceMode = mode;
      const btnChamp = document.getElementById('btn-mode-champions');
      const btnShowdown = document.getElementById('btn-mode-showdown');
      if (btnChamp) btnChamp.classList.toggle('active', mode === 'champions');
      if (btnShowdown) btnShowdown.classList.toggle('active', mode === 'showdown');

      const aiBox = document.getElementById('rec-ai-box');
      const showdownBox = document.getElementById('rec-showdown-box');
      if (aiBox) aiBox.style.display = (mode === 'champions') ? 'block' : 'none';
      if (showdownBox) showdownBox.style.display = (mode === 'showdown') ? 'block' : 'none';

      const btns = document.querySelectorAll('#rec-match-type-group .match-type-btn');
      if (mode === 'champions') {
        btns.forEach(btn => {
          if (btn.dataset.type === 'showdown') {
            btn.style.display = 'none';
          } else {
            btn.style.display = 'block';
          }
        });
        if (currentRecordMatchType === 'showdown' || !currentRecordMatchType) {
          setRecordMatchType('ランクチE);
        } else {
          setRecordMatchType(currentRecordMatchType);
        }
      } else {
        btns.forEach(btn => {
          if (btn.dataset.type === 'showdown') {
            btn.style.display = 'block';
          } else {
            btn.style.display = 'none';
          }
        });
        setRecordMatchType('showdown');
      }
    }

    function setRecordFormat(fmt) {
      currentRecordFormat = fmt;
      const btnBo1 = document.getElementById('btn-format-bo1');
      const btnBo3 = document.getElementById('btn-format-bo3');
      if (btnBo1) btnBo1.classList.toggle('active', fmt === 'bo1');
      if (btnBo3) btnBo3.classList.toggle('active', fmt === 'bo3');

      const areaBo1 = document.getElementById('rec-area-bo1');
      const areaBo3 = document.getElementById('rec-area-bo3');
      if (areaBo1) areaBo1.style.display = (fmt === 'bo1') ? 'block' : 'none';
      if (areaBo3) areaBo3.style.display = (fmt === 'bo3') ? 'block' : 'none';

      const sdAreaBo1 = document.getElementById('showdown-url-area-bo1');
      const sdAreaBo3 = document.getElementById('showdown-url-area-bo3');
      if (sdAreaBo1) sdAreaBo1.style.display = (fmt === 'bo1') ? 'block' : 'none';
      if (sdAreaBo3) sdAreaBo3.style.display = (fmt === 'bo3') ? 'block' : 'none';

      if (fmt === 'bo3') {
        renderAllBo3SelectionSlots();
        updateBo3Score();
      }
    }

    // ===== Pokemon Showdown リプレイ解析エンジン =====
    function matchShowdownPokemonName(rawName) {
      if (!rawName) return '';
      const parts = rawName.split(',');
      let species = parts[0].trim();
      let gender = parts.length > 2 ? parts[2].trim() : (parts.length > 1 && (parts[1].trim() === 'M' || parts[1].trim() === 'F') ? parts[1].trim() : '');

      // Floette-Mega は Floette-Eternal に正規化
      if (/^floette-mega/i.test(species)) species = 'Floette-Eternal';
      // メガシンカ・キョダイマックス・ゲンシカイキ・チE��スタルの接尾辞を除去
      species = species.replace(/-Mega(-[XYZxyz])?/i, '');
      species = species.replace(/-Gmax/i, '');
      species = species.replace(/-Primal/i, '');
      species = species.replace(/-(Terastal|Stellar)/i, '');

      // 性別によるすがた違ぁE��Ehowdownで種族名に -F が付かず性別欁E�� F が�Eる場合�E補正�E�E
      if (gender === 'F') {
        const idLower = species.toLowerCase();
        if (idLower === 'basculegion' || idLower === 'indeedee' || idLower === 'meowstic' || idLower === 'oinkologne') {
          species = species + '-F';
        }
      }

      // 1. translation_map.json (translatePokemonToJa) を直接使用
      if (typeof translatePokemonToJa === 'function') {
        const ja = translatePokemonToJa(species);
        if (ja && ja !== species) return ja;

        // ハイフン前（�Eース名）で再試衁E
        const baseName = species.split('-')[0];
        const baseJa = translatePokemonToJa(baseName);
        if (baseJa && baseJa !== baseName) return baseJa;
      }

      // 2. POKEMON_MAP_LIST によるフォールバック
      const id = toTransId(species);
      if (POKEMON_MAP_LIST && POKEMON_MAP_LIST.length) {
        const match = POKEMON_MAP_LIST.find(p => toTransId(p.nameEn) === id);
        if (match && match.nameJa) return match.nameJa;
        const baseId = toTransId(species.split('-')[0]);
        const matchBase = POKEMON_MAP_LIST.find(p => toTransId(p.nameEn) === baseId);
        if (matchBase && matchBase.nameJa) return matchBase.nameJa;
      }

      return species;
    }

    function parseShowdownReplayJson(replayData, myUsername) {
      if (!replayData || !replayData.log) {
        throw new Error("Error");
      }

      const myUserNorm = toTransId(myUsername);
      if (!myUserNorm) {
        throw new Error("Error");
      }

      const lines = replayData.log.split('\n');
      let p1Name = (replayData.players && replayData.players[0]) || '';
      let p2Name = (replayData.players && replayData.players[1]) || '';
      let p1Rating = null, p2Rating = null;

      for (const line of lines) {
        if (line.startsWith('|player|p1|')) {
          const parts = line.split('|');
          if (parts[3] && parts[3].trim()) {
            p1Name = parts[3].trim();
            if (parts[5] && !isNaN(Number(parts[5]))) p1Rating = parts[5].trim();
          }
        } else if (line.startsWith('|player|p2|')) {
          const parts = line.split('|');
          if (parts[3] && parts[3].trim()) {
            p2Name = parts[3].trim();
            if (parts[5] && !isNaN(Number(parts[5]))) p2Rating = parts[5].trim();
          }
        }
      }

      const p1Norm = toTransId(p1Name);
      const p2Norm = toTransId(p2Name);

      let myPlayerId = null;
      let oppPlayerId = null;
      let oppTrainerName = '';

      if (p1Norm === myUserNorm) {
        myPlayerId = 'p1';
        oppPlayerId = 'p2';
        oppTrainerName = p2Name;
      } else if (p2Norm === myUserNorm) {
        myPlayerId = 'p2';
        oppPlayerId = 'p1';
        oppTrainerName = p1Name;
      } else {
        throw new Error("Error");
      }

      // 相手パーチE���E�E体！E
      const oppPartyNames = [];
      for (const line of lines) {
        if (line.startsWith(`|poke|${oppPlayerId}|`)) {
          const parts = line.split('|');
          const rawSpecies = parts[3] || '';
          const jaName = matchShowdownPokemonName(rawSpecies);
          if (jaName && oppPartyNames.length < 6) {
            oppPartyNames.push(jaName);
          }
        }
      }

      // 選出ポケモンの抽出 (繰り�Eされた頁E
      // メガシンカポケモンは繰り�Eし時は通常名でswitch/dragされるため、そのタイミングで選出頁E��反映されめE
      const mySelectionNames = [];
      const oppSelectionNames = [];

      for (const line of lines) {
        if (line.startsWith('|switch|') || line.startsWith('|drag|')) {
          const parts = line.split('|');
          const playerSide = (parts[2] || '').trim().slice(0, 2);
          const rawSpecies = parts[3] || '';
          const jaName = matchShowdownPokemonName(rawSpecies);

          if (!jaName) continue;

          if (playerSide === myPlayerId) {
            if (!mySelectionNames.includes(jaName) && mySelectionNames.length < 4) {
              mySelectionNames.push(jaName);
            }
          } else if (playerSide === oppPlayerId) {
            if (!oppSelectionNames.includes(jaName) && oppSelectionNames.length < 4) {
              oppSelectionNames.push(jaName);
            }
          }
        }
      }

      // 勝敗判宁E
      let result = null;
      for (const line of lines) {
        if (line.startsWith('|win|')) {
          const winner = line.split('|')[2] || '';
          if (toTransId(winner) === myUserNorm) {
            result = 'win';
          } else {
            result = 'lose';
          }
        } else if (line.startsWith('|tie')) {
          result = 'draw';
        }
      }

      // 相手レート判宁E
      let oppRating = (oppPlayerId === 'p1') ? p1Rating : p2Rating;
      for (const line of lines) {
        if (line.startsWith('|raw|')) {
          const oppPlayerEsc = oppTrainerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`${oppPlayerEsc}'s rating:\\s*(\\d+)`, 'i');
          const match = line.match(regex);
          if (match && match[1]) {
            oppRating = match[1];
          }
        }
      }

      return {
        myPlayerId,
        oppPlayerId,
        oppTrainer: oppTrainerName,
        oppRating: oppRating || '',
        oppParty: oppPartyNames,
        mySelection: mySelectionNames,
        oppSelection: oppSelectionNames,
        result: result
      };
    }

    // 勝敗を�E示皁E��セチE��する関数�E��E動�E力用・トグルしなぁE��E
    function applyBo1Result(r) {
      recordResult = r;
      document.getElementById('btn-win')?.classList.toggle('active', r === 'win');
      document.getElementById('btn-lose')?.classList.toggle('active', r === 'lose');
      document.getElementById('btn-draw')?.classList.toggle('active', r === 'draw');
    }

    function applyBo3Result(gameIdx, r) {
      if (bo3Games[gameIdx]) {
        bo3Games[gameIdx].result = r;
      }
      updateBo3Score();
    }

    async function fetchShowdownReplayJson(rawUrl) {
      let url = (rawUrl || '').trim();
      if (!url) throw new Error("Error");
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      const jsonUrl = url.replace(/\.json(\?.*)?$/, '').replace(/(\?.*)?$/, '') + '.json';

      const res = await fetch(jsonUrl);
      if (!res.ok) {
        throw new Error(`リプレイの取得に失敗しました (HTTP ${res.status})。URLをご確認ください。`);
      }
      const data = await res.json();
      return data;
    }

    async function loadShowdownReplayBO1() {
      const urlInput = document.getElementById('rec-showdown-url');
      const url = urlInput ? urlInput.value.trim() : '';
      if (!url) {
        alert("Alert");
        return;
      }
      const username = getShowdownUsername();
      if (!username) {
        alert("Alert");
        return;
      }

      const loadingEl = document.getElementById('showdown-loading-msg');
      if (loadingEl) loadingEl.style.display = 'inline-flex';

      try {
        await loadTranslationMap();
        const replayData = await fetchShowdownReplayJson(url);
        const parsed = parseShowdownReplayJson(replayData, username);

        // 1. 相手トレーナ�E吁E
        if (parsed.oppTrainer) {
          const tInput = document.getElementById('rec-opp-trainer');
          if (tInput) tInput.value = parsed.oppTrainer;
        }
        // 2. 相手レーチE
        if (parsed.oppRating) {
          const rInput = document.getElementById('rec-opp-rating');
          if (rInput) rInput.value = parsed.oppRating;
        }
        // 3. 相手パーチE���E�E体！E
        if (parsed.oppParty && parsed.oppParty.length) {
          const oppInputs = document.querySelectorAll('#opp-party-slots input[type=text]');
          parsed.oppParty.forEach((pName, idx) => {
            if (idx < 6 && oppInputs[idx]) {
              oppInputs[idx].value = pName;
              updateSlotIcon(oppInputs[idx], pName);
            }
          });
          rebuildOppSelectionDropdowns();
        }
        // 4. 自刁E�E相手�E選出
        if (parsed.mySelection && parsed.mySelection.length) {
          setSelectionFromNames('my', parsed.mySelection);
        }
        if (parsed.oppSelection && parsed.oppSelection.length) {
          setSelectionFromNames('opp', parsed.oppSelection);
        }
        // 5. 勝敗
        if (parsed.result) {
          applyBo1Result(parsed.result);
        }

        showRecordToast("Notification");
      } catch (err) {
        console.error("Error");
        alert("Alert");
      } finally {
        if (loadingEl) loadingEl.style.display = 'none';
      }
    }

    async function loadShowdownReplayBO3Game(gameIdx) {
      const urlInput = document.getElementById(`rec-showdown-url-${gameIdx}`);
      const url = urlInput ? urlInput.value.trim() : '';
      if (!url) {
        alert("Alert");
        return;
      }
      const username = getShowdownUsername();
      if (!username) {
        alert("Alert");
        return;
      }

      const loadingEl = document.getElementById('showdown-loading-msg');
      if (loadingEl) loadingEl.style.display = 'inline-flex';

      try {
        await loadTranslationMap();
        const replayData = await fetchShowdownReplayJson(url);
        const parsed = parseShowdownReplayJson(replayData, username);

        // 相手トレーナ�E吁E
        if (parsed.oppTrainer) {
          const tInput = document.getElementById('rec-opp-trainer');
          if (tInput) tInput.value = parsed.oppTrainer;
        }
        // 相手レーチE
        if (parsed.oppRating) {
          const rInput = document.getElementById('rec-opp-rating');
          if (rInput) rInput.value = parsed.oppRating;
        }
        // 相手パーチE���E�未入力また�E1戦目の場合�E設定！E
        if (parsed.oppParty && parsed.oppParty.length) {
          const oppInputs = document.querySelectorAll('#opp-party-slots input[type=text]');
          const hasExisting = Array.from(oppInputs).some(inp => inp.value.trim());
          if (!hasExisting || gameIdx === 0) {
            parsed.oppParty.forEach((pName, idx) => {
              if (idx < 6 && oppInputs[idx]) {
                oppInputs[idx].value = pName;
                updateSlotIcon(oppInputs[idx], pName);
              }
            });
            rebuildOppSelectionDropdowns();
          }
        }

        // 吁E��ームの選出反映
        if (parsed.mySelection && parsed.mySelection.length) {
          setSelectionFromNames('my', parsed.mySelection, gameIdx);
        }
        if (parsed.oppSelection && parsed.oppSelection.length) {
          setSelectionFromNames('opp', parsed.oppSelection, gameIdx);
        }
        if (parsed.result) {
          applyBo3Result(gameIdx, parsed.result);
        }

        showRecordToast("Notification");
      } catch (err) {
        console.error(`Showdown parse error (game ${gameIdx + 1}):`, err);
        alert("Alert");
      } finally {
        if (loadingEl) loadingEl.style.display = 'none';
      }
    }

    async function loadAllShowdownReplayBO3() {
      const u0 = document.getElementById('rec-showdown-url-0')?.value.trim();
      const u1 = document.getElementById('rec-showdown-url-1')?.value.trim();
      const u2 = document.getElementById('rec-showdown-url-2')?.value.trim();

      if (!u0 && !u1 && !u2) {
        alert("Alert");
        return;
      }

      if (u0) await loadShowdownReplayBO3Game(0);
      if (u1) await loadShowdownReplayBO3Game(1);
      if (u2) await loadShowdownReplayBO3Game(2);
    }

    function renderRecordPage() {
      const sel = document.getElementById('party-select-dropdown');
      if (!sel) return;
      sel.innerHTML = '<option value="">-- パ�EチE��を選抁E--</option>';
      parties.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        if (p.id === selectedPartyId) opt.selected = true;
        sel.appendChild(opt);
      });
      if (!parties.length) {
        document.getElementById('record-form-card').style.display = 'none';
        return;
      }
      if (selectedPartyId) showRecordForm();
    }

    function onPartyDropdownChange(id) {
      if (!id) {
        selectedPartyId = null;
        document.getElementById('record-form-card').style.display = 'none';
        return;
      }
      selectPartyForRecord(id);
    }

    function selectPartyForRecord(id) {
      selectedPartyId = id;
      recordResult = null;
      document.getElementById('btn-win').classList.remove('active');
      document.getElementById('btn-lose').classList.remove('active');
      document.getElementById('btn-draw')?.classList.remove('active');
      bo3Games = [
        { mySelectionOrder: [], oppSelectionOrder: [], result: null },
        { mySelectionOrder: [], oppSelectionOrder: [], result: null },
        { mySelectionOrder: [], oppSelectionOrder: [], result: null }
      ];
      renderRecordPage();
      showRecordForm();
    }

    function showRecordForm() {
      const form = document.getElementById('record-form-card');
      form.style.display = 'block';

      // Set datetime (新規登録時�Eみ現在日時を設宁E
      if (!editingRecordId) {
        const now = new Date();
        const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
        document.getElementById('rec-date').value = local.toISOString().slice(0, 16);
        initRecordFormMeta();
      }

      // 自刁E�Eパ�EチE��
      const myParty = parties.find(p => p.id === selectedPartyId);
      const myPokemon = myParty ? myParty.pokemon : [];

      // 相手パーチE��スロチE���E�フリー入力！E
      const oppParty = document.getElementById('opp-party-slots');
      oppParty.innerHTML = '';
      for (let i = 0; i < 6; i++) oppParty.appendChild(createPokemonSlot('opp-party-slots', i, `${i + 1}体目`));

      // 相手パーチE��: 直接チE��スト�E力してフォーカスを外した場合に対忁E
      oppParty.querySelectorAll('input[type=text]').forEach(input => {
        input.addEventListener('blur', () => {
          rebuildOppSelectionDropdowns();
        });
      });

      // 自刁E�Eパ�EチE��アイコンを表示
      const myIcons = document.getElementById('my-party-icons');
      if (myIcons) {
        myIcons.innerHTML = myPokemon.map(pk => typeof pk === 'string' ? pk : (pk && pk.name || '')).filter(Boolean).map(name => getPokeSpriteHTMLByDisplay(name)).join('');
      }

      // 選出スロチE��の初期化！EO1 & BO3�E�E
      mySelectionOrder = [];
      oppSelectionOrder = [];
      renderSelectionSlots('my');
      renderSelectionSlots('opp');

      renderAllBo3SelectionSlots();
      updateBo3Score();

      const recOppTrainer = document.getElementById('rec-opp-trainer');
      if (recOppTrainer) recOppTrainer.value = '';
      const recOppRating = document.getElementById('rec-opp-rating');
      if (recOppRating) recOppRating.value = '';
      document.getElementById('rec-memo').value = '';
      clearRecordAiImage();
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function toggleSelectionSlot(type, slotIdx, gameIdx = null) {
      if (gameIdx === null) {
        // BO1
        if (type === 'my') {
          const party = parties.find(p => p.id === selectedPartyId);
          const myPokemon = party ? party.pokemon : [];
          const pk = myPokemon[slotIdx];
          const name = (typeof pk === 'string' ? pk : (pk && pk.name || '')) || '';
          if (!name) return;

          const idx = mySelectionOrder.indexOf(slotIdx);
          if (idx !== -1) {
            mySelectionOrder.splice(idx, 1);
          } else if (mySelectionOrder.length < 4) {
            mySelectionOrder.push(slotIdx);
          }
          renderSelectionSlots('my');
        } else if (type === 'opp') {
          const oppInputs = document.querySelectorAll('#opp-party-slots input[type=text]');
          const oppPokemon = Array.from(oppInputs).map(inp => inp.value.trim());
          const name = oppPokemon[slotIdx] || '';
          if (!name) return;

          const idx = oppSelectionOrder.indexOf(slotIdx);
          if (idx !== -1) {
            oppSelectionOrder.splice(idx, 1);
          } else if (oppSelectionOrder.length < 4) {
            oppSelectionOrder.push(slotIdx);
          }
          renderSelectionSlots('opp');
        }
      } else {
        // BO3 (持E��gameIdx)
        const g = bo3Games[gameIdx];
        if (!g) return;

        if (type === 'my') {
          const party = parties.find(p => p.id === selectedPartyId);
          const myPokemon = party ? party.pokemon : [];
          const pk = myPokemon[slotIdx];
          const name = (typeof pk === 'string' ? pk : (pk && pk.name || '')) || '';
          if (!name) return;

          const idx = g.mySelectionOrder.indexOf(slotIdx);
          if (idx !== -1) {
            g.mySelectionOrder.splice(idx, 1);
          } else if (g.mySelectionOrder.length < 4) {
            g.mySelectionOrder.push(slotIdx);
          }
          renderBo3SelectionSlot('my', gameIdx);
        } else if (type === 'opp') {
          const oppInputs = document.querySelectorAll('#opp-party-slots input[type=text]');
          const oppPokemon = Array.from(oppInputs).map(inp => inp.value.trim());
          const name = oppPokemon[slotIdx] || '';
          if (!name) return;

          const idx = g.oppSelectionOrder.indexOf(slotIdx);
          if (idx !== -1) {
            g.oppSelectionOrder.splice(idx, 1);
          } else if (g.oppSelectionOrder.length < 4) {
            g.oppSelectionOrder.push(slotIdx);
          }
          renderBo3SelectionSlot('opp', gameIdx);
        }
      }
    }

    function renderSelectionSlots(type) {
      if (type === 'my' || !type) {
        const container = document.getElementById('my-selection-slots');
        if (container) {
          const party = parties.find(p => p.id === selectedPartyId);
          const myPokemon = party ? party.pokemon : [];
          let html = '';
          for (let i = 0; i < 6; i++) {
            const pk = myPokemon[i];
            const name = (typeof pk === 'string' ? pk : (pk && pk.name || '')) || '';
            const orderIdx = mySelectionOrder.indexOf(i);
            const isSelected = (orderIdx !== -1);
            const isDisabled = !name;
            const badge = isSelected ? (orderIdx + 1) : '-';

            let iconHtml = '';
            if (name) {
              const poke = (localPokemon || POKEMON_LIST).find(p => p.display === name);
              if (poke) {
                const pos = getPokeIconPos(poke);
                iconHtml = `<span class="poke-sprite" style="background-position:${pos}"></span>`;
              } else {
                iconHtml = `<img src="${BALL_ICON_SRC}" alt="${name}" class="ball-img">`;
              }
            } else {
              iconHtml = `<img src="${BALL_ICON_SRC}" alt="未設宁E class="ball-img">`;
            }

            const cls = `selection-poke-card${isSelected ? ' selected' : ''}${isDisabled ? ' disabled' : ''}`;
            html += `
              <div class="${cls}" onclick="toggleSelectionSlot('my', ${i})" title="${name || '未設宁E}">
                ${iconHtml}
                <div class="selection-order-badge">${badge}</div>
              </div>
            `;
          }
          container.innerHTML = html;
        }
      }

      if (type === 'opp' || !type) {
        const container = document.getElementById('opp-selection-slots');
        if (container) {
          const oppInputs = document.querySelectorAll('#opp-party-slots input[type=text]');
          const oppPokemon = Array.from(oppInputs).map(inp => inp.value.trim());
          let html = '';
          for (let i = 0; i < 6; i++) {
            const name = oppPokemon[i] || '';
            const orderIdx = oppSelectionOrder.indexOf(i);
            const isSelected = (orderIdx !== -1);
            const isDisabled = !name;
            const badge = isSelected ? (orderIdx + 1) : '-';

            let iconHtml = '';
            if (name) {
              const poke = (localPokemon || POKEMON_LIST).find(p => p.display === name);
              if (poke) {
                const pos = getPokeIconPos(poke);
                iconHtml = `<span class="poke-sprite" style="background-position:${pos}"></span>`;
              } else {
                iconHtml = `<img src="${BALL_ICON_SRC}" alt="${name}" class="ball-img">`;
              }
            } else {
              iconHtml = `<img src="${BALL_ICON_SRC}" alt="未入劁E class="ball-img">`;
            }

            const cls = `selection-poke-card${isSelected ? ' selected' : ''}${isDisabled ? ' disabled' : ''}`;
            html += `
              <div class="${cls}" onclick="toggleSelectionSlot('opp', ${i})" title="${name || '未入劁E}">
                ${iconHtml}
                <div class="selection-order-badge">${badge}</div>
              </div>
            `;
          }
          container.innerHTML = html;
        }
      }
    }

    function renderBo3SelectionSlot(type, gameIdx) {
      const g = bo3Games[gameIdx];
      if (!g) return;

      if (type === 'my' || !type) {
        const container = document.getElementById(`my-selection-slots-bo3-${gameIdx}`);
        if (container) {
          const party = parties.find(p => p.id === selectedPartyId);
          const myPokemon = party ? party.pokemon : [];
          let html = '';
          for (let i = 0; i < 6; i++) {
            const pk = myPokemon[i];
            const name = (typeof pk === 'string' ? pk : (pk && pk.name || '')) || '';
            const orderIdx = g.mySelectionOrder.indexOf(i);
            const isSelected = (orderIdx !== -1);
            const isDisabled = !name;
            const badge = isSelected ? (orderIdx + 1) : '-';

            let iconHtml = '';
            if (name) {
              const poke = (localPokemon || POKEMON_LIST).find(p => p.display === name);
              if (poke) {
                const pos = getPokeIconPos(poke);
                iconHtml = `<span class="poke-sprite" style="background-position:${pos}"></span>`;
              } else {
                iconHtml = `<img src="${BALL_ICON_SRC}" alt="${name}" class="ball-img">`;
              }
            } else {
              iconHtml = `<img src="${BALL_ICON_SRC}" alt="未設宁E class="ball-img">`;
            }

            const cls = `selection-poke-card${isSelected ? ' selected' : ''}${isDisabled ? ' disabled' : ''}`;
            html += `
              <div class="${cls}" onclick="toggleSelectionSlot('my', ${i}, ${gameIdx})" title="${name || '未設宁E}">
                ${iconHtml}
                <div class="selection-order-badge">${badge}</div>
              </div>
            `;
          }
          container.innerHTML = html;
        }
      }

      if (type === 'opp' || !type) {
        const container = document.getElementById(`opp-selection-slots-bo3-${gameIdx}`);
        if (container) {
          const oppInputs = document.querySelectorAll('#opp-party-slots input[type=text]');
          const oppPokemon = Array.from(oppInputs).map(inp => inp.value.trim());
          let html = '';
          for (let i = 0; i < 6; i++) {
            const name = oppPokemon[i] || '';
            const orderIdx = g.oppSelectionOrder.indexOf(i);
            const isSelected = (orderIdx !== -1);
            const isDisabled = !name;
            const badge = isSelected ? (orderIdx + 1) : '-';

            let iconHtml = '';
            if (name) {
              const poke = (localPokemon || POKEMON_LIST).find(p => p.display === name);
              if (poke) {
                const pos = getPokeIconPos(poke);
                iconHtml = `<span class="poke-sprite" style="background-position:${pos}"></span>`;
              } else {
                iconHtml = `<img src="${BALL_ICON_SRC}" alt="${name}" class="ball-img">`;
              }
            } else {
              iconHtml = `<img src="${BALL_ICON_SRC}" alt="未入劁E class="ball-img">`;
            }

            const cls = `selection-poke-card${isSelected ? ' selected' : ''}${isDisabled ? ' disabled' : ''}`;
            html += `
              <div class="${cls}" onclick="toggleSelectionSlot('opp', ${i}, ${gameIdx})" title="${name || '未入劁E}">
                ${iconHtml}
                <div class="selection-order-badge">${badge}</div>
              </div>
            `;
          }
          container.innerHTML = html;
        }
      }
    }

    function renderAllBo3SelectionSlots() {
      for (let i = 0; i < 3; i++) {
        renderBo3SelectionSlot('my', i);
        renderBo3SelectionSlot('opp', i);
      }
    }

    function setSelectionFromNames(type, names, gameIdx = null) {
      if (!names || !Array.isArray(names)) return;
      if (gameIdx === null) {
        if (type === 'my') {
          const party = parties.find(p => p.id === selectedPartyId);
          const myPokemon = party ? party.pokemon : [];
          mySelectionOrder = [];
          names.forEach(name => {
            if (!name) return;
            const norm = name.split('(')[0].split('�E�E)[0].trim();
            let bestIdx = -1;
            for (let i = 0; i < 6; i++) {
              if (mySelectionOrder.includes(i)) continue;
              const pk = myPokemon[i];
              const pName = (typeof pk === 'string' ? pk : (pk && pk.name || '')) || '';
              if (!pName) continue;
              if (pName === name) { bestIdx = i; break; }
              const pNorm = pName.split('(')[0].split('�E�E)[0].trim();
              if (pNorm === norm) { bestIdx = i; break; }
            }
            if (bestIdx !== -1 && mySelectionOrder.length < 4) {
              mySelectionOrder.push(bestIdx);
            }
          });
          renderSelectionSlots('my');
        } else if (type === 'opp') {
          const oppInputs = document.querySelectorAll('#opp-party-slots input[type=text]');
          const oppPokemon = Array.from(oppInputs).map(inp => inp.value.trim());
          oppSelectionOrder = [];
          names.forEach(name => {
            if (!name) return;
            const norm = name.split('(')[0].split('�E�E)[0].trim();
            let bestIdx = -1;
            for (let i = 0; i < 6; i++) {
              if (oppSelectionOrder.includes(i)) continue;
              const pName = oppPokemon[i] || '';
              if (!pName) continue;
              if (pName === name) { bestIdx = i; break; }
              const pNorm = pName.split('(')[0].split('�E�E)[0].trim();
              if (pNorm === norm) { bestIdx = i; break; }
            }
            if (bestIdx !== -1 && oppSelectionOrder.length < 4) {
              oppSelectionOrder.push(bestIdx);
            }
          });
          renderSelectionSlots('opp');
        }
      } else {
        const g = bo3Games[gameIdx];
        if (!g) return;
        if (type === 'my') {
          const party = parties.find(p => p.id === selectedPartyId);
          const myPokemon = party ? party.pokemon : [];
          g.mySelectionOrder = [];
          names.forEach(name => {
            if (!name) return;
            const norm = name.split('(')[0].split('�E�E)[0].trim();
            let bestIdx = -1;
            for (let i = 0; i < 6; i++) {
              if (g.mySelectionOrder.includes(i)) continue;
              const pk = myPokemon[i];
              const pName = (typeof pk === 'string' ? pk : (pk && pk.name || '')) || '';
              if (!pName) continue;
              if (pName === name) { bestIdx = i; break; }
              const pNorm = pName.split('(')[0].split('�E�E)[0].trim();
              if (pNorm === norm) { bestIdx = i; break; }
            }
            if (bestIdx !== -1 && g.mySelectionOrder.length < 4) {
              g.mySelectionOrder.push(bestIdx);
            }
          });
          renderBo3SelectionSlot('my', gameIdx);
        } else if (type === 'opp') {
          const oppInputs = document.querySelectorAll('#opp-party-slots input[type=text]');
          const oppPokemon = Array.from(oppInputs).map(inp => inp.value.trim());
          g.oppSelectionOrder = [];
          names.forEach(name => {
            if (!name) return;
            const norm = name.split('(')[0].split('�E�E)[0].trim();
            let bestIdx = -1;
            for (let i = 0; i < 6; i++) {
              if (g.oppSelectionOrder.includes(i)) continue;
              const pName = oppPokemon[i] || '';
              if (!pName) continue;
              if (pName === name) { bestIdx = i; break; }
              const pNorm = pName.split('(')[0].split('�E�E)[0].trim();
              if (pNorm === norm) { bestIdx = i; break; }
            }
            if (bestIdx !== -1 && g.oppSelectionOrder.length < 4) {
              g.oppSelectionOrder.push(bestIdx);
            }
          });
          renderBo3SelectionSlot('opp', gameIdx);
        }
      }
    }

    function rebuildOppSelectionDropdowns() {
      const oppInputs = document.querySelectorAll('#opp-party-slots input[type=text]');
      const oppPokemon = Array.from(oppInputs).map(inp => inp.value.trim());
      // 相手パーチE��から削除されたスロチE��番号は選出から外す
      oppSelectionOrder = oppSelectionOrder.filter(idx => idx < oppPokemon.length && !!oppPokemon[idx]);
      renderSelectionSlots('opp');

      for (let i = 0; i < 3; i++) {
        bo3Games[i].oppSelectionOrder = bo3Games[i].oppSelectionOrder.filter(idx => idx < oppPokemon.length && !!oppPokemon[idx]);
        renderBo3SelectionSlot('opp', i);
      }
    }

    function setResult(r) {
      if (recordResult === r) {
        recordResult = null;
      } else {
        recordResult = r;
      }
      document.getElementById('btn-win').classList.toggle('active', recordResult === 'win');
      document.getElementById('btn-lose').classList.toggle('active', recordResult === 'lose');
      document.getElementById('btn-draw')?.classList.toggle('active', recordResult === 'draw');
    }

    function setBo3Result(gameIdx, r) {
      if (bo3Games[gameIdx].result === r) {
        bo3Games[gameIdx].result = null; // 再度タチE�Eで解除
      } else {
        bo3Games[gameIdx].result = r;
      }
      updateBo3Score();
    }

    function updateBo3Score() {
      let wins = 0;
      let losses = 0;
      for (let i = 0; i < 3; i++) {
        const g = bo3Games[i];
        const btnWin = document.getElementById(`btn-win-bo3-${i}`);
        const btnLose = document.getElementById(`btn-lose-bo3-${i}`);
        const btnDraw = document.getElementById(`btn-draw-bo3-${i}`);
        if (btnWin) btnWin.classList.toggle('active', g.result === 'win');
        if (btnLose) btnLose.classList.toggle('active', g.result === 'lose');
        if (btnDraw) btnDraw.classList.toggle('active', g.result === 'draw');

        const badge = document.getElementById(`bo3-badge-${i}`);
        if (badge) {
          if (g.result === 'win') {
            badge.innerHTML = '<span class="badge-win" style="font-size:10px;padding:2px 6px">🏆 勝ち</span>';
          } else if (g.result === 'lose') {
            badge.innerHTML = '<span class="badge-lose" style="font-size:10px;padding:2px 6px">💀 負ぁE/span>';
          } else if (g.result === 'draw') {
            badge.innerHTML = '<span class="badge-draw" style="font-size:10px;padding:2px 6px">🤁E刁E��</span>';
          } else {
            badge.innerHTML = '';
          }
        }

        // 引き刁E��の場合�E総合勝敗数には追加されなぁE
        if (g.result === 'win') wins++;
        if (g.result === 'lose') losses++;
      }

      // 総合勝敗数の更新
      const winEl = document.getElementById('bo3-score-win');
      const loseEl = document.getElementById('bo3-score-lose');
      if (winEl) winEl.textContent = wins;
      if (loseEl) loseEl.textContent = losses;

      // 3試合目の表示判宁E
      // 1戦目と2戦目の勝敗ぁE2-0 また�E 0-2 で決着がつぁE��ぁE��場合�Eみ3戦目を非表示�E�引き刁E��等がある場合�E3戦目を表示�E�E
      const g0 = bo3Games[0].result;
      const g1 = bo3Games[1].result;
      const card3 = document.getElementById('bo3-game-card-2');
      if (card3) {
        const isCleanSweep = (g0 === 'win' && g1 === 'win') || (g0 === 'lose' && g1 === 'lose');
        if (isCleanSweep) {
          card3.style.display = 'none';
          bo3Games[2].result = null; // 2-0 また�E 0-2 のとき�E3戦目リセチE��
          const btnWin3 = document.getElementById('btn-win-bo3-2');
          const btnLose3 = document.getElementById('btn-lose-bo3-2');
          const btnDraw3 = document.getElementById('btn-draw-bo3-2');
          if (btnWin3) btnWin3.classList.remove('active');
          if (btnLose3) btnLose3.classList.remove('active');
          if (btnDraw3) btnDraw3.classList.remove('active');
          const badge3 = document.getElementById('bo3-badge-2');
          if (badge3) badge3.innerHTML = '';
          // スコア再集訁E
          const finalWins = (g0 === 'win' ? 1 : 0) + (g1 === 'win' ? 1 : 0);
          const finalLosses = (g0 === 'lose' ? 1 : 0) + (g1 === 'lose' ? 1 : 0);
          if (winEl) winEl.textContent = finalWins;
          if (loseEl) loseEl.textContent = finalLosses;
        } else {
          card3.style.display = 'block';
        }
      }
    }

    function getBo3SlotValues(type, gameIdx) {
      const g = bo3Games[gameIdx];
      if (!g) return [];
      if (type === 'my') {
        const party = parties.find(p => p.id === selectedPartyId);
        const myPokemon = party ? party.pokemon : [];
        return g.mySelectionOrder.map(idx => {
          const pk = myPokemon[idx];
          return (typeof pk === 'string' ? pk : (pk && pk.name || '')) || '';
        }).filter(Boolean);
      } else {
        const oppInputs = document.querySelectorAll('#opp-party-slots input[type=text]');
        const oppPokemon = Array.from(oppInputs).map(inp => inp.value.trim());
        return g.oppSelectionOrder.map(idx => oppPokemon[idx] || '').filter(Boolean);
      }
    }

    async function saveRecord() {
      if (!selectedPartyId) { alert("Alert"); return; }
      const oppParty = getSlotValues('opp-party-slots', 6);
      if (!oppParty.some(Boolean)) { alert("Alert"); return; }

      const oppTrainer = (document.getElementById('rec-opp-trainer')?.value || '').trim();
      const oppRating = (document.getElementById('rec-opp-rating')?.value || '').trim();
      const memo = document.getElementById('rec-memo').value.trim();
      const date = document.getElementById('rec-date').value;

      const regulation = (document.getElementById('rec-regulation')?.value || '').trim();
      const season = (document.getElementById('rec-season')?.value || '').trim();
      const matchType = currentRecordMatchType || (currentRecordSourceMode === 'showdown' ? 'showdown' : 'ランクチE);
      const tags = [...currentRecordTags];

      let showdownUrl = null;
      let showdownUrls = null;
      if (currentRecordSourceMode === 'showdown') {
        if (currentRecordFormat === 'bo1') {
          showdownUrl = document.getElementById('rec-showdown-url')?.value.trim() || null;
        } else {
          showdownUrls = [
            document.getElementById('rec-showdown-url-0')?.value.trim() || '',
            document.getElementById('rec-showdown-url-1')?.value.trim() || '',
            document.getElementById('rec-showdown-url-2')?.value.trim() || ''
          ];
        }
      }

      let rec = null;

      if (currentRecordFormat === 'bo1') {
        if (!recordResult) { alert("Alert"); return; }
        rec = {
          id: Date.now().toString(),
          format: 'bo1',
          sourceMode: currentRecordSourceMode,
          partyId: selectedPartyId,
          date,
          oppTrainer,
          oppRating,
          oppParty,
          regulation,
          season,
          matchType,
          tags,
          mySelection: getSlotValues('my-selection-slots', 4),
          oppSelection: getSlotValues('opp-selection-slots', 4),
          result: recordResult,
          memo
        };
        if (showdownUrl) rec.showdownUrl = showdownUrl;
      } else {
        // BO3
        // 一つでも勝敗欁E��入力されてぁE��か確認（引き刁E��を含む�E�E
        const hasAnyResult = bo3Games.some(g => g.result !== null);
        if (!hasAnyResult) { alert("Alert"); return; }

        let wins = 0;
        let losses = 0;
        const gamesData = [];

        for (let i = 0; i < 3; i++) {
          const g = bo3Games[i];
          const cardEl = document.getElementById(`bo3-game-card-${i}`);
          if (cardEl && cardEl.style.display === 'none') continue;

          if (g.result !== null || g.mySelectionOrder.length > 0 || g.oppSelectionOrder.length > 0) {
            if (g.result === 'win') wins++;
            if (g.result === 'lose') losses++;
            gamesData.push({
              gameNum: i + 1,
              result: g.result,
              mySelection: getBo3SlotValues('my', i),
              oppSelection: getBo3SlotValues('opp', i)
            });
          }
        }

        let overallResult = 'draw';
        if (wins > losses) overallResult = 'win';
        else if (losses > wins) overallResult = 'lose';
        else overallResult = 'draw';

        rec = {
          id: Date.now().toString(),
          format: 'bo3',
          sourceMode: currentRecordSourceMode,
          partyId: selectedPartyId,
          date,
          oppTrainer,
          oppRating,
          oppParty,
          regulation,
          season,
          matchType,
          tags,
          result: overallResult,
          games: gamesData,
          mySelection: gamesData[0] ? gamesData[0].mySelection : [],
          oppSelection: gamesData[0] ? gamesData[0].oppSelection : [],
          memo
        };
        if (showdownUrls && showdownUrls.some(Boolean)) rec.showdownUrls = showdownUrls;
      }

      // 添付動画惁E��の引き継ぎ・保孁E
      if (_attachedVideoData) {
        if (_attachedVideoData.sync_status === 'local_file') {
          if (_attachedVideoData.file) {
            const finalId = editingRecordId || rec.id;
            const ext = (_attachedVideoData.original_name && _attachedVideoData.original_name.includes('.'))
              ? _attachedVideoData.original_name.split('.').pop()
              : 'webm';
            const localFileName = `battle_${finalId}_${Date.now()}.${ext}`;
            try {
              await saveVideoToLocalDirectory(_attachedVideoData.file, localFileName);
              rec.sync_status = 'local_file';
              rec.local_file_name = localFileName;
              rec.created_at = _attachedVideoData.created_at || Date.now();
              if (_attachedVideoData.original_name) rec.video_original_name = _attachedVideoData.original_name;
              showRecordToast("Notification");
            } catch (err) {
              console.error("Error");
              alert("Alert");
            }
          } else if (_attachedVideoData.local_file_name) {
            // 編雁E��ードで既存ローカル動画を維持する場吁E
            rec.sync_status = 'local_file';
            rec.local_file_name = _attachedVideoData.local_file_name;
            rec.created_at = _attachedVideoData.created_at || Date.now();
            if (_attachedVideoData.original_name) rec.video_original_name = _attachedVideoData.original_name;
          }
        } else {
          rec.sync_status = _attachedVideoData.sync_status || 'local_pending';
          rec.created_at = _attachedVideoData.created_at || Date.now();
          if (_attachedVideoData.original_name) rec.video_original_name = _attachedVideoData.original_name;
          if (_attachedVideoData.drive_file_id) rec.drive_file_id = _attachedVideoData.drive_file_id;
          if (_attachedVideoData.video_url) rec.video_url = _attachedVideoData.video_url;
          if (_attachedVideoData.youtube_video_id) rec.youtube_video_id = _attachedVideoData.youtube_video_id;
          // local_pendingかつ仮キーの場合、IndexedDBのキーを実レコードIDに変更
          if (_attachedVideoData.sync_status === 'local_pending' &&
              _attachedVideoData.local_key && _attachedVideoData.local_key.startsWith('_new_')) {
            const finalId = editingRecordId || rec.id;
            try {
              await VideoStore.rename(_attachedVideoData.local_key, finalId);
            } catch(e) {
              console.warn('IndexedDB rename error:', e);
            }
            _attachedVideoData.local_key = finalId;
          }
        }
      }

      // 1. ローカルに即時保孁E(編雁E��は上書き更新、新規�E先頭に追加)
      if (editingRecordId) {
        rec.id = editingRecordId;
        const targetIdx = records.findIndex(x => x.id === editingRecordId);
        if (targetIdx !== -1) {
          records[targetIdx] = rec; saveRecordDoc(rec);
        } else {
          records.unshift(rec); saveRecordDoc(rec);
        }
        editingRecordId = null;
        updateRecordFormEditModeUI();
        saveData();
        showRecordToast("Notification");
      } else {
        records.unshift(rec); saveRecordDoc(rec);
        saveData();
        showRecordToast("Notification");
      }

      // WiFi環墁E��つ認証済みなら即座にアチE�Eロードキューを起動（ローカルモード時はスキチE�E�E�E
      if (getVideoStorageType() !== 'local') {
        setTimeout(() => startUploadQueue(), 300);
      }

      // 動画添付状態�EリセチE��
      _attachedVideoData = null;
      resetRecordVideoUI();

      // 2. UIのリセチE���E�前回選択したパーチE��は維持し、フォームを展開状態にする�E�E
      recordResult = null;
      document.getElementById('btn-win').classList.remove('active');
      document.getElementById('btn-lose').classList.remove('active');
      document.getElementById('btn-draw')?.classList.remove('active');
      const uBo1 = document.getElementById('rec-showdown-url');
      if (uBo1) uBo1.value = '';
      for (let i = 0; i < 3; i++) {
        const uBo3 = document.getElementById(`rec-showdown-url-${i}`);
        if (uBo3) uBo3.value = '';
      }
      bo3Games = [
        { mySelectionOrder: [], oppSelectionOrder: [], result: null },
        { mySelectionOrder: [], oppSelectionOrder: [], result: null },
        { mySelectionOrder: [], oppSelectionOrder: [], result: null }
      ];
      renderRecordPage();
      showRecordForm();
    }



    // ---- HISTORY (無限スクロール / ペ�Eジネ�Eション対忁E ----

    function renderHistoryItemHTML(r) {
      const party = parties.find(p => p.id === r.partyId);
      const dateStr = r.date ? new Date(r.date).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      const oppPartyList = (r.oppParty || []).filter(Boolean);

      // 左枠線�E色�E�勝ち=緑、負ぁE赤、引き刁E��=黁E��E
      let borderColor = 'var(--lose)';
      if (r.result === 'win') borderColor = 'var(--win)';
      else if (r.result === 'draw') borderColor = '#eab308';

      const tagRow = (arr, color, filterArr) => arr.length
        ? arr.map(p => {
          const isHighlight = filterArr && filterArr.includes(p);
          const sprite = getPokeSpriteHTMLByDisplay(p);
          return `<div style="display:inline-flex;flex-direction:column;align-items:center;${isHighlight ? 'outline:2px solid var(--accent);border-radius:4px;' : ''}vertical-align:top">${sprite}</div>`;
        }).join('')
        : '<span style="font-size:11px;color:var(--text-muted)">なぁE/span>';

      // 勝敗バッジのHTML
      let resultBadgeHtml = '';
      if (r.format === 'bo3' && r.games && r.games.length > 0) {
        resultBadgeHtml = r.games.map(g => {
          if (g.result === 'win') return `<span class="badge-win" style="font-size:10px;padding:2px 6px">🏆勁E/span>`;
          if (g.result === 'lose') return `<span class="badge-lose" style="font-size:10px;padding:2px 6px">💀負</span>`;
          return `<span class="badge-draw" style="font-size:10px;padding:2px 6px">🤝�E</span>`;
        }).join(' ');
      } else {
        const isWin = r.result === 'win';
        const isDraw = r.result === 'draw';
        const badgeCls = isWin ? 'badge-win' : (isDraw ? 'badge-draw' : 'badge-lose');
        const badgeTxt = isWin ? '🏆勁E : (isDraw ? '🤝�E' : '💀負');
        resultBadgeHtml = `<span class="${badgeCls}" style="font-size:10px;padding:2px 6px">${badgeTxt}</span>`;
      }

      // トレーナ�E名�Eレート表示バッジ
      let oppInfoHtml = '';
      const badgeStyle = 'font-size:11px;font-weight:700;color:var(--text);background:rgba(255,255,255,0.08);padding:1px 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.1)';
      if (r.oppTrainer && r.oppRating) {
        oppInfoHtml = `<span style="${badgeStyle}">👤 ${r.oppTrainer} <span style="color:#f59e0b;margin-left:2px">☁E/span>${r.oppRating}</span>`;
      } else if (r.oppTrainer) {
        oppInfoHtml = `<span style="${badgeStyle}">👤 ${r.oppTrainer}</span>`;
      } else if (r.oppRating) {
        oppInfoHtml = `<span style="${badgeStyle}"><span style="color:#f59e0b">☁E/span> ${r.oppRating}</span>`;
      }

      // 選出ポケモンのHTML�E�EO3の場合�E1試合目・2試合目・3試合目を縦に並べる！E
      let mySelHtml = '';
      let oppSelHtml = '';

      if (r.format === 'bo3' && r.games && r.games.length > 0) {
        mySelHtml = r.games.map(g => {
          const list = (g.mySelection || []).filter(Boolean);
          return `<div style="display:flex;flex-wrap:nowrap;gap:2px;overflow:visible;margin-bottom:3px">${tagRow(list, 'rgba(108,99,255,0.25)', [mySelFilterName])}</div>`;
        }).join('');
        oppSelHtml = r.games.map(g => {
          const list = (g.oppSelection || []).filter(Boolean);
          return `<div style="display:flex;flex-wrap:nowrap;gap:2px;overflow:visible;margin-bottom:3px">${tagRow(list, 'rgba(255,101,132,0.2)', oppSelFilter)}</div>`;
        }).join('');
      } else {
        const mySelList = (r.mySelection || []).filter(Boolean);
        const oppSelList = (r.oppSelection || []).filter(Boolean);
        mySelHtml = `<div style="display:flex;flex-wrap:nowrap;gap:2px;overflow:visible">${tagRow(mySelList, 'rgba(108,99,255,0.25)', [mySelFilterName])}</div>`;
        oppSelHtml = `<div style="display:flex;flex-wrap:nowrap;gap:2px;overflow:visible">${tagRow(oppSelList, 'rgba(255,101,132,0.2)', oppSelFilter)}</div>`;
      }

      // 動画バッジのHTML
      let videoBadgeHtml = '';
      if (r.sync_status === 'local_file') {
        videoBadgeHtml = `<span style="font-size:10px;padding:1px 5px;background:#3b82f6;color:#fff;border-radius:4px;font-weight:700" title="ローカルフォルダに保存済み (直接再生可)">📁 ローカル</span>`;
      } else if (r.sync_status === 'local_pending') {
        videoBadgeHtml = `<span style="font-size:10px;padding:1px 5px;background:var(--accent);color:#fff;border-radius:4px;font-weight:700" title="端末冁E��保存中 (タチE�Eでアプリ冁E�E甁E">📱 ローカル</span>`;
      } else if (r.video_url || r.drive_file_id || r.youtube_video_id) {
        const isUploaded = r.sync_status === 'yt_uploaded' || r.sync_status === 'uploaded' ||
                           (r.video_url && r.video_url.includes('youtu'));
        if (isUploaded) {
          videoBadgeHtml = `<span style="font-size:10px;padding:1px 5px;background:#dc2626;color:#fff;border-radius:4px;font-weight:700" title="YouTube録画あり">▶�E�E動画</span>`;
        } else {
          const isWithin30Min = r.drive_uploaded_at && (Date.now() - r.drive_uploaded_at < 30 * 60 * 1000);
          videoBadgeHtml = `<span style="font-size:10px;padding:1px 5px;background:#22c55e;color:#fff;border-radius:4px;font-weight:700" title="Google Drive保存渁E(YouTube転送征E��)">☁E��EDrive</span>`;
          if (isWithin30Min) {
            videoBadgeHtml += ` <span style="font-size:10px;padding:1px 5px;background:var(--accent);color:#fff;border-radius:4px;font-weight:700" title="端末冁E��も保存中 (30刁E��保持)">📱 ローカル</span>`;
          }
        }
      }

      return `<div class="record-item" onclick="openDetail('${r.id}')" style="border-left:3px solid ${borderColor}">
    <div class="hist-card-body">
      <div class="hist-opp-party">
        <div class="hist-row-label" style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:6px">
            <div style="display:flex;align-items:center;gap:4px">${resultBadgeHtml}</div>
            <span class="record-date" style="font-size:11px">${dateStr}</span>
            ${oppInfoHtml}
            ${videoBadgeHtml}
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:3px">${tagRow(oppPartyList, 'rgba(255,255,255,0.06)', oppSelFilter)}</div>
      </div>
      <div class="hist-sel-row" style="display:contents">
        <div class="hist-my-sel">
          <div class="hist-row-label" style="color:var(--text-muted);font-size:11px">自刁E�E選出</div>
          ${mySelHtml}
        </div>
        <div class="hist-opp-sel">
          <div class="hist-row-label" style="color:var(--text-muted);font-size:11px">相手�E選出</div>
          ${oppSelHtml}
        </div>
      </div>
    </div>
  </div>`;
    }

    function appendMoreHistory() {
      if (_histCurrentRenderedCount >= _histFilteredCache.length) return;
      const list = document.getElementById('history-list');
      const nextItems = _histFilteredCache.slice(_histCurrentRenderedCount, _histCurrentRenderedCount + HIST_PAGE_SIZE);
      _histCurrentRenderedCount += nextItems.length;

      const sentinel = document.getElementById('hist-sentinel');
      if (sentinel) sentinel.remove();

      const html = nextItems.map(renderHistoryItemHTML).join('');
      list.insertAdjacentHTML('beforeend', html);

      if (_histCurrentRenderedCount < _histFilteredCache.length) {
        setupHistSentinel(list);
      }
    }

    function setupHistSentinel(list) {
      const sentinel = document.createElement('div');
      sentinel.id = 'hist-sentinel';
      sentinel.style.padding = '14px 0';
      sentinel.style.textAlign = 'center';
      sentinel.style.color = 'var(--text-muted)';
      sentinel.style.fontSize = '12px';
      sentinel.textContent = `過去の記録を読み込み中... (${_histCurrentRenderedCount} / ${_histFilteredCache.length}件)`;
      list.appendChild(sentinel);

      if (!_histObserver) {
        _histObserver = new IntersectionObserver((entries) => {
          if (entries[0] && entries[0].isIntersecting) {
            appendMoreHistory();
          }
        }, { rootMargin: '300px' });
      } else {
        _histObserver.disconnect();
      }
      _histObserver.observe(sentinel);
    }

    function renderHistory() {
      // Update filter options
      const filter = document.getElementById('history-filter');
      const current = filter.value;
      filter.innerHTML = '<option value="">すべてのパ�EチE��</option>';
      parties.forEach(p => {
        filter.innerHTML += `<option value="${p.id}" ${current === p.id ? 'selected' : ''}>${p.name}</option>`;
      });
      // プルダウンを最新状態に更新
      updateMySelFilterSelect();
      updateOppSelFilterSelect();

      const filterVal = filter.value;
      const resultFilterVal = document.getElementById('history-result-filter').value;
      const regFilterVal = document.getElementById('history-reg-filter')?.value || '';
      const seasonFilterVal = document.getElementById('history-season-filter')?.value || '';
      const matchTypeFilterVal = document.getElementById('history-match-type-filter')?.value || '';

      // パ�EチE��未選抁E= 全試合表示
      let filtered = filterVal ? records.filter(r => r.partyId === filterVal) : records.slice();
      if (resultFilterVal) filtered = filtered.filter(r => r.result === resultFilterVal);

      // レギュレーションフィルター
      if (regFilterVal) {
        if (regFilterVal === '__none__') {
          filtered = filtered.filter(r => !r.regulation);
        } else {
          filtered = filtered.filter(r => r.regulation === regFilterVal);
        }
      }

      // シーズンフィルター
      if (seasonFilterVal) {
        if (seasonFilterVal === '__none__') {
          filtered = filtered.filter(r => !r.season);
        } else {
          filtered = filtered.filter(r => r.season === seasonFilterVal);
        }
      }

      // 形式フィルター
      if (matchTypeFilterVal) {
        filtered = filtered.filter(r => {
          const mt = r.matchType || (r.sourceMode === 'showdown' ? 'showdown' : 'ランクチE);
          return mt === matchTypeFilterVal;
        });
      }

      // タグフィルター�E�褁E��選択時はOR検索�E�E
      if (historyTagFilters && historyTagFilters.length > 0) {
        filtered = filtered.filter(r => {
          const rTags = r.tags || [];
          return historyTagFilters.some(tf => rTags.includes(tf));
        });
      }

      // 自刁E�E選出絞り込み�E�E体！E
      if (mySelFilterName) {
        filtered = filtered.filter(r => {
          if (r.mySelection && r.mySelection.includes(mySelFilterName)) return true;
          if (r.games && r.games.some(g => g.mySelection && g.mySelection.includes(mySelFilterName))) return true;
          return false;
        });
      }
      // 相手�Eパ�EチE��絞り込み�E�E体、oppPartyで判定！E
      if (oppPartyFilterName) {
        filtered = filtered.filter(r => r.oppParty && r.oppParty.includes(oppPartyFilterName));
      }

      _histFilteredCache = filtered;

      // Stats�E��E試合を対象に正確に計算、BO3めEカウント！E
      const stats = document.getElementById('history-stats');
      if (filtered.length) {
        stats.style.display = 'block';
        const wins = filtered.filter(r => r.result === 'win').length;
        const loses = filtered.filter(r => r.result === 'lose').length;
        const draws = filtered.filter(r => r.result === 'draw').length;
        document.getElementById('stat-total').textContent = filtered.length;
        document.getElementById('stat-win').textContent = wins;
        document.getElementById('stat-lose').textContent = loses;
        const drawEl = document.getElementById('stat-draw');
        if (drawEl) drawEl.textContent = draws;
        document.getElementById('stat-rate').textContent = Math.round(wins / filtered.length * 100) + '%';
      } else stats.style.display = 'none';

      const list = document.getElementById('history-list');
      if (!filtered.length) {
        list.innerHTML = '<div class="empty"><div class="empty-icon">📋</div><p>記録がありません</p></div>';
        return;
      }

      // 初期50件を描画
      const initialItems = filtered.slice(0, HIST_PAGE_SIZE);
      _histCurrentRenderedCount = initialItems.length;
      list.innerHTML = initialItems.map(renderHistoryItemHTML).join('');

      // 50件以上ある場合�E自動無限スクロール用センチネルを�E置
      if (_histCurrentRenderedCount < filtered.length) {
        setupHistSentinel(list);
      }
    }

    // ---- VIDEO STORE (IndexedDB) ----
    const VideoStore = (() => {
      const DB_NAME = 'PokemonBattleVideoStore';
      const STORE_NAME = 'videos';
      const STORE_HANDLES = 'handles';
      let _db = null;
      async function open() {
        if (_db) return _db;
        return new Promise((resolve, reject) => {
          const req = indexedDB.open(DB_NAME, 2);
          req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              db.createObjectStore(STORE_NAME);
            }
            if (!db.objectStoreNames.contains(STORE_HANDLES)) {
              db.createObjectStore(STORE_HANDLES);
            }
          };
          req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
          req.onerror = (e) => reject(e.target.error);
        });
      }
      return {
        async save(key, file) {
          const db = await open();
          return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(file, key);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
          });
        },
        async get(key) {
          const db = await open();
          return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get(key);
            req.onsuccess = (e) => resolve(e.target.result || null);
            req.onerror = (e) => reject(e.target.error);
          });
        },
        async delete(key) {
          const db = await open();
          return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
          });
        },
        async rename(oldKey, newKey) {
          const file = await this.get(oldKey);
          if (!file) return;
          await this.save(newKey, file);
          await this.delete(oldKey);
        },
        async saveHandle(key, handle) {
          const db = await open();
          return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_HANDLES, 'readwrite');
            tx.objectStore(STORE_HANDLES).put(handle, key);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
          });
        },
        async getHandle(key) {
          const db = await open();
          return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_HANDLES, 'readonly');
            const req = tx.objectStore(STORE_HANDLES).get(key);
            req.onsuccess = (e) => resolve(e.target.result || null);
            req.onerror = (e) => reject(e.target.error);
          });
        }
      };
    })();

    // ---- VIDEO UPLOAD & ATTACHMENT ----
    let _currentVideoUploader = null;
    let _pendingOldVideoForCleanup = null; // 差し替え時に旧動画を一時保持
    let _attachedVideoData = null; // { local_key?, drive_file_id?, video_url?, sync_status, original_name, file_size, created_at }

    async function onVideoFileSelected(input) {
      const file = input.files && input.files[0];
      if (!file) return;

      const storageType = getVideoStorageType();

      // ローカル保存モード�E場吁E
      if (storageType === 'local') {
        const dirHandle = await VideoStore.getHandle('local_video_dir');
        if (!dirHandle) {
          alert("Alert");
          input.value = '';
          return;
        }
        const hasPerm = await verifyFilePermission(dirHandle, true);
        if (!hasPerm) {
          alert("Alert");
          input.value = '';
          return;
        }

        _pendingOldVideoForCleanup = null;
        _attachedVideoData = {
          file: file,
          sync_status: 'local_file',
          original_name: file.name,
          file_size: file.size,
          created_at: Date.now()
        };

        showAttachedVideoUI(_attachedVideoData);
        showRecordToast("Notification");
        return;
      }

      // フォルダID未設定�E場合でも端末IndexedDBへの添付�E許可�E�後から設定�E認証時に自動アチE�Eロード！E
      if (!getDriveFolderId()) {
        showRecordToast("Notification");
      }

      // 差し替え時�E�旧動画のクリーンアチE�E
      if (_pendingOldVideoForCleanup) {
        const old = _pendingOldVideoForCleanup;
        _pendingOldVideoForCleanup = null;
        if (old.sync_status === 'local_pending' && old.local_key) {
          VideoStore.delete(old.local_key).catch(e => console.warn('IndexedDB delete error:', e));
        } else if ((old.sync_status === 'drive_pending' || old.sync_status === 'pending') && old.drive_file_id) {
          const tok = window._googleDriveAccessToken;
          if (tok) {
            fetch(`https://www.googleapis.com/drive/v3/files/${old.drive_file_id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${tok}` }
            }).catch(e => console.warn('Drive delete error:', e));
          } else {
            showRecordToast("Notification");
          }
        }
      }

      // IndexedDBに保存（通信なし�E即完亁E��E
      const tempKey = `_new_${Date.now()}`;
      try {
        await VideoStore.save(tempKey, file);
      } catch (e) {
        console.error("Error");
        alert("Alert");
        input.value = '';
        return;
      }

      _attachedVideoData = {
        local_key: tempKey,
        sync_status: 'local_pending',
        original_name: file.name,
        file_size: file.size,
        created_at: Date.now()
      };

      showAttachedVideoUI(_attachedVideoData);
      showRecordToast("Notification");
    }

    function showAttachedVideoUI(videoData) {
      document.getElementById('rec-video-select-section').style.display = 'none';
      document.getElementById('rec-video-progress-area').style.display = 'none';
      const infoArea = document.getElementById('rec-video-attached-info');
      infoArea.style.display = 'flex';

      const nameEl = document.getElementById('rec-video-attached-name');
      const linkEl = document.getElementById('rec-video-attached-link');
      const actionsEl = document.getElementById('rec-video-attached-actions');
      if (nameEl) nameEl.textContent = videoData.original_name || '対戦動画ファイル';

      const status = videoData.sync_status;
      const isYt = status === 'yt_uploaded' || status === 'uploaded' ||
                   (videoData.video_url && videoData.video_url.includes('youtu'));
      const isDrive = status === 'drive_pending' || status === 'pending';

      if (linkEl) {
        if (status === 'local_file') {
          linkEl.textContent = '📁 端末冁E��ーカルフォルダに直接保存されまぁE;
          linkEl.style.color = '#38bdf8';
        } else if (isYt) {
          linkEl.textContent = '▶�E�EYouTube�E�限定�E開）に公開済み';
          linkEl.style.color = '#ef4444';
        } else if (isDrive) {
          linkEl.textContent = '☁E��EDrive保存済�E夕間にYouTube自動転送E;
          linkEl.style.color = '#22c55e';
        } else if (status === 'local_pending') {
          linkEl.textContent = '📱 WiFi接続後に自動アチE�EローチE;
          linkEl.style.color = 'var(--accent)';
        } else if (status === 'lost') {
          linkEl.textContent = '⚠�E�E動画チE�Eタが消えてぁE��す。�E添付してください';
          linkEl.style.color = '#f59e0b';
        }
      }

      if (actionsEl) {
        const youtubeUrl = videoData.video_url || (videoData.youtube_video_id ? `https://youtu.be/${videoData.youtube_video_id}` : null);
        let html = '';
        if (isYt && youtubeUrl) {
          html += `<a href="${youtubeUrl}" target="_blank" class="btn btn-ghost btn-sm" style="font-size:11px;padding:2px 8px;color:#ef4444;border-color:#ef4444;text-decoration:none">▶ 見る</a>`;
        }
        if (status !== 'lost') {
          html += `<button type="button" class="btn btn-ghost btn-sm" onclick="replaceAttachedVideo()" style="font-size:11px;padding:2px 8px">差し替ぁE/button>`;
        } else {
          html += `<button type="button" class="btn btn-ghost btn-sm" onclick="replaceAttachedVideo()" style="font-size:11px;padding:2px 8px;color:#f59e0b;border-color:#f59e0b">再添仁E/button>`;
        }
        html += `<button type="button" class="btn btn-ghost btn-sm" onclick="removeAttachedVideo()" style="font-size:11px;padding:2px 8px;color:#ef4444;border-color:#ef4444">✁E削除</button>`;
        actionsEl.innerHTML = html;
      }
    }

    function replaceAttachedVideo() {
      // 旧動画を一時保持し、ファイル選択ダイアログを開ぁE
      _pendingOldVideoForCleanup = _attachedVideoData ? { ..._attachedVideoData } : null;
      _attachedVideoData = null;
      const input = document.getElementById('rec-video-file-input');
      if (input) { input.value = ''; input.click(); }
    }

    async function removeAttachedVideo() {
      if (!_attachedVideoData) { resetRecordVideoUI(); return; }
      const status = _attachedVideoData.sync_status;

      // local_file: 一時添付解除のみ
      if (status === 'local_file') {
        _attachedVideoData = null;
        resetRecordVideoUI();
        showRecordToast("Notification");
        return;
      }

      // local_pending: IndexedDBから削除
      if (status === 'local_pending' && _attachedVideoData.local_key) {
        VideoStore.delete(_attachedVideoData.local_key).catch(e => console.warn('IndexedDB delete error:', e));
      }

      // drive_pending: Drive APIで削除�E�認証済みのみ�E�E
      if ((status === 'drive_pending' || status === 'pending') && _attachedVideoData.drive_file_id) {
        const tok = window._googleDriveAccessToken;
        if (tok) {
          fetch(`https://www.googleapis.com/drive/v3/files/${_attachedVideoData.drive_file_id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${tok}` }
          }).catch(e => console.warn('Drive delete error:', e));
        } else {
          showRecordToast("Notification");
        }
      }

      // yt_uploaded: 手動削除を案�E
      if (isYtStatus(status, _attachedVideoData.video_url)) {
        showRecordToast("Notification");
      }

      _attachedVideoData = null;
      resetRecordVideoUI();
      showRecordToast("Notification");
    }

    function isYtStatus(status, videoUrl) {
      return status === 'yt_uploaded' || status === 'uploaded' ||
             (videoUrl && videoUrl.includes('youtu'));
    }

    // ---- LOCAL VIDEO PLAYER & CLEANUP (30刁E��ローカル保持) ----
    let _currentPlayingObjectUrl = null;

    async function playLocalFolderVideoInDetail(recordId, fileName, containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;
      try {
        container.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px">⏳ ローカル動画を読み込み中...</div>';
        const dirHandle = await VideoStore.getHandle('local_video_dir');
        if (!dirHandle) {
          container.innerHTML = '<div style="font-size:12px;color:#ef4444;padding:8px">⚠�E�E保存�Eフォルダが未設定です。「データ管琁E��でフォルダを選択してください、E/div>';
          return;
        }
        const ok = await verifyFilePermission(dirHandle, false);
        if (!ok) {
          container.innerHTML = '<div style="font-size:12px;color:#ef4444;padding:8px">⚠�E�Eフォルダへのアクセス権限が許可されませんでした、E/div>';
          return;
        }
        let fileHandle;
        try {
          fileHandle = await dirHandle.getFileHandle(fileName);
        } catch (e) {
          container.innerHTML = `<div style="font-size:12px;color:#ef4444;padding:8px">⚠�E�E動画ファイル、E{fileName}」が持E��フォルダに見つかりませんでした。移動また�E削除された可能性があります、E/div>`;
          return;
        }
        const file = await fileHandle.getFile();
        if (_currentPlayingObjectUrl) {
          URL.revokeObjectURL(_currentPlayingObjectUrl);
          _currentPlayingObjectUrl = null;
        }
        _currentPlayingObjectUrl = URL.createObjectURL(file);
        container.innerHTML = `
          <div style="margin-top:6px;position:relative">
            <video src="${_currentPlayingObjectUrl}" controls playsinline autoplay style="width:100%;max-height:360px;border-radius:8px;background:#000;display:block"></video>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:4px;display:flex;justify-content:space-between;align-items:center">
              <span>📁 ローカル動画再生中 (通信量ゼロ・直接再生)</span>
              <button type="button" onclick="stopLocalFolderVideoPlayer('${containerId}', '${recordId}', '${fileName}')" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;font-size:11px">プレイヤーを閉じる ✁E/button>
            </div>
          </div>
        `;
      } catch (e) {
        console.error("Error");
        container.innerHTML = `<div style="font-size:12px;color:#ef4444;padding:8px">⚠�E�E動画の再生に失敗しました: ${e.message}</div>`;
      }
    }
    window.playLocalFolderVideoInDetail = playLocalFolderVideoInDetail;

    function stopLocalFolderVideoPlayer(containerId, recordId, fileName) {
      if (_currentPlayingObjectUrl) {
        URL.revokeObjectURL(_currentPlayingObjectUrl);
        _currentPlayingObjectUrl = null;
      }
      const container = document.getElementById(containerId);
      if (container) {
        container.innerHTML = `
          <button type="button" onclick="playLocalFolderVideoInDetail('${recordId}', '${fileName}', '${containerId}')" style="display:inline-flex;align-items:center;gap:6px;color:#ffffff;background:#3b82f6;padding:8px 14px;border:none;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(59,130,246,0.3)">
            <span>▶�E�Eローカル動画を�E甁E/span>
          </button>
          <div style="font-size:11px;color:var(--text-muted);margin-top:6px">📁 ファイル: ${fileName}</div>
        `;
      }
    }
    window.stopLocalFolderVideoPlayer = stopLocalFolderVideoPlayer;

    async function playLocalVideoInDetail(recordId, containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;
      try {
        container.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px">⏳ 動画を読み込み中...</div>';
        const file = await VideoStore.get(recordId);
        if (!file) {
          container.innerHTML = '<div style="font-size:12px;color:#ef4444;padding:8px">⚠�E�Eこ�E端末にはローカル動画がありません�E�別の端末で記録されたか、E0刁E��上経過して自動消去されました�E�E/div>';
          return;
        }
        if (_currentPlayingObjectUrl) {
          URL.revokeObjectURL(_currentPlayingObjectUrl);
          _currentPlayingObjectUrl = null;
        }
        _currentPlayingObjectUrl = URL.createObjectURL(file);
        container.innerHTML = `
          <div style="margin-top:6px;position:relative">
            <video src="${_currentPlayingObjectUrl}" controls playsinline autoplay style="width:100%;max-height:360px;border-radius:8px;background:#000;display:block"></video>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:4px;display:flex;justify-content:space-between;align-items:center">
              <span>📱 端末冁E��画再生中 (通信量ゼロ)</span>
              <button type="button" onclick="stopLocalVideoPlayer('${containerId}', '${recordId}')" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;font-size:11px">プレイヤーを閉じる ✁E/button>
            </div>
          </div>
        `;
      } catch (e) {
        console.error("Error");
        container.innerHTML = `<div style="font-size:12px;color:#ef4444;padding:8px">⚠�E�E動画の読み込みに失敗しました: ${e.message}</div>`;
      }
    }

    function stopLocalVideoPlayer(containerId, recordId) {
      if (_currentPlayingObjectUrl) {
        URL.revokeObjectURL(_currentPlayingObjectUrl);
        _currentPlayingObjectUrl = null;
      }
      const container = document.getElementById(containerId);
      if (container) {
        const rId = recordId || container.dataset.recordId;
        container.innerHTML = `
          <button type="button" onclick="playLocalVideoInDetail('${rId}', '${containerId}')" style="display:inline-flex;align-items:center;gap:6px;color:#ffffff;background:var(--accent);padding:8px 14px;border:none;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(108,99,255,0.3)">
            <span>▶�E�E端末冁E�E動画を�E甁E/span>
          </button>
        `;
      }
    }

    // DriveアチE�Eロード完亁E��E0刁E��過した動画をIndexedDBから安�Eに消去
    async function cleanupOldLocalVideos() {
      try {
        const now = Date.now();
        const THIRTY_MINUTES = 30 * 60 * 1000;
        for (const r of (records || [])) {
          // YouTube移行済みは即削除
          if (r.sync_status === 'yt_uploaded' || r.sync_status === 'uploaded') {
            await VideoStore.delete(r.id).catch(() => {});
          } else if (r.sync_status === 'drive_pending' && r.drive_uploaded_at && (now - r.drive_uploaded_at > THIRTY_MINUTES)) {
            await VideoStore.delete(r.id).catch(() => {});
          }
        }
      } catch (e) {
        console.warn('cleanupOldLocalVideos error:', e);
      }
    }

    function togglePauseVideoUpload() {
      if (!_currentVideoUploader) return;
      const btn = document.getElementById('rec-video-pause-btn');
      if (_currentVideoUploader.isPaused) {
        _currentVideoUploader.resume();
        if (btn) btn.textContent = '一時停止';
      } else {
        _currentVideoUploader.pause();
        if (btn) btn.textContent = '再開';
      }
    }

    function cancelVideoUpload() {
      if (_currentVideoUploader) {
        _currentVideoUploader.abort();
        _currentVideoUploader = null;
      }
      _isUploadQueueRunning = false;
      hideUploadPill();
      showRecordToast("Notification");
    }

    function resetRecordVideoUI() {
      _currentVideoUploader = null;
      const fileInput = document.getElementById('rec-video-file-input');
      if (fileInput) fileInput.value = '';
      const sec = document.getElementById('rec-video-select-section');
      if (sec) sec.style.display = 'block';
      const prog = document.getElementById('rec-video-progress-area');
      if (prog) prog.style.display = 'none';
      const info = document.getElementById('rec-video-attached-info');
      if (info) info.style.display = 'none';
    }

    // ---- UPLOAD QUEUE (WiFi接続時自動アチE�EローチE ----
    let _isUploadQueueRunning = false;
    let _uploadPillTimer = null;
    let _currentUploadingRecordId = null;

    function isWifiOrFastConnection() {
      const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (!c) return true; // iOS Safari等�ENetwork Information API非対応環墁E
      if (c.saveData) return false;
      if (c.type === 'cellular') return false;
      return true;
    }

    // Google Drive上�E既存ファイルを検索�E�中断・再起動時の自己修復用�E�E
    async function findDriveVideoFile(token, folderId, recordId) {
      try {
        let query = `name contains 'battle_log_${recordId}_' and trashed = false`;
        if (folderId) {
          query += ` and '${folderId}' in parents`;
        }
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`;
        const res = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.files && data.files.length > 0) {
          return data.files[0];
        }
      } catch (e) {
        console.warn('Drive existing file search error for record', recordId, e);
      }
      return null;
    }

    async function startUploadQueue(force = false) {
      if (_isUploadQueueRunning) return;

      // ローカル保存モード�E場合�EDrive/YouTubeアチE�Eロード�E一刁E��わなぁE
      if (getVideoStorageType() === 'local') return;

      // WiFi環墁E��なぁE��合�E自動アチE�Eロードを保留�E�通信量節紁E��E
      if (!force && !isWifiOrFastConnection()) {
        console.log("Log");
        return;
      }

      // Drive認証確認（有効なト�Eクンをメモリまた�ElocalStorageから取得！E
      let token = loadStoredDriveToken();
      if (!token) {
        // ト�Eクン未取征E期限刁E��の場合、E��携アクションピルを表示�E�未認証でDrive APIは呼ばなぁE��E
        const pendingCount = records.filter(r => r.sync_status === 'local_pending').length;
        if (pendingCount > 0 && getDriveClientId()) {
          showActionUploadPill("Action", () => {
            requestGoogleDriveAccessToken(true);
          });
        }
        return;
      }

      const folderId = getDriveFolderId();
      if (!folderId) return;

      _isUploadQueueRunning = true;

      try {
        const UploaderClass = window.GoogleDriveResumableUploader ||
          (typeof GoogleDriveResumableUploader !== 'undefined' ? GoogleDriveResumableUploader : null);
        if (!UploaderClass) { _isUploadQueueRunning = false; return; }

        let successCount = 0;

        // キュー実行中に新しい対戦が追加されても取りこぼさなぁE��ぁEwhile ループで処琁E
        while (true) {
          // 未送信の記録を「古ぁE��E��時系列�E頁E��」にソートして取征E
          const pendingRecords = records
            .filter(r => r.sync_status === 'local_pending')
            .sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));

          if (pendingRecords.length === 0) break;

          let processedAnyInThisPass = false;

          for (let i = 0; i < pendingRecords.length; i++) {
            const rec = pendingRecords[i];
            const pillText = `${i + 1}/${pendingRecords.length}件: ${rec.video_original_name || 'video'}`;
            showUploadPill(pillText, 0);

              // 【�E己修復】まずGoogle DriveにすでにアチE�Eロード済みファイルが存在するか確誁E
            const existingFile = await findDriveVideoFile(token, folderId, rec.id);
            if (existingFile) {
              console.log("Log");
              rec.drive_file_id = existingFile.id;
              rec.video_url = existingFile.webViewLink || `https://drive.google.com/file/d/${existingFile.id}/preview`;
              rec.sync_status = 'drive_pending';
              if (!rec.drive_uploaded_at) rec.drive_uploaded_at = Date.now();
              await saveData();
              cleanupOldLocalVideos(); // 30刁E��過した古ぁE��画のみ安�Eに消去
              renderHistory(); // 1件修復ごとに即座に画面更新
              successCount++;
              processedAnyInThisPass = true;
              continue;
            }

            // Driveに未存在の場合、IndexedDBから動画を取得してアチE�EローチE
            const file = await VideoStore.get(rec.id);
            if (!file) {
              console.warn(`Video data not found in IndexedDB for record ${rec.id}`);
              continue;
            }

            try {
              const customFileName = `battle_log_${rec.id}_${rec.video_original_name || 'video'}`;
              _currentVideoUploader = new UploaderClass({
                file,
                accessToken: token,
                folderId,
                customFileName,
                chunkSize: 5 * 1024 * 1024,
                onProgress: (prog) => updateUploadPill(prog.percent),
                onStatusChange: () => {}
              });

              const result = await _currentVideoUploader.start();
              _currentVideoUploader = null;

              // Firestore & ローカル更新
              rec.drive_file_id = result.id;
              rec.video_url = `https://drive.google.com/file/d/${result.id}/preview`;
              rec.sync_status = 'drive_pending';
              rec.drive_uploaded_at = Date.now(); // アチE�Eロード完亁E��刻を記録
              await saveData();

              // Drive処琁E��の30刁E��は端末からも動画を�E生できるよう残し、E0刁E��E��した過去動画のみ消去
              cleanupOldLocalVideos();

              renderHistory(); // 1件完亁E��とに即座に画面更新
              successCount++;
              processedAnyInThisPass = true;
            } catch(e) {
              _currentVideoUploader = null;
              _currentUploadingRecordId = null;
              if (e.message !== 'Upload aborted by user') {
                console.error("Error");
              }
              // こ�Eファイルでエラーが発生した場合�E次のループへ�E�無限ループ防止�E�E
              break;
            }
          }

          // こ�Eパスで1件も�E琁E��きなかった（ファイル不在めE��ラー�E�場合�E無限ループを防止して抜けめE
          if (!processedAnyInThisPass) break;
        }

        hideUploadPill();
        if (successCount > 0) {
          showRecordToast("Notification");
          renderHistory();
        }
      } finally {
        _isUploadQueueRunning = false;
      }
    }

    let _pillActionCallback = null;
    let _pillDragMoved = false;

    function showActionUploadPill("Action", onClick) {
      const pill = document.getElementById('upload-pill');
      const pillText = document.getElementById('upload-pill-text');
      const pillBar = document.getElementById('upload-pill-bar');
      const pillPercent = document.getElementById('upload-pill-percent');
      if (!pill) return;
      clearTimeout(_uploadPillTimer);
      _pillActionCallback = onClick;
      pill.style.display = 'flex';
      pill.style.cursor = 'grab';
      if (pillText) pillText.textContent = text;
      if (pillBar) pillBar.style.width = '0%';
      if (pillPercent) pillPercent.textContent = '👆';
    }

    function showUploadPill(text, percent) {
      const pill = document.getElementById('upload-pill');
      if (!pill) return;
      _pillActionCallback = null;
      pill.style.cursor = 'grab';
      const pillText = document.getElementById('upload-pill-text');
      const pillBar = document.getElementById('upload-pill-bar');
      const pillPercent = document.getElementById('upload-pill-percent');
      clearTimeout(_uploadPillTimer);
      pill.style.display = 'flex';
      if (pillText) pillText.textContent = text;
      if (pillBar) pillBar.style.width = percent + '%';
      if (pillPercent) pillPercent.textContent = percent + '%';
    }

    function updateUploadPill(percent) {
      const pillBar = document.getElementById('upload-pill-bar');
      const pillPercent = document.getElementById('upload-pill-percent');
      if (pillBar) pillBar.style.width = percent + '%';
      if (pillPercent) pillPercent.textContent = Math.round(percent) + '%';
    }

    function hideUploadPill() {
      const pill = document.getElementById('upload-pill');
      if (!pill) return;
      const pillText = document.getElementById('upload-pill-text');
      const pillBar = document.getElementById('upload-pill-bar');
      const pillPercent = document.getElementById('upload-pill-percent');
      if (pillText) pillText.textContent = 'アチE�Eロード完亁E��E;
      if (pillBar) pillBar.style.width = '100%';
      if (pillPercent) pillPercent.textContent = '✁E;
      clearTimeout(_uploadPillTimer);
      _uploadPillTimer = setTimeout(() => { pill.style.display = 'none'; }, 2500);
    }

    function closeUploadPill(e) {
      if (e) e.stopPropagation();
      const pill = document.getElementById('upload-pill');
      if (pill) pill.style.display = 'none';
      clearTimeout(_uploadPillTimer);
    }

    // ドラチE���E�E��ロチE�E機�Eの初期匁E
    function initDraggableUploadPill() {
      const pill = document.getElementById('upload-pill');
      if (!pill) return;

      let isDragging = false;
      let startX, startY, initialLeft, initialTop;

      function onStart(e) {
        const target = e.target;
        if (target && target.closest('.pill-close-btn')) return;

        isDragging = true;
        _pillDragMoved = false;
        const pt = e.touches ? e.touches[0] : e;
        startX = pt.clientX;
        startY = pt.clientY;

        const rect = pill.getBoundingClientRect();
        // right/bottom固定かめEleft/top絶対持E��に刁E��替ぁE
        pill.style.right = 'auto';
        pill.style.bottom = 'auto';
        pill.style.left = rect.left + 'px';
        pill.style.top = rect.top + 'px';
        initialLeft = rect.left;
        initialTop = rect.top;
        pill.style.cursor = 'grabbing';
      }

      function onMove(e) {
        if (!isDragging) return;
        const pt = e.touches ? e.touches[0] : e;
        const dx = pt.clientX - startX;
        const dy = pt.clientY - startY;

        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          _pillDragMoved = true;
        }

        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;

        // 画面外にはみ出さなぁE��ぁE��陁E
        const maxLeft = window.innerWidth - pill.offsetWidth - 8;
        const maxTop = window.innerHeight - pill.offsetHeight - 8;
        newLeft = Math.max(8, Math.min(newLeft, maxLeft));
        newTop = Math.max(8, Math.min(newTop, maxTop));

        pill.style.left = newLeft + 'px';
        pill.style.top = newTop + 'px';
      }

      function onEnd(e) {
        if (!isDragging) return;
        isDragging = false;
        pill.style.cursor = 'grab';

        // ドラチE��移動しなかった場合（クリチE��判定！E
        if (!_pillDragMoved && _pillActionCallback) {
          _pillActionCallback();
        }
      }

      pill.addEventListener('mousedown', onStart);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onEnd);

      pill.addEventListener('touchstart', onStart, { passive: true });
      window.addEventListener('touchmove', onMove, { passive: true });
      window.addEventListener('touchend', onEnd);
    }

    document.addEventListener('DOMContentLoaded', initDraggableUploadPill);

    // ---- DETAIL MODAL ----
    function openDetail(id) {
      const r = records.find(x => x.id === id);
      if (!r) return;
      const party = parties.find(p => p.id === r.partyId);
      const dateStr = r.date ? new Date(r.date).toLocaleString('ja-JP') : '';

      let headerResultHtml = '';
      if (r.format === 'bo3' && r.games && r.games.length > 0) {
        headerResultHtml = r.games.map((g, idx) => {
          if (g.result === 'win') return `<span class="badge-win" style="font-size:15px;padding:4px 12px">🏆 ${idx + 1}戦目: 勝ち</span>`;
          if (g.result === 'lose') return `<span class="badge-lose" style="font-size:15px;padding:4px 12px">💀 ${idx + 1}戦目: 負ぁE/span>`;
          return `<span class="badge-draw" style="font-size:15px;padding:4px 12px">🤁E${idx + 1}戦目: 引き刁E��</span>`;
        }).join(' ');
      } else {
        const isWin = r.result === 'win';
        const isDraw = r.result === 'draw';
        const badgeCls = isWin ? 'badge-win' : (isDraw ? 'badge-draw' : 'badge-lose');
        const badgeTxt = isWin ? '🏆 勝ち' : (isDraw ? '🤁E引き刁E��' : '💀 負ぁE);
        headerResultHtml = `<span class="${badgeCls}" style="font-size:16px;padding:4px 16px">${badgeTxt}</span>`;
      }

      let selectionDetailHtml = '';
      if (r.format === 'bo3' && r.games && r.games.length > 0) {
        selectionDetailHtml = r.games.map((g, idx) => {
          const mySel = (g.mySelection || []).filter(Boolean);
          const oppSel = (g.oppSelection || []).filter(Boolean);
          return `
            <div class="detail-section">
              <h4>${idx + 1}戦目の自刁E�E選出�E�E体！E/h4>
              <div class="detail-pokemon">
                ${mySel.map(p => getPokeSpriteHTMLByDisplay(p)).join('') || '<span class="text-muted">記録なぁE/span>'}
              </div>
            </div>
            <div class="detail-section">
              <h4>${idx + 1}戦目の相手�E選出�E�E体！E/h4>
              <div class="detail-pokemon">
                ${oppSel.map(p => getPokeSpriteHTMLByDisplay(p)).join('') || '<span class="text-muted">記録なぁE/span>'}
              </div>
            </div>
          `;
        }).join('');
      } else {
        const mySel = (r.mySelection || []).filter(Boolean);
        const oppSel = (r.oppSelection || []).filter(Boolean);
        selectionDetailHtml = `
          <div class="detail-section">
            <h4>自刁E�E選出�E�E体！E/h4>
            <div class="detail-pokemon">
              ${mySel.map(p => getPokeSpriteHTMLByDisplay(p)).join('') || '<span class="text-muted">記録なぁE/span>'}
            </div>
          </div>
          <div class="detail-section">
            <h4>相手�E選出�E�E体！E/h4>
            <div class="detail-pokemon">
              ${oppSel.map(p => getPokeSpriteHTMLByDisplay(p)).join('') || '<span class="text-muted">記録なぁE/span>'}
            </div>
          </div>
        `;
      }

      let replayLinkHtml = '';
      if (r.format === 'bo3') {
        const urls = r.showdownUrls || (r.showdownUrl ? [r.showdownUrl] : []);
        const validLinks = urls.map((u, idx) => {
          if (!u || !u.trim()) return '';
          return `<a href="${u.trim()}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:underline;font-size:13px;word-break:break-all;display:inline-block">🔗 ${idx + 1}戦目の対戦記録</a>`;
        }).filter(Boolean);

        if (validLinks.length > 0) {
          replayLinkHtml = `
            <div class="detail-section">
              <h4>対戦記録 (Showdown)</h4>
              <div style="display:flex;flex-direction:column;gap:6px">
                ${validLinks.join('')}
              </div>
            </div>
          `;
        }
      } else {
        const u = r.showdownUrl || (r.showdownUrls && r.showdownUrls[0]) || '';
        if (u && u.trim()) {
          replayLinkHtml = `
            <div class="detail-section">
              <h4>対戦記録 (Showdown)</h4>
              <div>
                <a href="${u.trim()}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:underline;font-size:13px;word-break:break-all;display:inline-block">🔗 対戦記録</a>
              </div>
            </div>
          `;
        }
      }

      // 動画録画リンク�E�ローカルフォルダ保存、端末冁E��時保存、YouTube、Google Drive�E�E
      let videoLinkHtml = '';
      if (r.sync_status === 'local_file') {
        const fn = r.local_file_name || 'battle_video.webm';
        videoLinkHtml = `
          <div class="detail-section">
            <h4>🎥 対戦録画 (ローカルフォルダ保孁E</h4>
            <div id="local-video-player-box" data-record-id="${r.id}">
              <button type="button" onclick="playLocalFolderVideoInDetail('${r.id}', '${fn}', 'local-video-player-box')" style="display:inline-flex;align-items:center;gap:6px;color:#ffffff;background:#3b82f6;padding:8px 14px;border:none;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(59,130,246,0.3)">
                <span>▶�E�Eローカル動画を�E甁E/span>
              </button>
              <div style="font-size:11px;color:var(--text-muted);margin-top:6px">📁 ファイル: ${fn}</div>
            </div>
          </div>
        `;
      } else if (r.sync_status === 'local_pending') {
        videoLinkHtml = `
          <div class="detail-section">
            <h4>🎥 対戦録画 (端末冁E��孁E</h4>
            <div id="local-video-player-box" data-record-id="${r.id}">
              <button type="button" onclick="playLocalVideoInDetail('${r.id}', 'local-video-player-box')" style="display:inline-flex;align-items:center;gap:6px;color:#ffffff;background:var(--accent);padding:8px 14px;border:none;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(108,99,255,0.3)">
                <span>▶�E�E端末冁E�E動画を�E甁E/span>
              </button>
              <div style="font-size:11px;color:var(--text-muted);margin-top:6px">⏳ WiFi接続時にGoogle Driveへ自動アチE�EロードされまぁE/div>
            </div>
          </div>
        `;
      } else if (r.video_url || r.drive_file_id || r.youtube_video_id) {
        const isUploaded = r.sync_status === 'uploaded' || r.sync_status === 'yt_uploaded' || (r.video_url && r.video_url.includes('youtu'));
        const url = r.video_url || (r.youtube_video_id ? `https://youtu.be/${r.youtube_video_id}` : (r.drive_file_id ? `https://drive.google.com/file/d/${r.drive_file_id}/preview` : ''));
        
        if (url) {
          if (isUploaded) {
            videoLinkHtml = `
              <div class="detail-section">
                <h4>🎥 対戦録画 (YouTube)</h4>
                <a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;color:#ffffff;background:#dc2626;padding:8px 14px;border-radius:8px;font-weight:600;font-size:13px;text-decoration:none;box-shadow:0 2px 8px rgba(220,38,38,0.3)">
                  <span>▶�E�EYouTubeで見る</span>
                  <span style="font-size:11px;opacity:0.85">�E�限定�E開！E/span>
                </a>
              </div>
            `;
          } else {
            const isWithin30Min = r.drive_uploaded_at && (Date.now() - r.drive_uploaded_at < 30 * 60 * 1000);
            videoLinkHtml = `
              <div class="detail-section">
                <h4>🎥 対戦録画 (Google Drive一時保孁E</h4>
                <div style="display:flex;flex-direction:column;gap:8px">
                  ${isWithin30Min ? `
                  <div id="local-video-player-box" data-record-id="${r.id}">
                    <button type="button" onclick="playLocalVideoInDetail('${r.id}', 'local-video-player-box')" style="display:inline-flex;align-items:center;gap:6px;color:#ffffff;background:var(--accent);padding:8px 14px;border:none;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;width:fit-content;box-shadow:0 2px 8px rgba(108,99,255,0.3)">
                      <span>📱 端末冁E�E動画を�E甁E(処琁E��E��なぁE</span>
                    </button>
                    <div style="font-size:11px;color:#a78bfa;margin-top:4px">💡 Drive処琁E��も端末から即座に快適再生できます（送信征E0刁E��保持�E�E/div>
                  </div>` : ''}
                  <a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;color:#ffffff;background:#22c55e;padding:8px 14px;border-radius:8px;font-weight:600;font-size:13px;text-decoration:none;width:fit-content;box-shadow:0 2px 8px rgba(34,197,94,0.3)">
                    <span>📁 Google Driveで開く</span>
                  </a>
                  <span style="font-size:11px;color:var(--text-muted)">⏳ 本日夜間の定期バッチでYouTubeへ自動転送されまぁE/span>
                </div>
              </div>
            `;
          }
        }
      }

      let metaBadgesDetailHtml = '';
      if (r.regulation) {
        metaBadgesDetailHtml += `<span class="badge-meta badge-reg" style="font-size:12px;padding:3px 8px">📜 ${r.regulation}</span>`;
      }
      if (r.season) {
        metaBadgesDetailHtml += `<span class="badge-meta badge-season" style="font-size:12px;padding:3px 8px">📅 ${r.season}</span>`;
      }
      const matchTypeDetail = r.matchType || (r.sourceMode === 'showdown' ? 'showdown' : 'ランクチE);
      if (matchTypeDetail) {
        metaBadgesDetailHtml += `<span class="badge-meta badge-match-type" style="font-size:12px;padding:3px 8px">🎮 ${matchTypeDetail}</span>`;
      }
      if (r.tags && Array.isArray(r.tags) && r.tags.length > 0) {
        r.tags.forEach(t => {
          metaBadgesDetailHtml += `<span class="badge-meta badge-tag-item" style="font-size:12px;padding:3px 8px">🏷�E�E${t}</span>`;
        });
      }

      document.getElementById('detail-content').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      ${headerResultHtml}
      <span style="color:var(--text-muted);font-size:13px">${dateStr}</span>
      ${metaBadgesDetailHtml}
    </div>
    ${r.oppTrainer ? `<div style="margin-bottom:${r.oppRating ? '6px' : '14px'}"><span style="font-size:12px;color:var(--text-muted)">相手トレーナ�E: </span><span style="font-weight:700;font-size:14px;color:var(--accent)">👤 ${r.oppTrainer}</span></div>` : ''}
    ${r.oppRating ? `<div style="margin-bottom:14px"><span style="font-size:12px;color:var(--text-muted)">相手レーチE </span><span style="font-weight:700;font-size:14px;color:var(--text)"><span style="color:#f59e0b">☁E/span> ${r.oppRating}</span></div>` : ''}
    <div class="detail-section">
      <h4>自刁E�Eパ�EチE��</h4>
      <div class="detail-pokemon">
        ${(party ? party.pokemon.map(pk => typeof pk === 'string' ? pk : (pk && pk.name || '')).filter(Boolean) : []).map(p => getPokeSpriteHTMLByDisplay(p)).join('') || '<span class="text-muted">(削除済み)</span>'}
      </div>
    </div>
    <div class="detail-section">
      <h4>相手�Eパ�EチE���E�E体！E/h4>
      <div class="detail-pokemon">
        ${(r.oppParty || []).filter(Boolean).map(p => getPokeSpriteHTMLByDisplay(p)).join('') || '<span class="text-muted">記録なぁE/span>'}
      </div>
    </div>
    ${selectionDetailHtml}
    ${r.memo ? `<div class="detail-section"><h4>メモ</h4><p style="font-size:13px">${r.memo}</p></div>` : ''}
    ${replayLinkHtml}
    ${videoLinkHtml}
  `;

      const editBtn = document.getElementById('detail-edit-btn');
      if (editBtn) editBtn.onclick = () => editRecord(id);
      document.getElementById('detail-delete-btn').onclick = () => deleteRecord(id);
      document.getElementById('detail-modal').classList.add('open');
    }

    function closeDetailModal() {
      if (_currentPlayingObjectUrl) {
        URL.revokeObjectURL(_currentPlayingObjectUrl);
        _currentPlayingObjectUrl = null;
      }
      document.getElementById('detail-modal').classList.remove('open');
    }

    function editRecord(id) {
      const r = records.find(x => x.id === id);
      if (!r) return;

      editingRecordId = id;
      closeDetailModal();

      // ナビゲーションバ�Eの「記録する」�EタンをアクチE��ブにしてタブ�E移
      const navBtns = document.querySelectorAll('nav button');
      const recordNavBtn = Array.from(navBtns).find(b => b.textContent.includes('記録する'));
      showPage('record', recordNavBtn);

      // モード�Eり替ぁE& Showdown URL復允E
      if (r.sourceMode === 'showdown' || r.showdownUrl || (r.showdownUrls && r.showdownUrls.some(Boolean))) {
        setRecordMode('showdown');
        if (r.format === 'bo1') {
          const sdInput = document.getElementById('rec-showdown-url');
          if (sdInput) sdInput.value = r.showdownUrl || (r.showdownUrls && r.showdownUrls[0]) || '';
        } else {
          const urls = r.showdownUrls || (r.showdownUrl ? [r.showdownUrl] : []);
          for (let i = 0; i < 3; i++) {
            const sdInput = document.getElementById(`rec-showdown-url-${i}`);
            if (sdInput) sdInput.value = urls[i] || '';
          }
        }
      } else {
        setRecordMode('champions');
      }

      // フォーマット設宁E
      const fmt = r.format || 'bo1';
      setRecordFormat(fmt);

      // パ�EチE��選抁E
      selectedPartyId = r.partyId || null;
      renderRecordPage();

      if (selectedPartyId) {
        showRecordForm();

        // 日時を復允E
        if (r.date) {
          document.getElementById('rec-date').value = r.date;
        }

        // レギュレーション・シーズン・形式�Eタグの復允E
        currentRecordRegulation = r.regulation !== undefined ? r.regulation : '';
        currentRecordSeason = r.season !== undefined ? r.season : '';
        currentRecordMatchType = r.matchType || (r.sourceMode === 'showdown' ? 'showdown' : 'ランクチE);
        currentRecordTags = Array.isArray(r.tags) ? [...r.tags] : [];

        initRegulationSelect('rec-regulation', currentRecordRegulation);
        initSeasonSelect('rec-season', currentRecordSeason);
        setRecordMatchType(currentRecordMatchType);
        renderRecordTagChips();

        // 相手トレーナ�E名�Eレート�Eメモ
        const recOppTrainer = document.getElementById('rec-opp-trainer');
        if (recOppTrainer) recOppTrainer.value = r.oppTrainer || '';
        const recOppRating = document.getElementById('rec-opp-rating');
        if (recOppRating) recOppRating.value = r.oppRating || '';
        document.getElementById('rec-memo').value = r.memo || '';

        // 相手パーチE���E�E体！E
        if (r.oppParty && Array.isArray(r.oppParty)) {
          setSlotValues('opp-party-slots', r.oppParty);
        }
        rebuildOppSelectionDropdowns();

        // 選出 & 勝敗
        if (fmt === 'bo1') {
          setSelectionFromNames('my', r.mySelection);
          setSelectionFromNames('opp', r.oppSelection);
          setResult(r.result);
        } else {
          // BO3
          bo3Games = [
            { mySelectionOrder: [], oppSelectionOrder: [], result: null },
            { mySelectionOrder: [], oppSelectionOrder: [], result: null },
            { mySelectionOrder: [], oppSelectionOrder: [], result: null }
          ];
          if (r.games && Array.isArray(r.games)) {
            r.games.forEach((g, idx) => {
              if (idx < 3) {
                setSelectionFromNames('my', g.mySelection, idx);
                setSelectionFromNames('opp', g.oppSelection, idx);
                setBo3Result(idx, g.result);
              }
            });
          } else if (r.result) {
            setSelectionFromNames('my', r.mySelection, 0);
            setSelectionFromNames('opp', r.oppSelection, 0);
            setBo3Result(0, r.result);
          }
          updateBo3Score();
        }

        // 動画添付情報の復允E���E状態対応！E
        if (r.sync_status === 'local_file' || r.sync_status === 'local_pending' || r.drive_file_id || r.video_url || r.youtube_video_id) {
          _attachedVideoData = {
            local_key: r.sync_status === 'local_pending' ? r.id : null,
            local_file_name: r.local_file_name || '',
            drive_file_id: r.drive_file_id || '',
            video_url: r.video_url || '',
            sync_status: r.sync_status || 'pending',
            created_at: r.created_at || Date.now(),
            youtube_video_id: r.youtube_video_id || '',
            original_name: r.video_original_name || (
              (r.sync_status === 'yt_uploaded' || r.sync_status === 'uploaded') ? 'YouTube動画' :
              r.sync_status === 'local_file' ? (r.local_file_name || 'ローカル動画') :
              r.sync_status === 'local_pending' ? '保存済み動画' : 'Google Drive動画'
            )
          };
          // local_pendingの場合、IndexedDBにチE�Eタがあるか確誁E
          if (r.sync_status === 'local_file') {
            showAttachedVideoUI(_attachedVideoData);
          } else if (r.sync_status === 'local_pending') {
            VideoStore.get(r.id).then(file => {
              if (!file && _attachedVideoData) {
                _attachedVideoData.sync_status = 'lost';
              }
              showAttachedVideoUI(_attachedVideoData);
            }).catch(() => showAttachedVideoUI(_attachedVideoData));
          } else {
            showAttachedVideoUI(_attachedVideoData);
          }
        } else {
          _attachedVideoData = null;
          resetRecordVideoUI();
        }
      }

      updateRecordFormEditModeUI();

      const pageEl = document.getElementById('page-record');
      if (pageEl) pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function cancelRecordEdit() {
      editingRecordId = null;
      _attachedVideoData = null;
      resetRecordVideoUI();
      updateRecordFormEditModeUI();
      recordResult = null;
      document.getElementById('btn-win').classList.remove('active');
      document.getElementById('btn-lose').classList.remove('active');
      document.getElementById('btn-draw')?.classList.remove('active');
      bo3Games = [
        { mySelectionOrder: [], oppSelectionOrder: [], result: null },
        { mySelectionOrder: [], oppSelectionOrder: [], result: null },
        { mySelectionOrder: [], oppSelectionOrder: [], result: null }
      ];
      renderRecordPage();
      showRecordForm();
      showRecordToast("Notification");
    }

    function updateRecordFormEditModeUI() {
      const titleEl = document.getElementById('record-page-title');
      const saveBtn = document.getElementById('record-save-btn');
      const cancelBtnTop = document.getElementById('record-cancel-edit-btn');
      const cancelBtnBottom = document.getElementById('record-cancel-edit-btn-bottom');

      if (editingRecordId) {
        if (titleEl) titleEl.innerHTML = '✏︁E対戦記録の編雁E;
        if (saveBtn) saveBtn.innerHTML = '💾 変更を保孁E;
        if (cancelBtnTop) cancelBtnTop.style.display = 'inline-flex';
        if (cancelBtnBottom) cancelBtnBottom.style.display = 'inline-flex';
      } else {
        if (titleEl) titleEl.innerHTML = '対戦を記録する';
        if (saveBtn) saveBtn.innerHTML = '💾 記録を保孁E;
        if (cancelBtnTop) cancelBtnTop.style.display = 'none';
        if (cancelBtnBottom) cancelBtnBottom.style.display = 'none';
      }
    }

    async function deleteRecord(id) {
      const targetRec = records.find(r => r.id === id);
      if (!targetRec) return;
      if (!confirm("Confirm?")) return;

      if (editingRecordId === id) {
        editingRecordId = null;
        updateRecordFormEditModeUI();
      }

      // 1. もし今まさにこ�Eレコード�E動画をアチE�Eロード中なら中断
      if (_currentUploadingRecordId === id && _currentVideoUploader) {
        try {
          _currentVideoUploader.abort();
        } catch (e) {}
        _currentVideoUploader = null;
        _currentUploadingRecordId = null;
        hideUploadPill();
      }

      // 2. IndexedDBの動画チE�Eタを削除�E�端末容量解放�E�E
      try {
        await VideoStore.delete(id);
      } catch (e) {
        console.warn('IndexedDB delete error on deleteRecord:', e);
      }

      // 3. Google Driveに保存済みの場合�EDrive上�Eファイルを削除
      let driveDeleted = false;
      if (targetRec.drive_file_id) {
        const token = loadStoredDriveToken();
        if (token) {
          try {
            await fetch('https://www.googleapis.com/drive/v3/files/' + targetRec.drive_file_id, {
              method: 'DELETE',
              headers: { Authorization: 'Bearer ' + token }
            });
            driveDeleted = true;
          } catch (e) {
            console.warn('Drive file deletion failed:', e);
          }
        }
      }

      // 4. Firestore / localStorage から削除
      records = records.filter(r => r.id !== id); deleteRecordDoc(id);
      saveData();
      closeDetailModal();
      renderHistory();

      // 5. 征E��ピルの再計算�E更新
      const remainingPending = records.filter(r => r.sync_status === 'local_pending').length;
      if (remainingPending === 0) {
        closeUploadPill(); // 未送信動画ぁE件なら即座にメチE��ージを完�E消去
      } else if (!loadStoredDriveToken()) {
        showActionUploadPill("Action", () => {
          requestGoogleDriveAccessToken(true);
        });
      }

      // 6. メチE��ージ案�E
      if (targetRec.drive_file_id) {
        if (driveDeleted) {
          showRecordToast("Notification");
        } else {
          showRecordToast("Notification");
        }
      } else if (targetRec.sync_status === 'yt_uploaded' || targetRec.youtube_video_id) {
        showRecordToast("Notification");
      } else {
        showRecordToast("Notification");
      }
    }


    // ---- DATA MANAGE ----
    let dmType = null;
    let dmAction = null;
    let dmEditIndex = null;
    let localPokemon = [];
    let localMoves = [];

    const NATURES_DATA = [
      { name: "さみしがめE, up: "atk", down: "def" },
      { name: "ぁE��っぱめE, up: "atk", down: "spa" },
      { name: "めE��ちめE, up: "atk", down: "spd" },
      { name: "めE��かん", up: "atk", down: "spe" },
      { name: "ず�EとぁE, up: "def", down: "atk" },
      { name: "わんぱぁE, up: "def", down: "spa" },
      { name: "のぁE��んき", up: "def", down: "spd" },
      { name: "のんき", up: "def", down: "spe" },
      { name: "ひかえめE, up: "spa", down: "atk" },
      { name: "おっとめE, up: "spa", down: "def" },
      { name: "ぁE��かりめE, up: "spa", down: "spd" },
      { name: "れいせい", up: "spa", down: "spe" },
      { name: "おだめE��", up: "spd", down: "atk" },
      { name: "おとなしい", up: "spd", down: "def" },
      { name: "しんちめE��", up: "spd", down: "spa" },
      { name: "なまぁE��", up: "spd", down: "spe" },
      { name: "おくびめE��", up: "spe", down: "atk" },
      { name: "せっかち", up: "spe", down: "def" },
      { name: "ようぁE, up: "spe", down: "spa" },
      { name: "むじゃぁE, up: "spe", down: "spd" },
      { name: "てれや", up: null, down: null },
      { name: "がんばりや", up: null, down: null },
      { name: "すなぁE, up: null, down: null },
      { name: "きまぐれ", up: null, down: null },
      { name: "まじめ", up: null, down: null }
    ];

    let localItems = []; // 持ち物リスト！Eonfirmed付き�E�E
    // 古ぁEocalStorageキーをクリア�E�Ekm_master_pokemonは旧方式！E
    localStorage.removeItem('pkm_master_pokemon');

    function dmSelectType(type) {
      dmType = type; dmAction = null; dmEditIndex = null;
      document.getElementById('dm-tab-pokemon').className = 'btn ' + (type === 'pokemon' ? 'btn-primary' : 'btn-ghost');
      document.getElementById('dm-tab-move').className = 'btn ' + (type === 'move' ? 'btn-primary' : 'btn-ghost');
      document.getElementById('dm-tab-item').className = 'btn ' + (type === 'item' ? 'btn-primary' : 'btn-ghost');
      document.getElementById('dm-action-area').style.display = 'block';
      document.getElementById('dm-search-area').style.display = 'none';
      document.getElementById('dm-form-card').style.display = 'none';
      document.getElementById('dm-list-card').style.display = 'none';
      const btnList = document.getElementById('dm-btn-list');
      if (btnList) btnList.className = 'btn btn-ghost';
      // 持ち物は「検索・編雁E���E「検索」に変更
      document.getElementById('dm-btn-search').textContent = type === 'item' ? '🔍 検索' : '🔍 検索・編雁E;
      document.getElementById('dm-btn-search').className = 'btn btn-ghost';
      document.getElementById('dm-search-input').value = '';
      document.getElementById('dm-search-list').classList.remove('open');
    }

    function dmSelectAction(action) {
      // 一覧(list)は全員OK、searchは管琁E��E�Eみ�E�Eddは廁E���E�E
      if (!isAdmin() && action !== 'list') return;
      dmAction = action;
      const btnList = document.getElementById('dm-btn-list');
      if (btnList) btnList.className = 'btn ' + (action === 'list' ? 'btn-primary' : 'btn-ghost');
      document.getElementById('dm-btn-search').className = 'btn ' + (action === 'search' ? 'btn-primary' : 'btn-ghost');
      document.getElementById('dm-list-card').style.display = action === 'list' ? 'block' : 'none';
      if (action === 'list') {
        renderDmList();
        // 技・持ち物の一覧でも管琁E��E��保存�Eタン表示
        const saveBtn = document.querySelector('#dm-list-card .btn-primary');
        const cancelBtn = document.querySelector('#dm-list-card .btn-ghost');
        if (isAdmin() && (dmType === 'move' || dmType === 'item')) {
          if (saveBtn) saveBtn.style.display = 'inline-flex';
          if (cancelBtn) cancelBtn.style.display = 'inline-flex';
        } else {
          if (saveBtn) saveBtn.style.display = '';
          if (cancelBtn) cancelBtn.style.display = '';
        }
        return;
      }
      if (action === 'search') {
        document.getElementById('dm-search-area').style.display = 'block';
        if (dmType === 'pokemon') {
          document.getElementById('dm-search-label').textContent = 'ポケモン名で検索';
          document.getElementById('dm-search-input').placeholder = 'ポケモン名を入劁E..';
        } else if (dmType === 'item') {
          document.getElementById('dm-search-label').textContent = '持ち物名で検索';
          document.getElementById('dm-search-input').placeholder = '持ち物名を入劁E..';
        } else {
          document.getElementById('dm-search-label').textContent = '技名で検索';
          document.getElementById('dm-search-input').placeholder = '技名を入劁E..';
        }
        document.getElementById('dm-form-card').style.display = 'none';
      }
    }

    function dmOnSearchInput(input) {
      const val = input.value.trim();
      const list = document.getElementById('dm-search-list');
      if (!val) { list.classList.remove('open'); return; }
      const valKana = toKatakana(val);
      const valHira = toHiragana(val);
      let entries;
      if (dmType === 'pokemon') {
        const all = localPokemon.filter(p => {
          const dH = toHiragana(p.display);
          return p.display.includes(valKana) || dH.includes(valHira);
        }); // チE�Eタ管琁E�E冁E��フィルタなし�E全件検索
        const sw = all.filter(p => toHiragana(p.display).startsWith(valHira) || p.display.startsWith(valKana));
        const ot = all.filter(p => !toHiragana(p.display).startsWith(valHira) && !p.display.startsWith(valKana));
        entries = [...sw, ...ot].slice(0, 20).map(p => ({ label: p.display, idx: localPokemon.indexOf(p) }));
      } else if (dmType === 'item') {
        // 持ち物検索�E�名前�Eみ、表示だけでformは開かなぁE��E
        const all = localItems.filter(name => {
          const dH = toHiragana(name);
          return name.includes(valKana) || dH.includes(valHira);
        });
        const sw = all.filter(name => toHiragana(name).startsWith(valHira) || name.startsWith(valKana));
        const ot = all.filter(name => !toHiragana(name).startsWith(valHira) && !name.startsWith(valKana));
        entries = [...sw, ...ot].slice(0, 20).map(name => ({ label: name, idx: -1, isItem: true }));
      } else {
        const all = localMoves.filter(m => {
          const dH = toHiragana(m.name);
          return m.name.includes(valKana) || dH.includes(valHira);
        });
        const sw = all.filter(m => toHiragana(m.name).startsWith(valHira) || m.name.startsWith(valKana));
        const ot = all.filter(m => !toHiragana(m.name).startsWith(valHira) && !m.name.startsWith(valKana));
        entries = [...sw, ...ot].slice(0, 20).map(m => ({ label: m.name, idx: localMoves.indexOf(m) }));
      }
      if (!entries.length) { list.classList.remove('open'); return; }
      list.innerHTML = entries.map(e => `<div class="autocomplete-item" data-idx="${e.idx}" data-is-item="${e.isItem || false}">${e.label}</div>`).join('');
      list.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('mousedown', ev => {
          ev.preventDefault();
          input.value = item.textContent;
          list.classList.remove('open');
          // 持ち物はフォームを開かず、一覧カードに結果を表示するだぁE
          if (item.dataset.isItem === 'true') {
            dmShowItemResult(item.textContent);
          } else {
            dmShowForm(parseInt(item.dataset.idx));
          }
        });
      });
      list.classList.add('open');
    }

    function dmOnSearchKeydown(e, input) {
      const list = document.getElementById('dm-search-list');
      const items = list.querySelectorAll('.autocomplete-item');
      const cur = list.querySelector('.selected');
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!cur) items[0]?.classList.add('selected'); else { cur.classList.remove('selected'); (cur.nextElementSibling || items[0])?.classList.add('selected'); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (cur) { cur.classList.remove('selected'); (cur.previousElementSibling || items[items.length - 1])?.classList.add('selected'); } }
      else if (e.key === 'Enter') { e.preventDefault(); const sel = list.querySelector('.selected') || items[0]; if (sel) { input.value = sel.textContent; list.classList.remove('open'); if (sel.dataset.isItem === 'true') { dmShowItemResult(sel.textContent); } else { dmShowForm(parseInt(sel.dataset.idx)); } } }
      else if (e.key === 'Escape') { list.classList.remove('open'); }
    }

    function dmShowForm(idx) {
      if (idx === null) return; // 新規追加は廁E��
      dmEditIndex = idx;
      const card = document.getElementById('dm-form-card');
      const title = document.getElementById('dm-form-title');
      const fields = document.getElementById('dm-form-fields');
      card.style.display = 'block';
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });

      if (dmType === 'pokemon') {
        title.textContent = 'ポケモンを編雁E;
        const d = localPokemon[idx];
        if (d.confirmed === undefined) d.confirmed = true;
        const v = k => (d[k] ?? '').replace(/"/g, '&quot;');
        fields.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">基本惁E��</div><label style="display:flex;align-items:center;gap:6px;font-size:14px;cursor:pointer"><input type="checkbox" id="dmf-confirmed" style="width:18px;height:18px;accent-color:var(--accent)" ${d.confirmed ? 'checked' : ''}><span style="color:var(--accent);font-weight:600">冁E��E/span></label></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px">
        <div><label>図鑑No</label><input type="text" id="dmf-no"      value="${v('no')}"></div>
        <div><label>名前</label><input type="text" id="dmf-name"    value="${v('name')}"    oninput="dmAutoDisplay()"></div>
        <div><label>フォルム吁E/label><input type="text" id="dmf-form"    value="${v('form')}"    oninput="dmAutoDisplay()"></div>
        <div><label>表示吁E/label><input type="text" id="dmf-display" value="${v('display')}" readonly style="opacity:0.6"></div>
      </div>
      <div style="margin-bottom:6px;font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">タイチE/div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px">
        <div><label>タイチE</label><input type="text" id="dmf-type1" value="${v('type1')}"></div>
        <div><label>タイチE</label><input type="text" id="dmf-type2" value="${v('type2')}"></div>
      </div>
      <div style="margin-bottom:6px;font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">種族値</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:10px;margin-bottom:14px">
        <div><label>HP</label><input    type="text" id="dmf-hp"    value="${v('hp')}"></div>
        <div><label>攻撁E/label><input  type="text" id="dmf-atk"   value="${v('atk')}"></div>
        <div><label>防御</label><input  type="text" id="dmf-def"   value="${v('def')}"></div>
        <div><label>特攻</label><input  type="text" id="dmf-spatk" value="${v('spatk')}"></div>
        <div><label>特防</label><input  type="text" id="dmf-spdef" value="${v('spdef')}"></div>
        <div><label>素早ぁE/label><input type="text" id="dmf-spd"   value="${v('spd')}"></div>
      </div>
      <div style="margin-bottom:6px;font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">特性</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
        <div><label>特性1</label><input type="text" id="dmf-ability1"        value="${v('ability1')}"></div>
        <div><label>特性2</label><input type="text" id="dmf-ability2"  value="${v('ability2')}"></div>
        <div style="grid-column:1/-1"><label>夢特性</label><input type="text" id="dmf-ability-hidden" value="${v('ability_hidden')}"></div>
      </div>`;
      } else {
        title.textContent = '技を編雁E;
        const d = localMoves[idx];
        const v = k => (d[k] ?? '').replace(/"/g, '&quot;');
        fields.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px">
        <div><label>技吁E/label><input      type="text" id="dmf-move-name"     value="${v('name')}"></div>
        <div><label>タイチE/label><input    type="text" id="dmf-move-type"     value="${v('type')}"></div>
        <div><label>刁E��E/label><input      type="text" id="dmf-move-category" value="${v('category')}"></div>
        <div><label>威力</label><input      type="text" id="dmf-move-power"    value="${v('power')}"></div>
        <div style="grid-column:1/-1"><label>PP</label><input type="text" id="dmf-move-pp" value="${v('pp')}"></div>
      </div>
      <div style="margin-bottom:12px"><label>説昁E/label><textarea id="dmf-move-desc"   rows="3">${d.desc ?? ''}</textarea></div>
      <div><label>効果（英語！E/label><textarea id="dmf-move-effect" rows="3">${d.effect ?? ''}</textarea></div>`;
      }
    }

    function dmAutoDisplay() {
      const name = document.getElementById('dmf-name')?.value || '';
      const form = document.getElementById('dmf-form')?.value || '通常';
      const disp = document.getElementById('dmf-display');
      if (disp) disp.value = form === '通常' ? name : `${name}(${form})`;
    }

    async function dmSaveEntry() {
      if (!isAdmin()) {
        alert("Alert");
        return;
      }
      let entry;
      if (dmType === 'pokemon') {
        const name = document.getElementById('dmf-name').value.trim();
        if (!name) { alert("Alert"); return; }
        const form = document.getElementById('dmf-form').value.trim() || '通常';
        entry = {
          no: document.getElementById('dmf-no').value.trim(),
          name, form,
          display: form === '通常' ? name : `${name}(${form})`,
          type1: document.getElementById('dmf-type1').value.trim(),
          type2: document.getElementById('dmf-type2').value.trim(),
          hp: document.getElementById('dmf-hp').value.trim(),
          atk: document.getElementById('dmf-atk').value.trim(),
          def: document.getElementById('dmf-def').value.trim(),
          spatk: document.getElementById('dmf-spatk').value.trim(),
          spdef: document.getElementById('dmf-spdef').value.trim(),
          spd: document.getElementById('dmf-spd').value.trim(),
          ability1: document.getElementById('dmf-ability1').value.trim(),
          ability2: document.getElementById('dmf-ability2').value.trim(),
          ability_hidden: document.getElementById('dmf-ability-hidden').value.trim(),
          confirmed: document.getElementById('dmf-confirmed')?.checked || false,
        };
        if (dmEditIndex === null) { alert("Alert"); return; }
        localPokemon[dmEditIndex] = entry;
      } else {
        const name = document.getElementById('dmf-move-name').value.trim();
        if (!name) { alert("Alert"); return; }
        entry = {
          name,
          type: document.getElementById('dmf-move-type').value.trim(),
          category: document.getElementById('dmf-move-category').value.trim(),
          power: document.getElementById('dmf-move-power').value.trim(),
          pp: document.getElementById('dmf-move-pp').value.trim(),
          desc: document.getElementById('dmf-move-desc').value.trim(),
          effect: document.getElementById('dmf-move-effect').value.trim(),
        };
        if (dmEditIndex === null) { alert("Alert"); return; }
        localMoves[dmEditIndex] = entry;
      }
      await dmSaveMasterData();
      alert("Alert");
      document.getElementById('dm-form-card').style.display = 'none';
      document.getElementById('dm-search-input').value = '';
    }

    async function dmDeleteEntry() {
      if (!isAdmin()) {
        alert("Alert");
        return;
      }
      if (dmEditIndex === null) return;
      const label = dmType === 'pokemon' ? localPokemon[dmEditIndex].display : localMoves[dmEditIndex].name;
      if (!confirm("Confirm?")) return;
      if (dmType === 'pokemon') localPokemon.splice(dmEditIndex, 1);
      else localMoves.splice(dmEditIndex, 1);
      await dmSaveMasterData();
      alert("Alert");
      document.getElementById('dm-form-card').style.display = 'none';
      document.getElementById('dm-search-input').value = '';
    }

    function dmCancelEdit() {
      document.getElementById('dm-form-card').style.display = 'none';
      document.getElementById('dm-search-input').value = '';
    }

    async function dmSaveMasterData() {
      // 編雁E��限チェチE���E��E刁E�EUIDのみ保存可能�E�E
      if (!isAdmin()) {
        console.warn('Master data save blocked: no permission');
        return;
      }

      // POKEMON_LISTのチE��ォルトと異なるconfirmedのみを差刁E��して保孁E
      const defaultConfirmed = {};
      POKEMON_LIST.forEach(p => { defaultConfirmed[p.display] = p.confirmed; });
      const overrides = {};
      localPokemon.forEach(p => {
        if (p.confirmed !== defaultConfirmed[p.display]) {
          overrides[p.display] = p.confirmed;
        }
      });
      // 持ち物�E�confirmed=falseのも�Eだけ差刁E��存（デフォルチErue�E�E
      const itemOverrides = {};
      localItems.forEach(it => { if (!it.confirmed) itemOverrides[it.name] = false; });

      const staticVer = window.STATIC_VERSION_DATA?.version || Date.now();
      localStorage.setItem('pkm_master_static_version', String(staticVer));
      localStorage.setItem('pkm_confirmed_overrides', JSON.stringify(overrides));
      localStorage.setItem('pkm_master_moves', JSON.stringify(localMoves));
      localStorage.setItem('pkm_item_overrides', JSON.stringify(itemOverrides));

      if (!_fbReady) return;
      try {
        // 全アカウント�E通�E shared コレクションに保孁E
        await window._firestoreOps.setDoc(
          window._firestoreOps.doc(window._db, 'shared', 'master'),
          { masterVersion: staticVer, overrides, moves: localMoves, itemOverrides, updatedAt: window._firestoreOps.serverTimestamp() }
        );
      } catch (e) { console.error("Error"); }
    }

    async function dmLoadMasterData() {
      await loadStaticMasterData();
      const staticVer = window.STATIC_VERSION_DATA?.version || 0;
      const localAppliedVer = parseInt(localStorage.getItem('pkm_master_static_version') || '0', 10);
      const isStaticRefreshed = staticVer > localAppliedVer;

      function applyOverrides(overrides) {
        try {
          localPokemon.forEach(p => {
            if (p.display in overrides) p.confirmed = overrides[p.display];
          });
        } catch (e) { }
      }

      if (isStaticRefreshed) {
        console.log(`[MasterSync] Static master refreshed (v${staticVer} > v${localAppliedVer}). Auto-resetting legacy local overrides.`);
        localStorage.removeItem('pkm_confirmed_overrides');
        localStorage.setItem('pkm_master_static_version', String(staticVer));
      }

      if (!_fbReady) {
        // Firebase未初期化時のフォールバック�E�localStorageから読む
        try {
          const overrides = JSON.parse(localStorage.getItem('pkm_confirmed_overrides') || '{}');
          applyOverrides(overrides);
          const cachedMoves = localStorage.getItem('pkm_master_moves');
          if (cachedMoves) localMoves = JSON.parse(cachedMoves).map(m => ({ confirmed: true, ...m }));
          const cachedItemOv = JSON.parse(localStorage.getItem('pkm_item_overrides') || '{}');
          localItems.forEach(it => { it.confirmed = !(it.name in cachedItemOv && !cachedItemOv[it.name]); });
        } catch (e) { }
        return;
      }
      try {
        // 全アカウント�E通�E shared コレクションから読み込み�E�ログイン不要E��E
        const snap = await window._firestoreOps.getDoc(
          window._firestoreOps.doc(window._db, 'shared', 'master')
        );
        if (snap.exists()) {
          const d = snap.data();
          const fbMasterVer = d.masterVersion || 0;

          // 静的チE�EタがFirebaseのバ�Eジョンより新しい場合、古いFirebaseのoverridesを破棁E��て最新静的チE�Eタを正とする
          if (staticVer > fbMasterVer) {
            console.log(`[MasterSync] Static data is newer than Firebase (v${staticVer} > v${fbMasterVer}). Discarding outdated Firebase overrides.`);
            localStorage.removeItem('pkm_confirmed_overrides');
            localStorage.setItem('pkm_master_static_version', String(staticVer));
            
            // 管琁E��E�E場合�EFirebase側も�E動的にクリーン更新
            if (isAdmin()) {
              try {
                await window._firestoreOps.setDoc(
                  window._firestoreOps.doc(window._db, 'shared', 'master'),
                  { masterVersion: staticVer, overrides: {}, moves: localMoves, itemOverrides: {}, updatedAt: window._firestoreOps.serverTimestamp() }
                );
                console.log("Log");
              } catch (err) { }
            }
          } else {
            // Firebase側が最新また�E同等バージョンの場合、ユーザーが手動で設定した差刁E��適用
            if (d.overrides) {
              localStorage.setItem('pkm_confirmed_overrides', JSON.stringify(d.overrides));
              applyOverrides(d.overrides);
            }
          }

          if (d.moves && staticVer <= fbMasterVer) {
            localMoves = d.moves.map(m => ({ confirmed: true, ...m }));
            localStorage.setItem('pkm_master_moves', JSON.stringify(localMoves));
          }
          if (d.itemOverrides && staticVer <= fbMasterVer) {
            localStorage.setItem('pkm_item_overrides', JSON.stringify(d.itemOverrides));
            localItems.forEach(it => { it.confirmed = !(it.name in d.itemOverrides && !d.itemOverrides[it.name]); });
          }
        }
      } catch (e) {
        console.error("Error");
        // Firestore取得失敗時のフォールバック�E�localStorageから読む
        try {
          const overrides = JSON.parse(localStorage.getItem('pkm_confirmed_overrides') || '{}');
          applyOverrides(overrides);
          const cachedMoves = localStorage.getItem('pkm_master_moves');
          if (cachedMoves) localMoves = JSON.parse(cachedMoves).map(m => ({ confirmed: true, ...m }));
          const cachedItemOv2 = JSON.parse(localStorage.getItem('pkm_item_overrides') || '{}');
          localItems.forEach(it => { it.confirmed = !(it.name in cachedItemOv2 && !cachedItemOv2[it.name]); });
        } catch (e2) { }
      }
      rebuildPokemonMap();
    }

    // ---- ピンチズーム無効化！EOS対応！E---
    document.addEventListener('touchstart', e => {
      if (e.touches.length > 1) e.preventDefault();
    }, { passive: false });
    let lastTouchEnd = 0;
    document.addEventListener('touchend', e => {
      const now = Date.now();
      if (now - lastTouchEnd < 300) e.preventDefault();
      lastTouchEnd = now;
    }, { passive: false });
    document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
    document.addEventListener('gesturechange', e => e.preventDefault(), { passive: false });


    // ======================================================
    // ---- POKEMON PICKER ----
    // ======================================================
    let pickerTargetInput = null;
    let pickerActiveType = null;

    // iconNumの計算：姿違い・フォルムインチE��クスに対応したスプライトシート位置を取征E
    function getPokeIconPos(pOrDisp, defaultNo = 0) {
      if (!pOrDisp) return '0px 0px';
      let idx = 0;
      if (typeof pOrDisp === 'number') {
        idx = pOrDisp;
      } else if (typeof pOrDisp === 'string' && /^\d+$/.test(pOrDisp.trim())) {
        idx = parseInt(pOrDisp.trim(), 10);
      } else {
        const p = typeof pOrDisp === 'object' ? pOrDisp : findPokemon(pOrDisp);
        idx = (p && p.iconIndex !== undefined) ? parseInt(p.iconIndex) : (parseInt(p?.no) || parseInt(defaultNo) || 0);
      }
      const x = (idx % 12) * 40;
      const y = Math.floor(idx / 12) * 30;
      return `-${x}px -${y}px`;
    }

    function getIconStyle(noOrPoke) {
      return `background-position:${getPokeIconPos(noOrPoke)}`;
    }

    function buildPickerTypes() {
      const types = ['ノ�Eマル', 'ほのぁE, 'みぁE, 'でんき', 'くさ', 'こおめE,
        'かくとぁE, 'どぁE, 'じめめE, 'ひこう', 'エスパ�E', 'むぁE,
        'ぁE��', 'ゴースチE, 'ドラゴン', 'あく', 'はが�E', 'フェアリー'];
      const container = document.getElementById('picker-types');
      container.innerHTML = types.map(t =>
        `<button class="type-btn" data-type="${t}" onclick="pickerToggleType('${t}')">${t}</button>`
      ).join('');
    }

    function pickerToggleType(type) {
      if (pickerActiveType === type) {
        pickerActiveType = null;
      } else {
        pickerActiveType = type;
      }
      document.querySelectorAll('.type-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.type === pickerActiveType);
      });
      renderPickerGrid(document.getElementById('picker-search').value);
    }

    let pickerOppSlotIndex = -1;

    function renderPickerOppSlots() {
      const nav = document.getElementById('picker-slots-nav');
      if (!nav) return;
      const inputs = document.querySelectorAll('#opp-party-slots input[type=text]');
      let html = '';
      for (let i = 0; i < 6; i++) {
        const val = inputs[i] ? inputs[i].value.trim() : '';
        const isActive = (i === pickerOppSlotIndex);
        let inner = '';
        if (val) {
          const poke = (localPokemon || POKEMON_LIST).find(p => p.display === val);
          if (poke) {
            const pos = getPokeIconPos(poke);
            inner = `<span class="poke-sprite" style="background-position:${pos}"></span>`;
          } else {
            inner = `<img src="${BALL_ICON_SRC}" alt="${i + 1}体目" class="ball-img">`;
          }
        } else {
          inner = `<img src="${BALL_ICON_SRC}" alt="${i + 1}体目" class="ball-img">`;
        }
        html += `<button type="button" class="picker-slot-item${isActive ? ' active' : ''}" onclick="setPickerOppSlot(${i})" title="${i + 1}体目">${inner}</button>`;
      }
      nav.innerHTML = html;
    }

    function setPickerOppSlot(idx) {
      pickerOppSlotIndex = idx;
      const inputs = document.querySelectorAll('#opp-party-slots input[type=text]');
      if (inputs[idx]) {
        pickerTargetInput = inputs[idx];
      }
      const searchEl = document.getElementById('picker-search');
      if (searchEl) searchEl.value = '';
      pickerActiveType = null;
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      renderPickerOppSlots();
      renderPickerGrid('');
    }

    function openPokemonPicker(btn) {
      const wrap = btn.closest('.pokemon-slot');
      pickerTargetInput = wrap ? wrap.querySelector('input[type=text]') : btn.closest('.slot-input-wrap').querySelector('input[type=text]');
      // opp-selection-slotsの場合�E相手パーチE��のみ表示
      const containerId = pickerTargetInput ? pickerTargetInput.dataset.container : '';
      window._pickerOppOnly = (containerId === 'opp-selection-slots' && window._oppPartyOptions && window._oppPartyOptions.length > 0);
      window._pickerMyOnly = (containerId === 'my-selection-slots' && window._myPartyOptions && window._myPartyOptions.length > 0);
      pickerActiveType = null;
      document.getElementById('picker-search').value = '';
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));

      const slotsNav = document.getElementById('picker-slots-nav');
      const fallbackTitle = document.getElementById('picker-fallback-title');

      if (containerId === 'opp-party-slots') {
        pickerOppSlotIndex = parseInt(pickerTargetInput.dataset.index, 10) || 0;
        if (slotsNav) slotsNav.style.display = 'grid';
        if (fallbackTitle) fallbackTitle.style.display = 'none';
        renderPickerOppSlots();
      } else {
        pickerOppSlotIndex = -1;
        if (slotsNav) slotsNav.style.display = 'none';
        if (fallbackTitle) fallbackTitle.style.display = 'block';
      }

      renderPickerGrid('');
      document.getElementById('pokemon-picker').classList.add('open');
    }

    function closePokemonPicker() {
      document.getElementById('pokemon-picker').classList.remove('open');
      pickerTargetInput = null;
      pickerOppSlotIndex = -1;
      _pePickerTargetIdx = -1;
    }

    function pickerOnSearch(val) {
      renderPickerGrid(val);
    }

    function renderPickerGrid(searchVal) {
      const grid = document.getElementById('picker-grid');
      // 選出ピッカーはパ�EチE��から絞り込み
      let src;
      if (window._pickerOppOnly && window._oppPartyOptions) {
        src = window._oppPartyOptions.map(name => ({ display: name, confirmed: true, no: '', type1: '', type2: '' }));
      } else if (window._pickerMyOnly && window._myPartyOptions) {
        src = window._myPartyOptions.map(name => ({ display: name, confirmed: true, no: '', type1: '', type2: '' }));
      } else {
        src = localPokemon || POKEMON_LIST;
      }
      const valKana = toKatakana(searchVal.trim());
      const valHira = toHiragana(searchVal.trim());

      // 相手パーチE��スロチE��ではメガシンカを除夁E
      const excludeMega = pickerTargetInput && pickerTargetInput.dataset.container === 'opp-party-slots';

      let filtered = src.filter(p => {
        if (!p.confirmed) return false;
        // 相手パーチE��にはメガシンカ不可
        if (excludeMega && isMegaForm(p)) return false;
        // タイプ絞り込み
        if (pickerActiveType && p.type1 !== pickerActiveType && p.type2 !== pickerActiveType) return false;
        // チE��スト絞り込み
        if (searchVal.trim()) {
          const dH = toHiragana(p.display);
          if (!p.display.includes(valKana) && !dH.includes(valHira)) return false;
        }
        return true;
      });

      if (!filtered.length) {
        grid.innerHTML = '<div class="picker-empty">該当する�Eケモンがいません</div>';
        return;
      }

      // 最近選んだ頁E��ソート（絞り込みがなぁE��合�Eみ�E�E
      if (!searchVal.trim() && !pickerActiveType) {
        filtered = sortByRecent(filtered);
      }

      grid.innerHTML = filtered.map(p => {
        const style = getIconStyle(p);
        const current = pickerTargetInput ? pickerTargetInput.value : '';
        const isSel = current === p.display;
        return `<button class="poke-icon-btn${isSel ? ' selected' : ''}" onclick="selectFromPicker('${p.display.replace(/'/g, "\\'")}')">
      <div class="poke-icon-sprite"><span style="${style}"></span></div>
      <div class="poke-icon-name">${p.display}</div>
    </button>`;
      }).join('');
    }

    function selectFromPicker(displayName) {
      if (_pePickerTargetIdx >= 0) {
        // パ�EチE��編雁E�Eージ用
        selectPePokeByName(_pePickerTargetIdx, displayName);
        const cardPE = document.querySelector('#pe-body .pe-pokemon-card[data-pe-idx="' + _pePickerTargetIdx + '"]');
        if (cardPE) { const inp = cardPE.querySelector('.pe-name-input'); if (inp) inp.value = displayName; }
        _pePickerTargetIdx = -1;
        closePokemonPicker();
        return;
      }

      if (pickerOppSlotIndex >= 0 && pickerTargetInput && pickerTargetInput.dataset.container === 'opp-party-slots') {
        // 相手パーチE��選択時
        pickerTargetInput.value = displayName;
        recordRecentPick(displayName);
        updateSlotIcon(pickerTargetInput, displayName);
        rebuildOppSelectionDropdowns();

        const nextIdx = pickerOppSlotIndex + 1;
        if (nextIdx < 6) {
          // 次のスロチE��へ移勁E
          setPickerOppSlot(nextIdx);
        } else {
          // 6番目の選択完亁E-> ピッカーを閉じる
          closePokemonPicker();
        }
        return;
      }

      if (pickerTargetInput) {
        pickerTargetInput.value = displayName;
        recordRecentPick(displayName);
        updateSlotIcon(pickerTargetInput, displayName);
        if (pickerTargetInput.dataset.container === 'opp-party-slots') {
          rebuildOppSelectionDropdowns();
        }
      }
      closePokemonPicker();
    }

    // ピッカー外クリチE��で閉じめE
    document.addEventListener('click', e => {
      const overlay = document.getElementById('pokemon-picker');
      if (overlay && overlay.classList.contains('open') && e.target === overlay) {
        closePokemonPicker();
      }
    });

    // ピッカーのタイプ�Eタンを�E期化
    document.addEventListener('DOMContentLoaded', buildPickerTypes);
    // DOMContentLoadedが既に発火してぁE��場合�Eフォールバック
    if (document.readyState !== 'loading') buildPickerTypes();


    // ---- 冁E��一覧 ----
    let dmListDraft = [];

    function renderDmList() {
      const body = document.getElementById('dm-list-body');
      const countEl = document.getElementById('dm-list-count');

      if (dmType === 'item') {
        // 持ち物一覧�E��E定チェチE��ボックス付き
        const isAdminItem = isAdmin();
        const confirmedItemCount = localItems.filter(it => it.confirmed).length;
        countEl.textContent = `全${localItems.length}件 / 冁E��E{confirmedItemCount}件`;
        body.innerHTML = localItems.map((it, i) =>
          `<div class="dm-list-row">
        <div class="dm-list-name">${it.name}</div>
        <input type="checkbox" class="dm-list-check dm-item-check" data-idx="${i}" ${it.confirmed ? 'checked' : ''}>
      </div>`
        ).join('');
        body.querySelectorAll('.dm-item-check').forEach(cb => {
          if (!isAdminItem) { cb.disabled = true; cb.style.opacity = '0.4'; cb.style.cursor = 'not-allowed'; return; }
          cb.addEventListener('change', () => {
            localItems[parseInt(cb.dataset.idx)].confirmed = cb.checked;
            const n = localItems.filter(it => it.confirmed).length;
            countEl.textContent = `全${localItems.length}件 / 冁E��E{n}件`;
          });
        });
        return;
      }

      if (dmType === 'move') {
        // 技一覧�E��E定チェチE��ボックス付き�E�クリチE��で編雁E
        const isAdminMove = isAdmin();
        const confirmedMoveCount = localMoves.filter(m => m.confirmed !== false).length;
        countEl.textContent = `全${localMoves.length}件 / 冁E��E{confirmedMoveCount}件`;
        body.innerHTML = localMoves.map((m, i) => `
      <div class="dm-list-row">
        <div class="dm-list-name" style="cursor:pointer;flex:1" onclick="dmShowForm(${i})">${m.name}</div>
        <input type="checkbox" class="dm-list-check dm-move-check" data-idx="${i}" ${m.confirmed !== false ? 'checked' : ''}>
      </div>`
        ).join('');
        body.querySelectorAll('.dm-move-check').forEach(cb => {
          if (!isAdminMove) { cb.disabled = true; cb.style.opacity = '0.4'; cb.style.cursor = 'not-allowed'; return; }
          cb.addEventListener('change', () => {
            localMoves[parseInt(cb.dataset.idx)].confirmed = cb.checked;
            const n = localMoves.filter(m => m.confirmed !== false).length;
            countEl.textContent = `全${localMoves.length}件 / 冁E��E{n}件`;
          });
        });
        return;
      }

      // ポケモン一覧�E�従来通り�E�E
      dmListDraft = localPokemon.map(p => ({ ...p }));
      const updateCount = () => {
        const n = dmListDraft.filter(p => p.confirmed).length;
        countEl.textContent = `全${dmListDraft.length}件 / 冁E��E{n}件`;
      };
      updateCount();
      body.innerHTML = dmListDraft.map((p, i) => {
        return `<div class="dm-list-row">
      <div class="dm-list-icon"><span style="background-position:${getPokeIconPos(p)}"></span></div>
      <div class="dm-list-name">${p.display}</div>
      <input type="checkbox" class="dm-list-check" data-idx="${i}" ${p.confirmed ? 'checked' : ''}>
    </div>`;
      }).join('');
      const isAdm = isAdmin();
      body.querySelectorAll('.dm-list-check').forEach(cb => {
        if (!isAdm) {
          cb.disabled = true;
          cb.style.opacity = '0.4';
          cb.style.cursor = 'not-allowed';
          return;
        }
        cb.addEventListener('change', () => {
          dmListDraft[parseInt(cb.dataset.idx)].confirmed = cb.checked;
          updateCount();
        });
      });
    }

    async function dmSaveList() {
      if (!isAdmin()) {
        alert("Alert");
        return;
      }
      // ポケモンの場合�Eみ dmListDraft めElocalPokemon に反映
      if (dmType === 'pokemon') {
        dmListDraft.forEach((p, i) => { localPokemon[i].confirmed = p.confirmed; });
      }
      // 技・持ち物は renderDmList 冁E��チェチE��ボックス変更時に localMoves/localItems を直接更新済み
      await dmSaveMasterData();
      alert("Alert");
    }

    function dmCancelList() {
      // 変更前�E状態にリセチE��
      if (dmType === 'pokemon') {
        dmListDraft = [];
      }
      // 技・持ち物はリロード時にFirestoreから最新を読み込むため、�E表示のみ
      dmSelectType(dmType);
    }

    // 持ち物の検索結果を一覧カードに表示�E�編雁E��し！E
    function dmShowItemResult(name) {
      const isAdm = isAdmin();
      const body = document.getElementById('dm-list-body');
      const countEl = document.getElementById('dm-list-count');
      countEl.textContent = '検索結果: ' + name;
      const item = localItems.find(it => it.name === name);
      const confirmed = item ? item.confirmed !== false : true;
      body.innerHTML = `<div class="dm-list-row">
    <div class="dm-list-name">${name}</div>
    <input type="checkbox" class="dm-list-check" id="dm-item-result-check" ${confirmed ? 'checked' : ''} ${!isAdm ? 'disabled style="opacity:0.4;cursor:not-allowed"' : ''}>
  </div>`;
      if (isAdm && item) {
        document.getElementById('dm-item-result-check').addEventListener('change', function () {
          item.confirmed = this.checked;
        });
      }
      document.getElementById('dm-list-card').style.display = 'block';
      // 保存�Eタン表示
      const saveBtn = document.querySelector('#dm-list-card .btn-primary');
      const cancelBtn = document.querySelector('#dm-list-card .btn-ghost');
      if (isAdm) { if (saveBtn) saveBtn.style.display = 'inline-flex'; if (cancelBtn) cancelBtn.style.display = 'inline-flex'; }
    }


    // ---- パ�EチE��編雁E�Eージ�E�フルスクリーン�E�E----
    let pePokemons = []; // 編雁E��の6体�EチE�Eタ [{name,item,ability,moves,nature,evs}, ...]
    // 吁E��ロチE��の空チE�Eタ

    // ---- メモ機�E ----
    // _memoContext: { type: 'party'|'pokemon', partyId, pokeIdx }
    let _memoContext = null;

    function openMemoModal(ctx, title, currentText) {
      _memoContext = ctx;
      document.getElementById('memo-modal-title').textContent = title;
      document.getElementById('memo-modal-text').value = currentText || '';
      document.getElementById('memo-modal').style.display = 'flex';
      setTimeout(() => document.getElementById('memo-modal-text').focus(), 50);
    }

    function closeMemoModal() {
      document.getElementById('memo-modal').style.display = 'none';
      _memoContext = null;
    }

    function saveMemoModal() {
      const text = document.getElementById('memo-modal-text').value;
      if (!_memoContext) { closeMemoModal(); return; }

      if (_memoContext.type === 'party') {
        // パ�EチE��メモ
        const p = parties.find(x => x.id === _memoContext.partyId);
        if (p) {
          p.memo = text; savePartyDoc(p);
          saveData();
          renderParties(); // メモアイコンの色を更新
        }
      } else if (_memoContext.type === 'pokemon') {
        // 個体メモ
        const idx = _memoContext.pokeIdx;
        if (pePokemons[idx]) {
          pePokemons[idx].memo = text;
          // メモアイコンの色更新
          const btn = document.getElementById(`pe-memo-btn-${idx}`);
          if (btn) btn.className = 'memo-icon-btn' + (text ? ' has-memo' : '');
        }
      }
      closeMemoModal();
    }

    // パ�EチE��メモを開ぁE
    function openPartyMemo(partyId) {
      const p = parties.find(x => x.id === partyId);
      if (!p) return;
      openMemoModal(
        { type: 'party', partyId },
        `📝 ${p.name} のメモ`,
        p.memo || ''
      );
    }

    // 個体メモを開ぁE
    function openPokeMemo(idx) {
      const pk = pePokemons[idx];
      const title = pk.name ? `📝 ${pk.name} のメモ` : `📝 ${idx + 1}体目のメモ`;
      openMemoModal(
        { type: 'pokemon', pokeIdx: idx },
        title,
        pk.memo || ''
      );
    }

    function peEmptyPoke() {
      return {
        name: '', item: '', ability: '', moves: ['', '', '', ''], nature: 'まじめ',
        evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, memo: ''
      };
    }

    function clearPeSlot(idx, wrapper) {
      pePokemons[idx] = peEmptyPoke();
      const oldCard = wrapper.querySelector('.pe-pokemon-card');
      if (oldCard) oldCard.replaceWith(buildPePokeCard(idx));
    }

    function openPartyModal(id) { openPartyEdit(id); }
    function closePartyModal() { closePartyEdit(); }

    async function openPartyEdit(id) {
      await loadStaticMasterData();
      // バナーが�EてぁE��時だけ確認（毎回Firestore通信しなぁE��E
      const banner = document.getElementById('conflict-banner');
      if (banner && banner.classList.contains('show')) {
        const ok = confirm("Confirm?");
        if (ok) { location.reload(); return; }
      }
      editingPartyId = id || null;
      pePokemons = Array.from({ length: 6 }, () => peEmptyPoke());
      if (id) {
        const p = parties.find(x => x.id === id);
        if (p) {
          document.getElementById('pe-name-input').value = p.name;
          p.pokemon.forEach((pk, i) => {
            if (!pk) return;
            if (typeof pk === 'string') {
              pePokemons[i].name = pk;
            } else {
              pePokemons[i] = {
                ...peEmptyPoke(), ...pk,
                moves: [...(pk.moves || ['', '', '', ''])],
                evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...(pk.evs || {}) },
                memo: pk.memo || ''
              };
            }
          });
        }
      } else {
        document.getElementById('pe-name-input').value = '';
      }
      renderPartyEditBody();
      document.getElementById('page-party-edit').classList.add('active');
      document.getElementById('page-party-edit').scrollTop = 0;
      // コピ�Eボ�Eドがあれば party-edit 冁E��も表示
      syncCopyBoardToPE();
    }

    function closePartyEdit() {
      document.getElementById('page-party-edit').classList.remove('active');
      // pe冁E�Eボ�EドをリセチE���E�Earties画面のボ�Eド�E renderParties > showCopyBoard で復允E��E
      const peBoard = document.getElementById('pe-copy-board-pe');
      if (peBoard) { peBoard.style.display = 'none'; peBoard.innerHTML = ''; }
    }

    function savePartyEdit() {
      const name = document.getElementById('pe-name-input').value.trim();
      if (!name) { alert("Alert"); return; }
      const dup = parties.find(p => p.name === name && p.id !== editingPartyId);
      if (dup) { alert("Alert"); return; }
      // pePokemons を保存形式に変換
      const pokemon = pePokemons.map(pk => pk.name ? { ...pk, moves: [...pk.moves], evs: { ...pk.evs }, memo: (pk.memo || '') } : '');
      if (editingPartyId) {
        const idx = parties.findIndex(p => p.id === editingPartyId);
        if (idx >= 0) { parties[idx].name = name; parties[idx].pokemon = pokemon; } savePartyDoc(parties[idx]);
      } else {
        parties.unshift({ id: Date.now().toString(), name, pokemon }); parties.forEach((p,i)=>{p.order=i; savePartyDoc(p);});
      }
      saveData();
      closePartyEdit();
      renderParties();
      renderRecordPage();
    }

    // 後方互換: saveParty は savePartyEdit へ
    function saveParty() { savePartyEdit(); }

    function editParty(id) { openPartyEdit(id); }

    function copyParty(id) {
      const p = parties.find(x => x.id === id);
      if (!p) return;
      const copy = JSON.parse(JSON.stringify(p));
      copy.id = Date.now().toString();
      copy.name = p.name + " copy";
      parties.unshift(copy); parties.forEach((p,i)=>{p.order=i; savePartyDoc(p);});
      saveData();
      renderParties();
      renderRecordPage();
    }

    // パ�EチE��編雁E�EージのDOM構篁E
    function renderPartyEditBody() {
      const body = document.getElementById('pe-body');
      body.innerHTML = '';
      for (let i = 0; i < 6; i++) {
        body.appendChild(buildPePokeWrapper(i));
      }
    }


    // ===== コピ�Eボ�Eド機�E =====
    let _copiedPoke = null; // コピ�Eされた�EケモンチE�Eタ

    // コピ�Eボ�Eド�EHTML斁E���Eを生戁E
    function _buildBoardHTML() {
      const pk = _copiedPoke;
      if (!pk) return '';
      const moves = (pk.moves || []).filter(Boolean).join(' / ') || '技なぁE;
      return `<div class="pe-copy-board-header">
      <span class="pe-copy-board-title">📋 クリチE�Eボ�EチE/span>
      <button class="pe-copy-board-del" onclick="clearCopyBoard()">✁E削除</button>
    </div>
    <div class="pe-copy-board-body">
      <span class="pe-copy-board-name">${pk.name || '(未設宁E'}</span>
      <span class="pe-copy-board-tag">${pk.item || 'なぁE}</span>
      <span class="pe-copy-board-tag">${pk.ability || 'なぁE}</span>
      <span class="pe-copy-board-tag">${moves}</span>
      <span class="pe-copy-board-tag">${pk.nature || 'まじめ'}</span>
    </div>`;
    }

    // パ�EチE��一覧のボ�Eドを更新
    function showCopyBoard() {
      const board = document.getElementById('pe-copy-board');
      if (!board) return;
      if (!_copiedPoke) {
        board.className = '';
        board.innerHTML = '';
        return;
      }
      board.className = 'visible pe-copy-board-box';
      board.innerHTML = _buildBoardHTML();
    }

    // page-party-edit 冁E�Eボ�Eドを同期
    function syncCopyBoardToPE() {
      const peBoard = document.getElementById('pe-copy-board-pe');
      if (!peBoard) return;
      if (!_copiedPoke) {
        peBoard.style.display = 'none';
        peBoard.className = '';
        peBoard.innerHTML = '';
        return;
      }
      peBoard.className = 'pe-copy-board-box';
      peBoard.style.display = 'block';
      peBoard.innerHTML = _buildBoardHTML();
    }

    // コピ�Eボ�Eドを消去
    function clearCopyBoard() {
      _copiedPoke = null;
      // パ�EチE��一覧ボ�EチE
      const board = document.getElementById('pe-copy-board');
      if (board) { board.className = ''; board.innerHTML = ''; }
      // 個体詳細ボ�EチE
      const peBoard = document.getElementById('pe-copy-board-pe');
      if (peBoard) { peBoard.style.display = 'none'; peBoard.innerHTML = ''; }
    }

    // ポケモンをコピ�E
    function copyPeSlot(idx) {
      const pk = pePokemons[idx];
      if (!pk) return;
      // チE��ープコピ�E
      _copiedPoke = {
        name: pk.name || '',
        item: pk.item || '',
        ability: pk.ability || '',
        moves: [...(pk.moves || ['', '', '', ''])],
        nature: pk.nature || 'まじめ',
        evs: { ...(pk.evs || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }) },
        memo: pk.memo || ''
      };
      showCopyBoard();      // パ�EチE��一覧ボ�Eド更新
      syncCopyBoardToPE(); // 個体詳細ボ�Eド更新
    }

    // ペ�EスチE
    function pastePeSlot(idx, wrapper) {
      if (!_copiedPoke) return;
      pePokemons[idx] = {
        name: _copiedPoke.name,
        item: _copiedPoke.item,
        ability: _copiedPoke.ability,
        moves: [..._copiedPoke.moves],
        nature: _copiedPoke.nature,
        evs: { ..._copiedPoke.evs },
        memo: _copiedPoke.memo || ''
      };
      // カードを再描画
      const oldCard = wrapper.querySelector('.pe-pokemon-card');
      if (oldCard) oldCard.replaceWith(buildPePokeCard(idx));
      // ペ�Eスト後�Eードを消去
      clearCopyBoard();
    }

    // ===== ポケモン移動（頁E��入れ替え）機�E =====
    let _movingPokeIdx = -1;

    function openMovePokeModal(fromIdx) {
      syncPeInputsToState();
      _movingPokeIdx = fromIdx;
      renderMovePokeModal(fromIdx);
      const modal = document.getElementById('move-poke-modal');
      if (modal) modal.style.display = 'flex';
    }

    function closeMovePokeModal() {
      const modal = document.getElementById('move-poke-modal');
      if (modal) modal.style.display = 'none';
      _movingPokeIdx = -1;
    }

    function syncPeInputsToState() {
      document.querySelectorAll('.pe-pokemon-card').forEach(card => {
        const idx = parseInt(card.dataset.peIdx, 10);
        if (isNaN(idx) || !pePokemons[idx]) return;
        const nameInput = card.querySelector('.pe-name-input');
        if (nameInput) pePokemons[idx].name = nameInput.value.trim();
        const itemInput = card.querySelector('.pe-col-item-ability input.pe-input');
        if (itemInput) pePokemons[idx].item = itemInput.value.trim();
        const abilSel = card.querySelector(`#pe-ability-${idx}`);
        if (abilSel) pePokemons[idx].ability = abilSel.value;
      });
    }

    function renderMovePokeModal(fromIdx) {
      const listEl = document.getElementById('move-poke-modal-list');
      if (!listEl) return;
      listEl.innerHTML = '';

      for (let i = 0; i < 6; i++) {
        // 先頭への移動�Eタン�E�EromIdx > 0 かつ i === 0 の場合！E
        if (fromIdx > 0 && i === 0) {
          listEl.appendChild(createMoveTargetBtn(fromIdx, 0));
        }

        // スロチE�� i の衁E
        listEl.appendChild(createMovePokeRow(i, i === fromIdx));

        // ポケモンの後�E移動�Eタン
        if (i < fromIdx) {
          if (i + 1 < fromIdx) {
            listEl.appendChild(createMoveTargetBtn(fromIdx, i + 1));
          }
        } else if (i > fromIdx) {
          listEl.appendChild(createMoveTargetBtn(fromIdx, i));
        }
      }
    }

    function createMovePokeRow(slotIdx, isCurrent) {
      const pk = pePokemons[slotIdx];
      const row = document.createElement('div');
      row.className = 'move-poke-row' + (isCurrent ? ' current-poke' : '');

      const iconDiv = document.createElement('div');
      iconDiv.className = 'move-poke-icon';

      if (pk && pk.name) {
        const pd = findPokemon(pk.name);
        if (pd) {
          const sp = document.createElement('span');
          sp.className = 'poke-sprite';
          sp.style.backgroundPosition = getPokeIconPos(pd);
          iconDiv.appendChild(sp);
        } else {
          const img = document.createElement('img');
          img.className = 'ball';
          img.src = BALL_ICON_SRC;
          iconDiv.appendChild(img);
        }
      } else {
        const img = document.createElement('img');
        img.className = 'ball';
        img.src = BALL_ICON_SRC;
        iconDiv.appendChild(img);
      }
      row.appendChild(iconDiv);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'move-poke-name';
      if (pk && pk.name) {
        nameSpan.textContent = pk.name;
      } else {
        nameSpan.textContent = `(枠 ${slotIdx + 1})`;
        nameSpan.style.color = 'var(--text-muted)';
      }
      row.appendChild(nameSpan);

      if (isCurrent) {
        const badge = document.createElement('span');
        badge.style.cssText = 'font-size:11px;color:var(--text-muted);margin-left:auto;padding:2px 6px;background:rgba(255,255,255,0.06);border-radius:4px;';
        badge.textContent = '現在位置';
        row.appendChild(badge);
      }

      return row;
    }

    function createMoveTargetBtn(fromIdx, targetIdx) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'move-target-btn';
      btn.innerHTML = `<span class="move-target-arrow">➁E/span><span>ここに移勁E/span>`;
      btn.onclick = () => movePeSlot(fromIdx, targetIdx);
      return btn;
    }

    function movePeSlot(fromIdx, targetIdx) {
      if (fromIdx === targetIdx) {
        closeMovePokeModal();
        return;
      }
      const [moved] = pePokemons.splice(fromIdx, 1);
      pePokemons.splice(targetIdx, 0, moved);
      renderPartyEditBody();
      closeMovePokeModal();
    }

    function buildPePokeWrapper(idx) {
      const wrapper = document.createElement('div');
      wrapper.className = 'pe-poke-wrapper';
      wrapper.dataset.wrapperIdx = idx;

      // ── ボタン行（カード�E外�E上！E 移勁E| コピ�E | ペ�EスチE| クリア ──
      const actions = document.createElement('div');
      actions.className = 'pe-card-actions';

      const moveBtn = document.createElement('button');
      moveBtn.className = 'pe-card-btn';
      moveBtn.textContent = '移勁E;
      moveBtn.onclick = () => openMovePokeModal(idx);
      actions.appendChild(moveBtn);

      const sep0 = document.createElement('span');
      sep0.className = 'pe-card-btn-sep';
      sep0.textContent = '|';
      actions.appendChild(sep0);

      const copyBtn = document.createElement('button');
      copyBtn.className = 'pe-card-btn';
      copyBtn.textContent = 'コピ�E';
      copyBtn.onclick = () => copyPeSlot(idx);
      actions.appendChild(copyBtn);

      const sep1 = document.createElement('span');
      sep1.className = 'pe-card-btn-sep';
      sep1.textContent = '|';
      actions.appendChild(sep1);

      const pasteBtn = document.createElement('button');
      pasteBtn.className = 'pe-card-btn';
      pasteBtn.textContent = 'ペ�EスチE;
      pasteBtn.onclick = () => pastePeSlot(idx, wrapper);
      actions.appendChild(pasteBtn);

      const sep2 = document.createElement('span');
      sep2.className = 'pe-card-btn-sep';
      sep2.textContent = '|';
      actions.appendChild(sep2);

      const clearBtn = document.createElement('button');
      clearBtn.className = 'pe-card-btn pe-card-btn-clear';
      clearBtn.textContent = 'クリア';
      clearBtn.onclick = () => clearPeSlot(idx, wrapper);
      actions.appendChild(clearBtn);
      wrapper.appendChild(actions);

      wrapper.appendChild(buildPePokeCard(idx));
      return wrapper;
    }

    function buildPePokeCard(idx) {
      const pk = pePokemons[idx];
      const card = document.createElement('div');
      card.className = 'pe-pokemon-card';
      card.dataset.peIdx = idx;

      // ── カード�E体グリチE���E�E列ÁE行！E──
      // col1: アイコン上部 �E�E名前エリア下部�E�縦積みflex�E�E
      // 4列ÁE行グリチE��:
      //   衁E: [アイコン] [持ち物+特性] [技ÁE] [スチE�Eタス]
      //   衁E: [名前(col1/3 span)      ] [空]  [空]
      const inner = document.createElement('div');
      inner.className = 'pe-card-inner';

      // 衁E・刁E: アイコン�E�上部にメモボタン、下部にアイコン�E�E
      const col1 = document.createElement('div');
      col1.className = 'pe-col-icon';
      // メモボタン�E�アイコンの上！E
      const memoBtn = document.createElement('button');
      memoBtn.className = 'memo-icon-btn' + (pk.memo ? ' has-memo' : '');
      memoBtn.id = `pe-memo-btn-${idx}`;
      memoBtn.title = pk.memo ? 'メモを編雁E : 'メモを追加';
      memoBtn.textContent = '📝';
      memoBtn.onclick = () => openPokeMemo(idx);
      col1.appendChild(memoBtn);
      const pickerBtn = document.createElement('button');
      pickerBtn.className = 'pe-poke-picker-btn';
      pickerBtn.id = `pe-picker-btn-${idx}`;
      pickerBtn.title = 'アイコンから選ぶ';
      pickerBtn.onclick = () => openPokemonPickerForPe(idx);
      setPePickerIcon(pickerBtn, pk.name);
      col1.appendChild(pickerBtn);
      inner.appendChild(col1);

      // 衁E・刁E: 持ち物 + 特性
      const col2 = document.createElement('div');
      col2.className = 'pe-col-item-ability';
      col2.innerHTML = '<div class="pe-label">持ち物</div>';
      const itemWrap = document.createElement('div');
      itemWrap.style.cssText = 'position:relative';
      const itemInput = document.createElement('input');
      itemInput.type = 'text'; itemInput.className = 'pe-input';
      itemInput.placeholder = '持ち物...'; itemInput.value = pk.item || '';
      itemInput.autocomplete = 'off';
      itemInput.oninput = function () { onPeItemInput(this, idx); };
      itemInput.onfocus = function () { onPeItemFocus(this, idx); };
      itemInput.onblur = function () {
        if (window._peAcMousedown) return; // AC頁E��クリチE��中はblurで閉じなぁE
        const l = document.getElementById(`pe-item-ac-${idx}`); if (l) l.classList.remove('open');
      };
      const itemAc = document.createElement('div');
      itemAc.className = 'autocomplete-list'; itemAc.id = `pe-item-ac-${idx}`;
      itemAc.style.cssText = 'z-index:100';
      itemWrap.appendChild(itemInput); itemWrap.appendChild(itemAc);
      col2.appendChild(itemWrap);
      const abilLbl = document.createElement('div');
      abilLbl.className = 'pe-label'; abilLbl.style.marginTop = '3px';
      abilLbl.textContent = '特性'; col2.appendChild(abilLbl);
      const abilSel = document.createElement('select');
      abilSel.className = 'pe-select'; abilSel.id = `pe-ability-${idx}`;
      buildAbilityOptions(abilSel, pk.name, pk.ability);
      abilSel.onchange = function () { pePokemons[idx].ability = this.value; };
      col2.appendChild(abilSel);
      inner.appendChild(col2);

      // 衁E・刁E: 技ÁE
      const col3 = document.createElement('div');
      col3.className = 'pe-col'; col3.style.gridColumn = '3';
      col3.innerHTML = '<div class="pe-label">技</div>';
      for (let m = 0; m < 4; m++) {
        const moveBtn = document.createElement('button');
        moveBtn.className = 'pe-move-btn' + (pk.moves[m] ? ' filled' : '');
        moveBtn.textContent = pk.moves[m] || `技${m + 1}`;
        moveBtn.onclick = () => openMovePickerPopup(idx, m);
        moveBtn.id = `pe-move-${idx}-${m}`;
        col3.appendChild(moveBtn);
      }
      inner.appendChild(col3);

      // 衁E・刁E: スチE�Eタス
      const col4 = document.createElement('div');
      col4.className = 'pe-col'; col4.style.gridColumn = '4';
      col4.innerHTML = '<div class="pe-label">スチE�Eタス</div>';
      const statsBtn = document.createElement('button');
      statsBtn.className = 'pe-stats-btn'; statsBtn.id = `pe-stats-btn-${idx}`;
      statsBtn.onclick = () => openStatsPopup(idx);
      statsBtn.innerHTML = buildStatsBtnHTML(idx);
      col4.appendChild(statsBtn);
      inner.appendChild(col4);

      // 衁E・刁E、E: 名前セル (grid-column:1/3 でspan)
      const nameCell = document.createElement('div');
      nameCell.className = 'pe-name-cell'; // CSSで grid-column:1/3, grid-row:2
      const nameLbl = document.createElement('div');
      nameLbl.className = 'pe-name-lbl'; nameLbl.textContent = '名前';
      nameCell.appendChild(nameLbl);
      const nameWrap = document.createElement('div');
      nameWrap.className = 'pe-name-input-wrap';
      const nameInput = document.createElement('textarea');
      nameInput.className = 'pe-name-input';
      nameInput.placeholder = `${idx + 1}体目のポケモン名`;
      nameInput.value = pk.name; nameInput.autocomplete = 'off';
      nameInput.rows = 1; nameInput.dataset.peIdx = idx;
      nameInput.oninput = function () {
        this.value = this.value.split('\n').join('');
        onPeNameInput(this, idx);
      };
      nameInput.onfocus = function () { onPeNameFocus(this, idx); };
      nameInput.onblur = function () {
        if (window._peAcMousedown) return; // AC頁E��クリチE��中はblurで閉じなぁE
        const l = document.getElementById(`pe-ac-${idx}`); if (l) l.classList.remove('open');
      };
      nameInput.onkeydown = function (e) {
        if (e.key === 'Enter') e.preventDefault();
        onPeNameKeydown(e, this, idx);
      };
      const nameAc = document.createElement('div');
      nameAc.className = 'autocomplete-list'; nameAc.id = `pe-ac-${idx}`;
      nameAc.style.cssText = 'left:0;top:100%;width:200px;z-index:100';
      nameWrap.appendChild(nameInput); nameWrap.appendChild(nameAc);
      nameCell.appendChild(nameWrap);
      inner.appendChild(nameCell);

      // 衁Eの刁E・刁Eは .pe-col ぁEgrid-row:1/3 でまたがるため空セル不要E

      card.appendChild(inner);
      return card;
    }

    function buildStatsBtnText(idx) {
      return buildStatsBtnHTML(idx); // 後方互換
    }
    function buildStatsBtnHTML(idx) {
      const pk = pePokemons[idx];
      if (!pk.name) return '<span style="opacity:.4;font-size:10px">スチE�Eタス</span>';
      const nd = NATURES_DATA.find(n => n.name === (pk.nature || 'まじめ')) || { up: null, down: null };
      const pd = findPokemon(pk.name);
      if (!pd) return '<span style="opacity:.4;font-size:10px">スチE�Eタス</span>';
      const KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
      const BKEYS = ['hp', 'atk', 'def', 'spatk', 'spdef', 'spd'];
      const ABBR = ['H', 'A', 'B', 'C', 'D', 'S'];
      const evs = pk.evs || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      // 吁E��E "H 22    175" / "A -        93" / "C 22+ 166"
      // 3刁E [キー+EV+補正(左寁E��)]  [算�E値(右寁E��)]
      return KEYS.map((k, i) => {
        const base = parseInt(pd[BKEYS[i]]) || 0;
        const ev = evs[k] || 0;
        const v = calcStat(k, base, ev, nd);
        const mod = nd.up === k ? '+' : nd.down === k ? '-' : '';
        const color = mod === '+' ? '#4ade80' : mod === '-' ? '#f87171' : '';
        // キー部刁E "H" + EV値(>0なら表示) + 補正記号
        // color は キー+EV+補正 の部刁E�Eみに適用
        const evStr = ev > 0 ? String(ev) : '';
        const keyPart = ABBR[i] + (evStr ? ' ' + evStr : '') + (mod ? mod : '');
        const keySpan = color
          ? `<span style="color:${color}">${keyPart}</span>`
          : `<span>${keyPart}</span>`;
        return `<div class="pe-stat-row">${keySpan}<span class="pe-stat-val">${v}</span></div>`;
      }).join('');
    }

    function setPePickerIcon(btn, pokeName) {
      btn.innerHTML = '';
      if (!pokeName) {
        const img = document.createElement('img');
        img.className = 'ball';
        img.src = BALL_ICON_SRC;
        btn.appendChild(img);
      } else {
        const pd = findPokemon(pokeName);
        if (pd) {
          const sp = document.createElement('span');
          sp.className = 'poke-sprite';
          sp.style.backgroundPosition = getPokeIconPos(pd);
          btn.appendChild(sp);
        } else {
          const img2 = document.createElement('img');
          img2.className = 'ball';
          img2.src = BALL_ICON_SRC;
          btn.appendChild(img2);
        }
      }
    }

    function buildAbilityOptions(sel, pokeName, current) {
      sel.innerHTML = '<option value="">�E�なし！E/option>';
      if (pokeName) {
        let pd = findPokemon(pokeName);
        if (pd) {
          // メガシンカフォームの場合�Eベ�Eスポケモン�E�メガ前）�E特性のみを使用
          if (pd.form && pd.form.includes('メガ')) {
            const base = (localPokemon || POKEMON_LIST).find(p => p.name === pd.name && (p.form === '通常' || !p.form));
            if (base) pd = base;
          }
          const abilities = [pd.ability1, pd.ability2, pd.ability_hidden].filter(Boolean);
          abilities.forEach(ab => {
            const opt = document.createElement('option');
            opt.value = ab; opt.textContent = ab;
            if (ab === current) opt.selected = true;
            sel.appendChild(opt);
          });
        }
      }
      if (current && !sel.value) {
        const opt = document.createElement('option');
        opt.value = current; opt.textContent = current; opt.selected = true;
        sel.appendChild(opt);
      }
    }

    // ポケモン名�E力�Eオートコンプリート（パーチE��編雁E���E�E
    function showPeNameAc(input, idx, val) {
      const listEl = document.getElementById(`pe-ac-${idx}`);
      if (!listEl) return;
      const src = (localPokemon || POKEMON_LIST).filter(p => p.confirmed);
      let hits;
      if (!val) {
        // 空: 最近選んだポケモンを表示�E�最大10件�E�E
        const recent = recentPicks
          .map(name => src.find(p => p.display === name))
          .filter(Boolean).slice(0, 10);
        hits = recent.length ? recent : src.slice(0, 10);
      } else {
        const valKana = toKatakana(val), valHira = toHiragana(val);
        const all = src.filter(p => { const h = toHiragana(p.display); return p.display.includes(valKana) || h.includes(valHira); });
        const sw = all.filter(p => toHiragana(p.display).startsWith(valHira) || p.display.startsWith(valKana));
        const ot = all.filter(p => !toHiragana(p.display).startsWith(valHira) && !p.display.startsWith(valKana));
        hits = [...sw, ...ot].slice(0, 15);
      }
      if (!hits.length) { listEl.classList.remove('open'); return; }
      listEl.innerHTML = hits.map(p => `<div class="autocomplete-item">${p.display}</div>`).join('');
      listEl.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('mousedown', ev => {
          ev.preventDefault();
          window._peAcMousedown = true;
          selectPePokeByName(idx, item.textContent);
          input.value = item.textContent;
          listEl.classList.remove('open');
          setTimeout(() => { window._peAcMousedown = false; }, 200);
        });
      });
      listEl.classList.add('open');
    }
    function onPeNameInput(input, idx) {
      showPeNameAc(input, idx, input.value.trim());
    }
    function onPeNameFocus(input, idx) {
      showPeNameAc(input, idx, input.value.trim());
    }

    function onPeNameKeydown(e, input, idx) {
      const listEl = document.getElementById(`pe-ac-${idx}`);
      const items = listEl?.querySelectorAll('.autocomplete-item') || [];
      const cur = listEl?.querySelector('.selected');
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!cur) items[0]?.classList.add('selected'); else { cur.classList.remove('selected'); (cur.nextElementSibling || items[0])?.classList.add('selected'); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (cur) { cur.classList.remove('selected'); (cur.previousElementSibling || items[items.length - 1])?.classList.add('selected'); } }
      else if (e.key === 'Enter') { e.preventDefault(); const sel = listEl?.querySelector('.selected') || items[0]; if (sel) { selectPePokeByName(idx, sel.textContent); input.value = sel.textContent; listEl.classList.remove('open'); } }
      else if (e.key === 'Escape') { listEl?.classList.remove('open'); }
    }

    function selectPePokeByName(idx, name) {
      pePokemons[idx].name = name;
      pePokemons[idx].ability = '';
      recordRecentPick(name); // 最近選んだポケモンに追加
      // アイコン更新
      const btn = document.getElementById(`pe-picker-btn-${idx}`);
      if (btn) setPePickerIcon(btn, name);
      // 特性選択肢更新
      const abilSel = document.getElementById(`pe-ability-${idx}`);
      if (abilSel) buildAbilityOptions(abilSel, name, '');
      // 名前入力欁E��更新�E�Eextarea対応！E
      const cardPE2 = document.querySelector(`#pe-body .pe-pokemon-card[data-pe-idx="${idx}"]`);
      if (cardPE2) { const ta = cardPE2.querySelector('.pe-name-input'); if (ta) ta.value = name; }
      // スチE�Eタスボタン更新
      updateStatsBtnText(idx);
    }

    // ===== Pokepaste (Showdown形弁E 連携機�E =====
    let _transMapData = null;
    let _transMapPromise = null;
    async function loadTranslationMap() {
      if (_transMapData) return _transMapData;
      if (_transMapPromise) return _transMapPromise;
      _transMapPromise = (async () => {
        try {
          const res = await fetch('data/translation_map.json');
          if (res.ok) {
            _transMapData = await res.json();
          }
        } catch (e) {
          console.error("Error");
        }
        return _transMapData || {};
      })();
      return _transMapPromise;
    }

    function toTransId(s) {
      if (!s) return '';
      return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function normalizeJaAlphaNum(s) {
      if (!s) return '';
      return String(s).replace(/[�E�-�E��E�E�E�！E�E�]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    }

    function translatePokemonToEn(jaDisplay) {
      if (!jaDisplay) return '';
      if (!_transMapData || !_transMapData.pokemon_ja_to_en) return jaDisplay;
      if (_transMapData.pokemon_ja_to_en[jaDisplay]) return _transMapData.pokemon_ja_to_en[jaDisplay];
      const norm = normalizeJaAlphaNum(jaDisplay);
      if (_transMapData.pokemon_ja_to_en[norm]) return _transMapData.pokemon_ja_to_en[norm];
      return jaDisplay;
    }

    function translatePokemonToJa(enName) {
      if (!enName) return '';
      if (!_transMapData || !_transMapData.pokemon_en_to_ja) return enName;
      const id = toTransId(enName);
      if (_transMapData.pokemon_en_to_ja[id]) return _transMapData.pokemon_en_to_ja[id];
      return enName;
    }

    function translateItemToEn(jaItem) {
      if (!jaItem) return '';
      if (!_transMapData || !_transMapData.items_ja_to_en) return jaItem;
      if (_transMapData.items_ja_to_en[jaItem]) return _transMapData.items_ja_to_en[jaItem];
      const norm = normalizeJaAlphaNum(jaItem);
      if (_transMapData.items_ja_to_en[norm]) return _transMapData.items_ja_to_en[norm];
      return jaItem;
    }

    function translateItemToJa(enItem) {
      if (!enItem) return '';
      if (!_transMapData || !_transMapData.items_en_to_ja) return enItem;
      const id = toTransId(enItem);
      if (_transMapData.items_en_to_ja[id]) return _transMapData.items_en_to_ja[id];
      return enItem;
    }

    function translateMoveToEn(jaMove) {
      if (!jaMove) return '';
      if (!_transMapData || !_transMapData.moves_ja_to_en) return jaMove;
      return _transMapData.moves_ja_to_en[jaMove] || jaMove;
    }

    function translateMoveToJa(enMove) {
      if (!enMove) return '';
      if (!_transMapData || !_transMapData.moves_en_to_ja) return enMove;
      const id = toTransId(enMove);
      return _transMapData.moves_en_to_ja[id] || enMove;
    }

    function translateAbilityToEn(jaAbil) {
      if (!jaAbil) return '';
      if (!_transMapData || !_transMapData.abilities_ja_to_en) return jaAbil;
      return _transMapData.abilities_ja_to_en[jaAbil] || jaAbil;
    }

    function translateAbilityToJa(enAbil) {
      if (!enAbil) return '';
      if (!_transMapData || !_transMapData.abilities_en_to_ja) return enAbil;
      const id = toTransId(enAbil);
      return _transMapData.abilities_en_to_ja[id] || enAbil;
    }

    function translateNatureToEn(jaNature) {
      if (!jaNature) return 'Serious';
      if (!_transMapData || !_transMapData.natures_ja_to_en) return jaNature;
      return _transMapData.natures_ja_to_en[jaNature] || 'Serious';
    }

    function translateNatureToJa(enNature) {
      if (!enNature) return 'まじめ';
      if (!_transMapData || !_transMapData.natures_en_to_ja) return enNature;
      const id = toTransId(enNature);
      return _transMapData.natures_en_to_ja[id] || 'まじめ';
    }

    // アプリ冁E��ーチE�� -> PokepasteチE��スト生戁E
    function exportToPokepasteText(pokemonList, isOts = false) {
      const blocks = [];
      (pokemonList || []).forEach(pk => {
        if (!pk || !pk.name) return;
        const lines = [];

        // 1. ポケモン吁E& 持ち物
        let pokeEn = translatePokemonToEn(pk.name);
        const itemEn = pk.item ? translateItemToEn(pk.item) : '';
        if (itemEn) {
          lines.push(`${pokeEn} @ ${itemEn}`);
        } else {
          lines.push(`${pokeEn}`);
        }

        // 2. 特性
        if (pk.ability) {
          const abilEn = translateAbilityToEn(pk.ability);
          lines.push(`Ability: ${abilEn}`);
        }

        // 3. レベル
        lines.push(`Level: 50`);

        // OTS以外�E場吁E EVs & 性格
        if (!isOts) {
          const evs = pk.evs || {};
          const STAT_ORDER = [
            { k: 'hp', label: 'HP' },
            { k: 'atk', label: 'Atk' },
            { k: 'def', label: 'Def' },
            { k: 'spa', label: 'SpA' },
            { k: 'spd', label: 'SpD' },
            { k: 'spe', label: 'Spe' }
          ];
          const evParts = [];
          STAT_ORDER.forEach(st => {
            const v = parseInt(evs[st.k], 10) || 0;
            if (v > 0) {
              evParts.push(`${v} ${st.label}`);
            }
          });
          if (evParts.length > 0) {
            lines.push(`EVs: ${evParts.join(' / ')}`);
          }

          const natureEn = translateNatureToEn(pk.nature || 'まじめ');
          if (natureEn) {
            lines.push(`${natureEn} Nature`);
          }
        }

        // 4. 技4つ
        (pk.moves || []).forEach(mv => {
          if (mv && mv.trim()) {
            const mvEn = translateMoveToEn(mv.trim());
            lines.push(`- ${mvEn}`);
          }
        });

        blocks.push(lines.join('\n'));
      });
      return blocks.join('\n\n');
    }

    // PokepasteチE��スチE-> アプリ冁E�EケモンチE�Eタ解极E
    function parsePokepasteText(text) {
      if (!text || !text.trim()) return [];
      const rawLines = text.split(/\r?\n/);
      const pokeBlocks = [];
      let currentLines = [];

      rawLines.forEach(l => {
        const trimmed = l.trim();
        if (!trimmed) {
          if (currentLines.length) {
            pokeBlocks.push(currentLines);
            currentLines = [];
          }
        } else {
          currentLines.push(trimmed);
        }
      });
      if (currentLines.length) pokeBlocks.push(currentLines);

      const parsedList = [];
      pokeBlocks.forEach(blk => {
        if (!blk.length) return;
        const pk = {
          name: '',
          item: '',
          ability: '',
          moves: ['', '', '', ''],
          nature: 'まじめ',
          evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
          memo: ''
        };

        // 1行目の解极E "Species (Gender) @ Item" また�E "Nickname (Species) (Gender) @ Item"
        const firstLine = blk[0];
        let itemPart = '';
        let pokePart = firstLine;

        if (firstLine.includes('@')) {
          const atIdx = firstLine.indexOf('@');
          pokePart = firstLine.substring(0, atIdx).trim();
          itemPart = firstLine.substring(atIdx + 1).trim();
        }

        // 性別表訁E(M), (F) を除去
        pokePart = pokePart.replace(/\s*\([MF]\)\s*$/i, '').trim();

        // ニックネ�Eム表訁E"Nickname (Species)" -> "Species"
        const nickMatch = pokePart.match(/\(([^)]+)\)$/);
        if (nickMatch) {
          pokePart = nickMatch[1].trim();
        }

        // ポケモン名�EアイチE��名�E日本語変換
        let jaName = translatePokemonToJa(pokePart);
        let jaItem = itemPart ? translateItemToJa(itemPart) : '';

        // メガスト�Eンを持ってぁE��場合�Eメガシンカフォルムに自動�EチE��ング
        if (jaItem) {
          const stoneMap = window.MEGA_STONE_MAP || (window.MEGA_STONES_DATA || {});
          if (stoneMap && stoneMap[jaItem]) {
            jaName = stoneMap[jaItem];
          }
        }

        pk.name = jaName;
        pk.item = jaItem;

        let moveIndex = 0;
        for (let i = 1; i < blk.length; i++) {
          const line = blk[i];
          if (/^Ability:\s*(.+)$/i.test(line)) {
            const rawAbil = line.replace(/^Ability:\s*/i, '').trim();
            pk.ability = translateAbilityToJa(rawAbil);
          } else if (/^EVs:\s*(.+)$/i.test(line)) {
            const rawEvs = line.replace(/^EVs:\s*/i, '').trim();
            const parts = rawEvs.split('/');
            parts.forEach(p => {
              const m = p.trim().match(/^(\d+)\s*(HP|Atk|Def|SpA|SpD|Spe)$/i);
              if (m) {
                const val = parseInt(m[1], 10) || 0;
                const stat = m[2].toLowerCase();
                const statKey = stat === 'spa' ? 'spa' : (stat === 'spd' ? 'spd' : (stat === 'spe' ? 'spe' : stat));
                // 32より大きい�E�通常の252振りなど�E�場合�E 0、E2 に丸めE
                pk.evs[statKey] = val > 32 ? Math.min(32, Math.round(val / 8)) : val;
              }
            });
          } else if (/^(\w+)\s+Nature$/i.test(line)) {
            const m = line.match(/^(\w+)\s+Nature$/i);
            if (m) {
              pk.nature = translateNatureToJa(m[1]);
            }
          } else if (/^-\s*(.+)$/.test(line)) {
            if (moveIndex < 4) {
              const rawMove = line.replace(/^-\s*/, '').trim();
              pk.moves[moveIndex] = translateMoveToJa(rawMove);
              moveIndex++;
            }
          }
        }

        // メガシンカポケモンの場合、特性がメガ前�Eも�Eに適合してぁE��か確誁E
        if (pk.name) {
          let pd = findPokemon(pk.name);
          if (pd && pd.form && pd.form.includes('メガ')) {
            const base = (localPokemon || POKEMON_LIST).find(p => p.name === pd.name && (p.form === '通常' || !p.form));
            if (base) {
              const abilities = [base.ability1, base.ability2, base.ability_hidden].filter(Boolean);
              if (abilities.length && (!pk.ability || !abilities.includes(pk.ability))) {
                pk.ability = abilities[0];
              }
            }
          }
        }

        parsedList.push(pk);
      });

      return parsedList;
    }

    async function openPokepasteModal() {
      await loadStaticMasterData();
      await loadTranslationMap();
      syncPeInputsToState();

      const modal = document.getElementById('pokepaste-modal');
      const textarea = document.getElementById('pokepaste-textarea');
      if (!modal || !textarea) return;

      const currentExportText = exportToPokepasteText(pePokemons, false);
      textarea.value = currentExportText;
      modal.classList.add('open');
    }

    function closePokepasteModal() {
      const modal = document.getElementById('pokepaste-modal');
      if (modal) modal.classList.remove('open');
    }

    function importPokepasteFromModal() {
      const textarea = document.getElementById('pokepaste-textarea');
      if (!textarea) return;
      const text = textarea.value.trim();
      if (!text) {
        alert("Alert");
        return;
      }

      const pokes = parsePokepasteText(text);
      if (!pokes.length) {
        alert("Alert");
        return;
      }

      for (let i = 0; i < 6; i++) {
        if (i < pokes.length) {
          pePokemons[i] = pokes[i];
        } else {
          pePokemons[i] = peEmptyPoke();
        }
      }

      renderPartyEditBody();
      closePokepasteModal();
    }

    async function exportAndOpenInPokePaste(isOts = false) {
      await loadStaticMasterData();
      await loadTranslationMap();
      syncPeInputsToState();

      const text = exportToPokepasteText(pePokemons, isOts);
      if (!text) {
        alert("Alert");
        return;
      }

      const titleInput = document.getElementById('pe-name-input');
      const title = (titleInput && titleInput.value.trim()) ? titleInput.value.trim() + (isOts ? ' (OTS)' : '') : (isOts ? 'Team (OTS)' : 'Team');

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = 'https://pokepast.es/create';
      form.target = '_blank';
      form.style.display = 'none';

      const pasteField = document.createElement('input');
      pasteField.type = 'hidden';
      pasteField.name = 'paste';
      pasteField.value = text;
      form.appendChild(pasteField);

      const titleField = document.createElement('input');
      titleField.type = 'hidden';
      titleField.name = 'title';
      titleField.value = title;
      form.appendChild(titleField);

      const authorField = document.createElement('input');
      authorField.type = 'hidden';
      authorField.name = 'author';
      authorField.value = '';
      form.appendChild(authorField);

      const notesField = document.createElement('input');
      notesField.type = 'hidden';
      notesField.name = 'notes';
      notesField.value = '';
      form.appendChild(notesField);

      document.body.appendChild(form);
      form.submit();
      setTimeout(() => { form.remove(); }, 500);
    }

    // ピッカーからポケモン選抁E
    let _pePickerTargetIdx = -1;
    function openPokemonPickerForPe(idx) {
      _pePickerTargetIdx = idx;
      pickerOppSlotIndex = -1;
      pickerTargetInput = null;
      pickerActiveType = null;
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      const slotsNav = document.getElementById('picker-slots-nav');
      const fallbackTitle = document.getElementById('picker-fallback-title');
      if (slotsNav) slotsNav.style.display = 'none';
      if (fallbackTitle) fallbackTitle.style.display = 'block';
      pickerOnSearch('');
      const overlay = document.getElementById('pokemon-picker');
      overlay.classList.add('open');
    }

    // 持ち物の最近使用履歴
    let recentItems = JSON.parse(localStorage.getItem('pkm_recent_items') || '[]');
    function recordRecentItem(name) {
      recentItems = recentItems.filter(n => n !== name);
      recentItems.unshift(name);
      if (recentItems.length > 20) recentItems = recentItems.slice(0, 20);
      localStorage.setItem('pkm_recent_items', JSON.stringify(recentItems));
    }

    // 持ち物オートコンプリーチE
    function showPeItemAc(input, idx, val) {
      const listEl = document.getElementById(`pe-item-ac-${idx}`);
      if (!listEl) return;
      let hits;
      if (!val) {
        // 空: 最近選んだ持ち物を表示�E�最大10件�E�E
        const confirmedItems = localItems.filter(it => it.confirmed !== false).map(it => it.name);
        const recentConfirmed = recentItems.filter(n => confirmedItems.includes(n));
        hits = recentConfirmed.slice(0, 10);
        if (!hits.length) hits = confirmedItems.slice(0, 10);
      } else {
        const valKana = toKatakana(val), valHira = toHiragana(val);
        const confirmedNames = localItems.filter(it => it.confirmed !== false).map(it => it.name);
        const all = confirmedNames.filter(name => { const h = toHiragana(name); return name.includes(valKana) || h.includes(valHira); });
        const sw = all.filter(n => toHiragana(n).startsWith(valHira) || n.startsWith(valKana));
        const ot = all.filter(n => !toHiragana(n).startsWith(valHira) && !n.startsWith(valKana));
        hits = [...sw, ...ot].slice(0, 15);
      }
      if (!hits.length) { listEl.classList.remove('open'); return; }
      listEl.innerHTML = hits.map(n => `<div class="autocomplete-item">${n}</div>`).join('');
      listEl.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('mousedown', ev => {
          ev.preventDefault();
          window._peAcMousedown = true;
          const name = item.textContent;
          input.value = name;
          pePokemons[idx].item = name;
          checkAndApplyMegaOnItemChange(idx, name);
          recordRecentItem(name);
          listEl.classList.remove('open');
          setTimeout(() => { window._peAcMousedown = false; }, 200);
        });
      });
      listEl.classList.add('open');
    }
    function resolveMegaFormByItem(pokeNameOrDisplay, itemName) {
      if (!itemName || !MEGA_STONE_MAP) return pokeNameOrDisplay;
      const megaDisp = MEGA_STONE_MAP[itemName.trim()];
      if (megaDisp) {
        const baseName = (pokeNameOrDisplay || '').replace(/\(.*\)/, '').trim();
        if (!baseName || megaDisp.startsWith(baseName)) {
          return megaDisp;
        }
      }
      return pokeNameOrDisplay;
    }

    function checkAndApplyMegaOnItemChange(idx, itemName) {
      const currentName = pePokemons[idx].name || '';
      if (currentName) {
        const newName = resolveMegaFormByItem(currentName, itemName);
        if (newName !== currentName) {
          setPePokemon(idx, newName);
          const card = document.querySelectorAll('.pe-pokemon-card')[idx];
          if (card) {
            const ta = card.querySelector('.pe-name-input');
            if (ta) ta.value = newName;
          }
        }
      }
    }

    function onPeItemInput(input, idx) {
      const val = input.value.trim();
      pePokemons[idx].item = val;
      checkAndApplyMegaOnItemChange(idx, val);
      showPeItemAc(input, idx, val);
    }
    function onPeItemFocus(input, idx) {
      showPeItemAc(input, idx, input.value.trim());
    }

    function updateStatsBtnText(idx) {
      const btn = document.getElementById(`pe-stats-btn-${idx}`);
      if (btn) btn.innerHTML = buildStatsBtnHTML(idx);
    }

    // ---- スチE�Eタス計箁E----
    function calcStat(key, base, ev, nd) {
      if (key === 'hp') return base + (ev || 0) + 75;
      const mult = nd && nd.up === key ? 1.1 : (nd && nd.down === key ? 0.9 : 1.0);
      return Math.floor((base + (ev || 0) + 20) * mult);
    }
    function getNatureModifier(key, natureName) {
      const nd = NATURES_DATA.find(n => n.name === natureName) || { up: null, down: null };
      if (nd.up === key) return '+';
      if (nd.down === key) return '-';
      return '';
    }

    // ---- 技ピッカー ----
    let _movePkIdx = -1, _moveMvIdx = -1, _movePkActiveType = null;
    let _moveLearnOnly = true;

    async function openMovePickerPopup(pkIdx, mvIdx) {
      await loadStaticMasterData();
      _movePkIdx = pkIdx; _moveMvIdx = mvIdx; _movePkActiveType = null;

      const pk = pePokemons[pkIdx];
      const pokeName = (pk && pk.name) ? pk.name : (document.querySelectorAll('.pe-name-input')[pkIdx]?.value || '');
      const hasPoke = Boolean(pokeName);
      const toggleBtn = document.getElementById('move-picker-learn-toggle');
      const titleEl = document.getElementById('move-picker-title');

      const pokeLearnedList = (hasPoke && LEARNSETS_DATA)
        ? (LEARNSETS_DATA[pokeName] || LEARNSETS_DATA[pokeName.replace(/\(.*\)/, '')])
        : null;

      if (pokeLearnedList && pokeLearnedList.length > 0) {
        _moveLearnOnly = true; // 覚える技に限宁E
        if (toggleBtn) {
          toggleBtn.style.display = 'inline-block';
          toggleBtn.textContent = '全技を表示';
          toggleBtn.classList.remove('btn-primary');
          toggleBtn.classList.add('btn-ghost');
        }
        if (titleEl) titleEl.textContent = `${pokeName} の技`;
      } else {
        _moveLearnOnly = false;
        if (toggleBtn) toggleBtn.style.display = 'none';
        if (titleEl) titleEl.textContent = '技を選抁E;
      }

      buildMovePickerTypes();
      const searchInput = document.getElementById('move-picker-search');
      if (searchInput) searchInput.value = '';
      filterMovePicker('');
      document.getElementById('move-picker-overlay').classList.add('open');
      setTimeout(() => {
        if (searchInput) searchInput.focus();
      }, 50);
    }

    function toggleMovePickerLearnOnly() {
      _moveLearnOnly = !_moveLearnOnly;
      const toggleBtn = document.getElementById('move-picker-learn-toggle');
      if (toggleBtn) {
        toggleBtn.textContent = _moveLearnOnly ? '全技を表示' : '習得技のみ';
        toggleBtn.classList.toggle('btn-primary', !_moveLearnOnly);
        toggleBtn.classList.toggle('btn-ghost', _moveLearnOnly);
      }
      filterMovePicker(document.getElementById('move-picker-search').value);
    }

    function closeMovePickerPopup() {
      document.getElementById('move-picker-overlay').classList.remove('open');
    }
    function buildMovePickerTypes() {
      const container = document.getElementById('move-picker-types');
      const types = [...new Set((localMoves || MOVES_LIST).map(m => m.type).filter(Boolean))].sort();
      container.innerHTML = types.map(t => `<button class="type-btn" data-type="${t}" onclick="toggleMovePickerType('${t}')" style="font-size:10px;width:40px;height:32px">${t}</button>`).join('');
      // タイプカラー適用
      container.querySelectorAll('.type-btn').forEach(btn => {
        const styles = window.getComputedStyle(btn);
        // 既存CSSのタイプカラーをそのまま利用
      });
    }
    function toggleMovePickerType(t) {
      _movePkActiveType = _movePkActiveType === t ? null : t;
      document.querySelectorAll('#move-picker-types .type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === _movePkActiveType);
      });
      filterMovePicker(document.getElementById('move-picker-search').value);
    }
    function filterMovePicker(val) {
      const body = document.getElementById('move-picker-body');
      const valKana = toKatakana(val.trim()), valHira = toHiragana(val.trim());

      const pk = _movePkIdx >= 0 ? pePokemons[_movePkIdx] : null;
      const pokeName = (pk && pk.name) ? pk.name : (document.querySelectorAll('.pe-name-input')[_movePkIdx]?.value || '');
      let learnedSet = null;
      if (pokeName && LEARNSETS_DATA) {
        const rawList = LEARNSETS_DATA[pokeName] || LEARNSETS_DATA[pokeName.replace(/\(.*\)/, '')];
        if (rawList && Array.isArray(rawList)) {
          learnedSet = new Set(rawList);
        }
      }

      let list = (localMoves || MOVES_LIST).filter(m => m.confirmed !== false); // 冁E���Eみ
      if (_movePkActiveType) list = list.filter(m => m.type === _movePkActiveType);
      if (val.trim()) list = list.filter(m => { const h = toHiragana(m.name); return m.name.includes(valKana) || h.includes(valHira); });

      if (learnedSet && _moveLearnOnly) {
        list = list.filter(m => learnedSet.has(m.name));
      } else if (learnedSet) {
        // 習得技を上位にソーチE
        list = [...list].sort((a, b) => {
          const aLearned = learnedSet.has(a.name) ? 1 : 0;
          const bLearned = learnedSet.has(b.name) ? 1 : 0;
          return bLearned - aLearned;
        });
      }

      if (list.length === 0) {
        body.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">該当する技が見つかりません</div>';
        return;
      }

      body.innerHTML = list.map(m => {
        const isLearned = learnedSet ? learnedSet.has(m.name) : false;
        return `<div class="move-picker-row" onclick="selectMoveFromPicker('${m.name.replace(/'/g, "\\'")}')">
      <span class="move-type-badge" style="background:${getTypeColor(m.type)}">${m.type}</span>
      <span class="move-picker-name">${isLearned ? '<span style="color:#eab308;font-size:11px;margin-right:4px" title="習得可能技">☁E/span>' : ''}${m.name}</span>
      <span class="move-picker-cat" style="margin-left:auto">${m.category || ''}</span>
      <span class="move-picker-pwr">${m.power || '-'}</span>
    </div>`;
      }).join('');
    }
    function getTypeColor(type) {
      const map = { ノ�Eマル: '#9e9e9e', ほのぁE '#e8622e', みぁE '#3a8fd1', でんき: '#e0b022', くさ: '#5a9e32', こおめE '#5aafc8', かくとぁE '#c4501e', どぁE '#8c3a8c', じめめE '#b8963c', ひこう: '#7a8ecd', エスパ�E: '#d43078', むぁE '#8ea820', ぁE��: '#b0962a', ゴースチE '#5a4578', ドラゴン: '#5038c8', あく: '#2c2840', はが�E: '#6878a8', フェアリー: '#d060a0' };
      return map[type] || '#888';
    }
    function selectMoveFromPicker(name) {
      if (_movePkIdx < 0 || _moveMvIdx < 0) return;
      pePokemons[_movePkIdx].moves[_moveMvIdx] = name;
      const btn = document.getElementById(`pe-move-${_movePkIdx}-${_moveMvIdx}`);
      if (btn) { btn.textContent = name; btn.classList.add('filled'); }
      closeMovePickerPopup();
    }

    // ---- スチE�EタスポップアチE�E ----
    let _statsPkIdx = -1;
    function openStatsPopup(idx) {
      _statsPkIdx = idx;
      renderStatsPopup();
      document.getElementById('stats-popup-overlay').classList.add('open');
    }
    function closeStatsPopup() {
      document.getElementById('stats-popup-overlay').classList.remove('open');
    }
    function applyStats() { closeStatsPopup(); updateStatsBtnText(_statsPkIdx); }

    function renderStatsPopup() {
      const pk = pePokemons[_statsPkIdx];
      const pd = pk.name ? findPokemon(pk.name) : null;
      const nd = NATURES_DATA.find(n => n.name === (pk.nature || 'まじめ')) || { up: null, down: null };

      document.getElementById('stats-popup-title').textContent = pk.name ? `${pk.name} のスチE�Eタス` : 'スチE�Eタス';

      // 性格セレクチE
      const natSel = document.getElementById('stats-nature-sel');
      natSel.innerHTML = NATURES_DATA.map(n => `<option value="${n.name}" ${n.name === (pk.nature || 'まじめ') ? 'selected' : ''}>${n.name}</option>`).join('');

      const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
      const STAT_LABELS = ['HP', '攻撁E, '防御', '特攻', '特防', '素早ぁE];
      const BASE_KEYS = ['hp', 'atk', 'def', 'spatk', 'spdef', 'spd'];
      const MAX_BASE = 255;
      const evs = pk.evs || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      const totalEv = Object.values(evs).reduce((a, b) => a + (b || 0), 0);

      document.getElementById('stats-remaining').textContent = `残り能力値: ${66 - totalEv}`;

      let html = '';
      STAT_KEYS.forEach((key, i) => {
        const base = pd ? (parseInt(pd[BASE_KEYS[i]]) || 0) : 0;
        const ev = evs[key] || 0;
        const calc = pd ? calcStat(key, base, ev, nd) : '-';
        const barPct = Math.min(100, Math.round(base / MAX_BASE * 100));
        const mod = getNatureModifier(key, pk.nature || 'まじめ');
        const modClass = mod === '+' ? 'stat-up' : mod === '-' ? 'stat-down' : '';
        html += `<div class="stats-row">
      <div class="stats-lbl ${modClass}">${STAT_LABELS[i]}${mod}</div>
      <div class="stats-base">${base}</div>
      <div class="stats-bar-wrap"><div class="stats-bar" style="width:${barPct}%"></div></div>
      <div class="stats-ev-col">
        <input type="number" class="stats-ev-input" data-stat-key="${key}" min="0" max="32" value="${ev}"
          oninput="onEvInput(this,'${key}')" style="font-size:12px">
        <input type="range" class="stats-ev-slider" data-stat-key="${key}" min="0" max="32" value="${ev}"
          oninput="onEvSlider(this,'${key}')">
      </div>
      <div class="stats-calc" id="stats-calc-${key}">${calc}</div>
    </div>`;
      });
      document.getElementById('stats-popup-body').innerHTML = html;
    }

    function onNatureChange() {
      const val = document.getElementById('stats-nature-sel').value;
      pePokemons[_statsPkIdx].nature = val;
      refreshStatsCalc();
    }

    function onEvInput(input, key) {
      let v = parseInt(input.value) || 0;
      const pk = pePokemons[_statsPkIdx];
      const evs = pk.evs;
      const others = Object.entries(evs).filter(([k]) => k !== key).reduce((a, [, b]) => a + (b || 0), 0);
      v = Math.max(0, Math.min(32, Math.min(v, 66 - others)));
      input.value = v;
      evs[key] = v;
      // スライダー同期
      const slider = document.querySelector(`.stats-ev-slider[data-stat-key="${key}"]`);
      if (slider) slider.value = v;
      refreshStatsCalc();
    }

    function onEvSlider(slider, key) {
      let v = parseInt(slider.value) || 0;
      const pk = pePokemons[_statsPkIdx];
      const evs = pk.evs;
      const others = Object.entries(evs).filter(([k]) => k !== key).reduce((a, [, b]) => a + (b || 0), 0);
      v = Math.max(0, Math.min(32, Math.min(v, 66 - others)));
      slider.value = v;
      evs[key] = v;
      // 数値入力同朁E
      const numInput = document.querySelector(`.stats-ev-input[data-stat-key="${key}"]`);
      if (numInput) numInput.value = v;
      refreshStatsCalc();
    }

    function refreshStatsCalc() {
      const pk = pePokemons[_statsPkIdx];
      const pd = pk.name ? findPokemon(pk.name) : null;
      const nd = NATURES_DATA.find(n => n.name === (pk.nature || 'まじめ')) || { up: null, down: null };
      const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
      const BASE_KEYS = ['hp', 'atk', 'def', 'spatk', 'spdef', 'spd'];
      const STAT_LABELS = ['HP', '攻撁E, '防御', '特攻', '特防', '素早ぁE];
      const evs = pk.evs;
      let total = 0;
      STAT_KEYS.forEach((key, i) => {
        const base = pd ? (parseInt(pd[BASE_KEYS[i]]) || 0) : 0;
        const ev = evs[key] || 0;
        total += ev;
        const calc = pd ? calcStat(key, base, ev, nd) : '-';
        const el = document.getElementById(`stats-calc-${key}`);
        if (el) el.textContent = calc;
        const mod = getNatureModifier(key, pk.nature || 'まじめ');
        // ラベルの色更新
        const row = document.querySelector(`.stats-ev-input[data-stat-key="${key}"]`)?.closest('.stats-row');
        if (row) {
          const lbl = row.querySelector('.stats-lbl');
          if (lbl) {
            lbl.textContent = STAT_LABELS[i] + mod;
            lbl.className = 'stats-lbl ' + (mod === '+' ? 'stat-up' : mod === '-' ? 'stat-down' : '');
          }
        }
      });
      document.getElementById('stats-remaining').textContent = `残り能力値: ${66 - total}`;
    }



    // ポケモンピッカーからパ�EチE��編雁E��の選択フチE���E�EelectFromPickerをPE対応に拡張�E�E


    // ポケモンスロチE��のアイコンを更新�E��Eケモン名があればスプライト、なければボ�Eル�E�E
    function updateSlotIcon(input, displayName) {
      const containerId = input.dataset.container;
      const index = input.dataset.index;
      const btn = document.getElementById(`picker-btn-${containerId}-${index}`);
      if (!btn) return;
      const ballImg = btn.querySelector('.ball-img');
      const spriteEl = btn.querySelector('.poke-sprite');
      if (!ballImg || !spriteEl) return;

      if (!displayName) {
        // ボ�Eルを表示
        ballImg.style.display = 'block';
        spriteEl.style.display = 'none';
        return;
      }

      // localPokemonからnoを取得してアイコン位置計箁E
      const poke = localPokemon.find(p => p.display === displayName);
      if (!poke) {
        ballImg.style.display = 'block';
        spriteEl.style.display = 'none';
        return;
      }
      spriteEl.style.backgroundPosition = getPokeIconPos(poke);
      ballImg.style.display = 'none';
      spriteEl.style.display = 'block';
    }


    // メガシンカフォームかどぁE��判定（メガニウム・メガヤンマ�E除外しなぁE��E
    function isMegaForm(pokemon) {
      if (!pokemon) return false;
      // form に「メガ」が含まれてぁE��ばメガ進化フォーム
      // メガニウム(form=通常)めE��ガヤンチEform=通常)は除外しなぁE
      // メガニウム(form=メガメガニウム)はformにメガが含まれるので除外対象
      return pokemon.form && pokemon.form.includes('メガ');
    }


    // フォーム名からアイコン下�E短縮ラベルを生戁E
    function getFormLabel(form, pokemonName) {
      if (!form || form === '通常') return '';
      let label = form;

      // メガ進匁E ポケモン名を除ぁE��「メガ、E末尾記号だけ残す
      if (label.startsWith('メガ')) {
        const suffix = label.slice(2);
        const nameRemoved = pokemonName && suffix.startsWith(pokemonName)
          ? suffix.slice(pokemonName.length) : suffix;
        return 'メガ' + nameRemoved;
      }

      // ロトムフォーム: 末尾の「ロトム」を除去
      if (label.endsWith('ロトム') && label !== 'ロトムのすがぁE) {
        return label.slice(0, -3);
      }
      if (label === 'ロトムのすがぁE) return '';

      // 不要な斁E��を除去
      for (const word of ['のすがぁE, 'すがぁE, 'フォルム', 'のサイズ', 'サイズ']) {
        label = label.replace(word, '');
      }
      return label.trim();
    }

    function getPokeSpriteHTML(display, no, form, pokemonName) {
      const pos = getPokeIconPos(display || { no, form, name: pokemonName });
      return `<div class="poke-tag-icon"><span class="poke-tag-sprite" style="background-position:${pos}"></span></div>`;
    }

    // display名から�EケモンチE�Eタを取得してスプライチETMLを返す�E�E(1)キャチE��ュ対応！E
    function getPokeSpriteHTMLByDisplay(display) {
      if (!display) return '';
      if (_spriteCache.has(display)) {
        return _spriteCache.get(display);
      }
      const p = findPokemon(display);
      if (!p) {
        const fallback = `<span class="poke-tag">${display}</span>`;
        _spriteCache.set(display, fallback);
        return fallback;
      }
      const html = getPokeSpriteHTML(p.display || display, p.no, p.form, p.name);
      _spriteCache.set(display, html);
      return html;
    }


    // パ�EチE��並び替えドラチE��&ドロチE�E
    function initPartyDragSort(grid) {
      let dragSrc = null;

      grid.querySelectorAll('.party-card').forEach(card => {
        // スマ�E(タチE��チE��イス)ではdraggableを無効�E�タチE�E遁E��を防ぐ！E
        if (!('ontouchstart' in window)) {
          card.setAttribute('draggable', 'true');
        }

        card.addEventListener('dragstart', e => {
          dragSrc = card;
          card.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', card.dataset.partyId);
        });

        card.addEventListener('dragend', () => {
          card.classList.remove('dragging');
          grid.querySelectorAll('.party-card').forEach(c => c.classList.remove('drag-over'));
          dragSrc = null;
        });

        card.addEventListener('dragover', e => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (dragSrc && dragSrc !== card) {
            grid.querySelectorAll('.party-card').forEach(c => c.classList.remove('drag-over'));
            card.classList.add('drag-over');
          }
        });

        card.addEventListener('dragleave', () => {
          card.classList.remove('drag-over');
        });

        card.addEventListener('drop', e => {
          e.preventDefault();
          if (!dragSrc || dragSrc === card) return;
          card.classList.remove('drag-over');
          const fromId = dragSrc.dataset.partyId;
          const toId = card.dataset.partyId;
          const fromIdx = parties.findIndex(p => p.id === fromId);
          const toIdx = parties.findIndex(p => p.id === toId);
          if (fromIdx < 0 || toIdx < 0) return;
          // 並び替ぁE
          const [moved] = parties.splice(fromIdx, 1);
          parties.splice(toIdx, 0, moved); parties.forEach((p,i)=>{p.order=i; savePartyDoc(p);});
          saveData();
          renderParties();
          renderRecordPage();
        });
      });
    }


    // ============================================================
    // ---- 相手パーチE��絞り込み�E�テキスト�E力AC�E�E----
    // ============================================================

    function onOppPartyFilterFocus(input) { showOppPartyAC(input.value); }
    function onOppPartyFilterInput(input) { showOppPartyAC(input.value); }

    function onOppPartyFilterKeydown(e, input) {
      const list = document.getElementById('opp-party-filter-ac');
      const items = list.querySelectorAll('.autocomplete-item');
      let sel = list.querySelector('.autocomplete-item.selected');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!sel && items.length) items[0].classList.add('selected');
        else if (sel) { sel.classList.remove('selected'); if (sel.nextElementSibling) sel.nextElementSibling.classList.add('selected'); }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (sel) { sel.classList.remove('selected'); if (sel.previousElementSibling) sel.previousElementSibling.classList.add('selected'); }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (sel) { setOppPartyFilter(sel.dataset.name); input.value = ''; list.classList.remove('open'); }
      } else if (e.key === 'Escape') {
        list.classList.remove('open');
      }
    }

    function showOppPartyAC(val) {
      const list = document.getElementById('opp-party-filter-ac');
      if (!list) return;
      // 現在選択中のパ�EチE��の試合�E相手パーチE��から候補を生�E
      const filterVal = document.getElementById('history-filter').value;
      const baseRecords = filterVal ? records.filter(r => r.partyId === filterVal) : records;
      const allPokemon = [...new Set(baseRecords.flatMap(r => r.oppParty.filter(Boolean)))].sort();
      let candidates;
      if (!val) {
        candidates = allPokemon;
      } else {
        const valKana = toKatakana(val), valHira = toHiragana(val);
        candidates = allPokemon.filter(name => {
          const nH = toHiragana(name);
          return name.includes(valKana) || nH.includes(valHira) || name.includes(val);
        });
      }
      list.innerHTML = candidates.map(name =>
        '<div class="autocomplete-item" data-name="' + name + '">' + name + '</div>'
      ).join('');
      list.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('mousedown', e => {
          e.preventDefault();
          setOppPartyFilter(item.dataset.name);
          document.getElementById('opp-party-filter-input').value = '';
          list.classList.remove('open');
        });
      });
      if (candidates.length) list.classList.add('open');
      else list.classList.remove('open');
    }

    function setOppPartyFilter(name) {
      oppPartyFilterName = name;
      const tag = document.getElementById('opp-party-filter-tag');
      const nameEl = document.getElementById('opp-party-filter-name');
      if (tag) tag.style.display = name ? 'flex' : 'none';
      if (nameEl) nameEl.textContent = name;
      const input = document.getElementById('opp-party-filter-input');
      if (input) input.value = '';
      document.getElementById('opp-party-filter-ac')?.classList.remove('open');
      updateOppPartyRate();
      renderHistory();
    }

    function updateOppPartyRate() {
      const rateEl = document.getElementById('opp-party-rate');
      if (!rateEl || !oppPartyFilterName) { if (rateEl) rateEl.style.display = 'none'; return; }
      const filterVal = document.getElementById('history-filter').value;
      const partyRecs = filterVal ? records.filter(r => r.partyId === filterVal) : records;
      const appeared = partyRecs.filter(r => r.oppParty.includes(oppPartyFilterName)).length;
      const selected = partyRecs.filter(r => r.oppParty.includes(oppPartyFilterName) && r.oppSelection.includes(oppPartyFilterName)).length;
      if (!appeared) { rateEl.style.display = 'none'; return; }
      const pct = Math.round(selected / appeared * 100);
      rateEl.textContent = selected + '/' + appeared + ' (' + pct + '%)';
      rateEl.style.display = 'block';
    }

    function clearOppPartyFilter() {
      oppPartyFilterName = '';
      const tag = document.getElementById('opp-party-filter-tag');
      if (tag) tag.style.display = 'none';
      const rateEl = document.getElementById('opp-party-rate');
      if (rateEl) rateEl.style.display = 'none';
      const input = document.getElementById('opp-party-filter-input');
      if (input) input.value = '';
      renderHistory();
    }

    // AC外クリチE��で閉じめE
    document.addEventListener('click', e => {
      const ac = document.getElementById('opp-party-filter-ac');
      const input = document.getElementById('opp-party-filter-input');
      if (ac && input && !input.contains(e.target) && !ac.contains(e.target)) {
        ac.classList.remove('open');
      }
    });


    // ---- 自刁E�E選出フィルター�E�テキスチEC方式！E----

    // 対象試合�E自刁E�E選出から候補を収集
    function getMySelCandidates() {
      const filterVal = document.getElementById('history-filter').value;
      const baseRecords = filterVal ? records.filter(r => r.partyId === filterVal) : records;
      return [...new Set(baseRecords.flatMap(r => (r.mySelection || []).filter(Boolean)))].sort();
    }

    function showMySelAC(val) {
      const list = document.getElementById('my-sel-filter-ac');
      if (!list) return;
      const allPokemon = getMySelCandidates();
      let candidates;
      if (!val) {
        candidates = allPokemon;
      } else {
        const valKana = toKatakana(val), valHira = toHiragana(val);
        candidates = allPokemon.filter(name => {
          const nH = toHiragana(name);
          return name.includes(valKana) || nH.includes(valHira) || name.includes(val);
        });
      }
      list.innerHTML = candidates.map(name =>
        '<div class="autocomplete-item" data-name="' + name + '">' + name + '</div>'
      ).join('');
      list.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('mousedown', e => {
          e.preventDefault();
          setMySelFilter(item.dataset.name);
          document.getElementById('my-sel-filter-input').value = '';
          list.classList.remove('open');
        });
      });
      if (candidates.length) list.classList.add('open');
      else list.classList.remove('open');
    }

    function onMySelFilterFocus(input) { showMySelAC(input.value); }
    function onMySelFilterInput(input) { showMySelAC(input.value); }

    function onMySelFilterKeydown(e, input) {
      const list = document.getElementById('my-sel-filter-ac');
      const items = list.querySelectorAll('.autocomplete-item');
      let sel = list.querySelector('.autocomplete-item.selected');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!sel && items.length) items[0].classList.add('selected');
        else if (sel) { sel.classList.remove('selected'); if (sel.nextElementSibling) sel.nextElementSibling.classList.add('selected'); }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (sel) { sel.classList.remove('selected'); if (sel.previousElementSibling) sel.previousElementSibling.classList.add('selected'); }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (sel) { setMySelFilter(sel.dataset.name); input.value = ''; list.classList.remove('open'); }
      } else if (e.key === 'Escape') {
        list.classList.remove('open');
      }
    }

    function setMySelFilter(name) {
      mySelFilterName = name;
      const tag = document.getElementById('my-sel-filter-tag');
      const nameEl = document.getElementById('my-sel-filter-name');
      if (tag) tag.style.display = name ? 'flex' : 'none';
      if (nameEl) nameEl.textContent = name;
      const input = document.getElementById('my-sel-filter-input');
      if (input) input.value = '';
      document.getElementById('my-sel-filter-ac').classList.remove('open');
      updateMySelRate();
      renderHistory();
    }

    function clearMySelFilter() {
      mySelFilterName = '';
      const tag = document.getElementById('my-sel-filter-tag');
      if (tag) tag.style.display = 'none';
      const rateEl = document.getElementById('my-sel-rate');
      if (rateEl) rateEl.style.display = 'none';
      const input = document.getElementById('my-sel-filter-input');
      if (input) input.value = '';
      renderHistory();
    }

    function updateMySelRate() {
      const rateEl = document.getElementById('my-sel-rate');
      if (!rateEl || !mySelFilterName) { if (rateEl) rateEl.style.display = 'none'; return; }
      const filterVal = document.getElementById('history-filter').value;
      const partyRecs = filterVal ? records.filter(r => r.partyId === filterVal) : records;
      const total = partyRecs.length;
      const selected = partyRecs.filter(r => r.mySelection.includes(mySelFilterName)).length;
      if (!total) { rateEl.style.display = 'none'; return; }
      const pct = Math.round(selected / total * 100);
      rateEl.textContent = selected + '/' + total + ' (' + pct + '%)';
      rateEl.style.display = 'block';
    }

    // AC外クリチE��で閉じる（�E刁E�E選出�E�E
    document.addEventListener('click', e => {
      const ac = document.getElementById('my-sel-filter-ac');
      const input = document.getElementById('my-sel-filter-input');
      if (ac && input && !input.contains(e.target) && !ac.contains(e.target)) {
        ac.classList.remove('open');
      }
    });

    // ======================================================
    // ---- AI PARTY IMAGE PARSER (Gemini API / BYOK方弁E ----
    // ======================================================
    let _aiTargetPartyId = null;
    let _aiUploadedImages = []; // [{ id, name, mimeType, base64, dataUrl }]

    function getGeminiApiKey() {
      return localStorage.getItem('pkm_gemini_api_key') || '';
    }

    async function saveGeminiApiKey(key) {
      const clean = (key || '').trim();
      localStorage.setItem('pkm_gemini_api_key', clean);
      updateAiApiKeyUI();
      if (currentUser && _fbReady) {
        try {
          const { doc, setDoc } = window._firestoreOps;
          const db = window._db;
          const uid = currentUser.uid;
          await setDoc(doc(db, 'users', uid, 'data', 'main'), {
            geminiApiKey: clean,
            updatedAt: window._firestoreOps.serverTimestamp()
          }, { merge: true });
        } catch (e) {
          console.error("Error");
        }
      }
    }

    function saveGeminiApiKeyFromInput() {
      const inp = document.getElementById('ai-api-key-input');
      if (!inp) return;
      const val = inp.value.trim();
      if (!val) {
        alert("Alert");
        return;
      }
      saveGeminiApiKey(val);
      alert("Alert");
      const guideBox = document.getElementById('ai-key-guide-box');
      if (guideBox) guideBox.style.display = 'none';
    }

    function toggleAiApiKeyGuide() {
      const box = document.getElementById('ai-key-guide-box');
      if (!box) return;
      const isHidden = box.style.display === 'none' || !box.style.display;
      box.style.display = isHidden ? 'block' : 'none';
      if (isHidden) {
        const inp = document.getElementById('ai-api-key-input');
        if (inp) {
          inp.value = getGeminiApiKey();
          setTimeout(() => inp.focus(), 50);
        }
      }
    }

    function updateAiApiKeyUI() {
      const key = getGeminiApiKey();
      const badge = document.getElementById('ai-key-badge');
      const guideBox = document.getElementById('ai-key-guide-box');
      const inp = document.getElementById('ai-api-key-input');

      if (badge) {
        if (key) {
          badge.textContent = '設定済み';
          badge.style.color = 'var(--win)';
        } else {
          badge.textContent = '未設宁E;
          badge.style.color = 'var(--lose)';
        }
      }
      if (inp && key) {
        inp.value = key;
      }
      // 未設定�E場合�E自動的にガイドを表示
      if (!key && guideBox) {
        guideBox.style.display = 'block';
      }
    }

    function openAiPartyModal(partyId = null) {
      _aiTargetPartyId = partyId;
      _aiUploadedImages = [];

      const title = document.getElementById('ai-party-modal-title');
      if (title) {
        title.textContent = partyId ? '📸 画像からパーチE��編雁E : '📸 画像からパーチE��自動作�E';
      }

      // 初期匁E
      const errEl = document.getElementById('ai-error-msg');
      if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
      const loadingBox = document.getElementById('ai-loading-box');
      if (loadingBox) loadingBox.style.display = 'none';
      const uploadSection = document.getElementById('ai-upload-section');
      if (uploadSection) uploadSection.style.display = 'block';
      const modalFooter = document.getElementById('ai-modal-footer');
      if (modalFooter) modalFooter.style.display = 'flex';

      updateAiApiKeyUI();
      renderAiPreviews();

      const modal = document.getElementById('ai-party-modal');
      if (modal) modal.classList.add('open');
    }

    function closeAiPartyModal() {
      const modal = document.getElementById('ai-party-modal');
      if (modal) modal.classList.remove('open');
      _aiUploadedImages = [];
    }

    // ファイル選択ハンドラ
    function handleAiFileSelect(event) {
      const files = event.target.files;
      if (!files || !files.length) return;
      addAiImageFiles(Array.from(files));
      event.target.value = ''; // リセチE��
    }

    // 画像ファイルをCanvasで軽量リサイズ�E�長辺1600px、JPEG品質0.85�E�して追加
    async function addAiImageFiles(files) {
      const imgFiles = files.filter(f => f.type.startsWith('image/'));
      if (!imgFiles.length) {
        alert("Alert");
        return;
      }

      const remaining = 2 - _aiUploadedImages.length;
      if (remaining <= 0) {
        alert("Alert");
        return;
      }

      const toAdd = imgFiles.slice(0, remaining);

      for (const file of toAdd) {
        try {
          const resized = await resizeImageFile(file, 1600, 0.85);
          _aiUploadedImages.push({
            id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            name: file.name,
            mimeType: 'image/jpeg',
            base64: resized.base64,
            dataUrl: resized.dataUrl
          });
        } catch (e) {
          console.error("Error");
        }
      }
      renderAiPreviews();
    }

    // 画像リサイズ・圧縮ヘルパ�E
    function resizeImageFile(file, maxDimension = 1600, quality = 0.85) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
          const img = new Image();
          img.onload = () => {
            let width = img.width;
            let height = img.height;

            if (width > maxDimension || height > maxDimension) {
              if (width > height) {
                height = Math.round((height * maxDimension) / width);
                width = maxDimension;
              } else {
                width = Math.round((width * maxDimension) / height);
                height = maxDimension;
              }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            const base64 = dataUrl.split(',')[1];
            resolve({ dataUrl, base64, width, height });
          };
          img.onerror = reject;
          img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    function removeAiImage(id) {
      _aiUploadedImages = _aiUploadedImages.filter(img => img.id !== id);
      renderAiPreviews();
    }

    function renderAiPreviews() {
      const container = document.getElementById('ai-preview-container');
      const submitBtn = document.getElementById('ai-submit-btn');
      if (!container || !submitBtn) return;

      if (!_aiUploadedImages.length) {
        container.style.display = 'none';
        container.innerHTML = '';
        submitBtn.disabled = true;
        return;
      }

      container.style.display = 'grid';
      container.innerHTML = _aiUploadedImages.map((img, idx) => {
        const label = idx === 0 ? '画僁E1' : '画僁E2';
        return `
      <div class="ai-preview-item">
        <img src="${img.dataUrl}" alt="プレビュー">
        <button class="ai-preview-del" onclick="removeAiImage('${img.id}')" title="削除">✁E/button>
        <span class="ai-preview-badge">${label}</span>
      </div>
    `;
      }).join('');

      submitBtn.disabled = false;
    }

    // ドラチE��&ドロチE�E、�Eースト�Eイベントリスナ�E設宁E
    document.addEventListener('DOMContentLoaded', () => {
      const dropZone = document.getElementById('ai-drop-zone');
      if (dropZone) {
        ['dragenter', 'dragover'].forEach(name => {
          dropZone.addEventListener(name, e => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('drag-over');
          });
        });
        ['dragleave', 'drop'].forEach(name => {
          dropZone.addEventListener(name, e => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');
          });
        });
        dropZone.addEventListener('drop', e => {
          const dt = e.dataTransfer;
          if (dt && dt.files && dt.files.length) {
            addAiImageFiles(Array.from(dt.files));
          }
        });
      }

      // クリチE�Eボ�Eド貼り付け�E�Etrl+V�E�E
      window.addEventListener('paste', e => {
        const modal = document.getElementById('ai-party-modal');
        if (!modal || !modal.classList.contains('open')) return;

        const items = e.clipboardData?.items;
        if (!items) return;
        const files = [];
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            const file = items[i].getAsFile();
            if (file) files.push(file);
          }
        }
        if (files.length) {
          e.preventDefault();
          addAiImageFiles(files);
        }
      });
    });

    // ---- Gemini API 呼び出ぁE& 解极E----
    async function executeAiPartyAnalysis() {
      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        alert("Alert");
        toggleAiApiKeyGuide();
        return;
      }

      if (!_aiUploadedImages.length) {
        alert("Alert");
        return;
      }

      const errEl = document.getElementById('ai-error-msg');
      const loadingBox = document.getElementById('ai-loading-box');
      const uploadSection = document.getElementById('ai-upload-section');
      const modalFooter = document.getElementById('ai-modal-footer');

      if (errEl) errEl.style.display = 'none';
      if (loadingBox) loadingBox.style.display = 'block';
      if (uploadSection) uploadSection.style.display = 'none';
      if (modalFooter) modalFooter.style.display = 'none';

      try {
        const promptText = `
あなた�EポケチE��モンスター�E�Eokemon HOMEおよびスカーレチE��・バイオレチE���E��E対戦チ�Eム画面抽出エキスパ�Eトです、E
添付された画像（「�E力」画面めE��スチE�Eタス」画面�E�を詳細に解析し、パーチE��全体�E惁E��を正確なJSON形式で抽出してください、E

【抽出ルール、E
1. teamName: チ�Eム名（侁E "Va" めE��ロチE��番号など、画面上部にあれば�E�E
2. teamId: チ�EムID�E�侁E "6KBAX0Y1Q9" など画面上部にあれば�E�E
3. pokemons: スロチE��1、Eのポケモン�E�最大6匹�E��E配�E。各オブジェクト�E以下を含めること�E�E
   - slot: 1、Eの番号
   - name: ポケモン名（侁E "フラエチE��", "エルフ�Eン", "ドドゲザン", "ウインチE��", "イダイトウ", "カイリュー" など�E�E
   - form: フォルム・姿�E�侁E "ヒスイのすがぁE, "えいえんのはな", "アローラのすがぁE, "通常" など�E�E
   - gender: "♁E また�E "♀" また�E "なぁE
   - teraType: チE��スタイプ（侁E "フェアリー", "ほのぁE, "ひこう", "ゴースチE, "ノ�Eマル", "みぁE など�E�E
   - ability: 特性名（侁E "フラワーベ�Eル", "ぁE��ずらごこめE, "まけんぁE, "ぁE��あたま", "てきおぁE��めE��", "せいしんりょぁE など�E�E
   - item: 持ち物名（侁E "フラエチE��ナイチE, "きあぁE�Eタスキ", "くろぁE��ガチE, "オボンのみ", "こだわりスカーチE, "りゅぁE�EキチE など�E�E
   - moves: 技名�E配�E�E�最大4つ、侁E ["まもる", "マジカルシャイン", "ムーンフォース", "はめつのひかり"]�E�E
   - stats: 実数値オブジェクチE{ "hp": 数値, "atk": 数値, "def": 数値, "spa": 数値, "spd": 数値, "spe": 数値 }
   - evs: スチE�Eタス画面の右側に表示されてぁE��努力値段階数値(0、E2) { "hp": 数値, "atk": 数値, "def": 数値, "spa": 数値, "spd": 数値, "spe": 数値 }�E�表示がなぁE��合�Eすべて0�E�E
   - natureUp: 性格の上�EスチE�Eタス�E�赤色▲の頁E��: "atk", "def", "spa", "spd", "spe" また�E なし！E
   - natureDown: 性格の下降スチE�Eタス�E�青色▼の頁E��: "atk", "def", "spa", "spd", "spe" また�E なし！E
   - nature: 推測される性格名（侁E "ひかえめE, "ぁE��っぱめE, "ようぁE, "おくびめE��", "まじめ" など�E�E

【重要、E
・画像が2枚ある場合（�E力画面�E�スチE�Eタス画面�E�、同じスロチE��の惁E��を統合して1つのオブジェクトにまとめてください、E
・ポケモンがメガスト�Eン�E�侁E "リザードナイチE", "フシギバナイチEなど�E�を持ってぁE��場合�E、formおよびnameに対応するメガシンカ�E�侁E "メガリザードンY", "メガフシギバナ"�E�を反映してください、E
・Nintendo Switch版また�Eスマ�Eトフォン版�Eどちら�E比率・レイアウトであっても正確に抽出してください、E
・出力�E純粋なJSONのみを返してください、E
`;

        const parts = [{ text: promptText }];
        _aiUploadedImages.forEach(img => {
          parts.push({
            inline_data: {
              mime_type: img.mimeType,
              data: img.base64
            }
          });
        });

        const candidateModels = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
        let response = null;
        let lastError = null;

        for (const model of candidateModels) {
          try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: parts }],
                generationConfig: {
                  responseMimeType: "application/json"
                }
              })
            });
            if (res.ok) {
              response = res;
              break;
            } else {
              const errData = await res.json().catch(() => ({}));
              console.warn(`Model ${model} failed:`, errData);
              lastError = new Error(errData.error?.message || `HTTPエラー (${res.status})`);
            }
          } catch (e) {
            lastError = e;
          }
        }

        if (!response || !response.ok) {
          throw lastError || new Error('AIモチE��の呼び出しに失敗しました');
        }

        const resJson = await response.json();
        const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!rawText) throw new Error("Error");

        // JSONパ�Eス�E��EークダウンコードブロチE��対応！E
        let cleanJsonStr = rawText.trim();
        if (cleanJsonStr.startsWith('```json')) cleanJsonStr = cleanJsonStr.slice(7);
        if (cleanJsonStr.startsWith('```')) cleanJsonStr = cleanJsonStr.slice(3);
        if (cleanJsonStr.endsWith('```')) cleanJsonStr = cleanJsonStr.slice(0, -3);

        const parsedData = JSON.parse(cleanJsonStr.trim());

        // アプリマスターチE�Eタと突合・クレンジングしてPEに反映
        applyAnalyzedPartyToPE(parsedData, _aiTargetPartyId);

      } catch (err) {
        console.error("Error");
        if (loadingBox) loadingBox.style.display = 'none';
        if (uploadSection) uploadSection.style.display = 'block';
        if (modalFooter) modalFooter.style.display = 'flex';
        if (errEl) {
          errEl.style.display = 'block';
          errEl.textContent = `解析に失敗しました: ${err.message || err}`;
        }
      }
    }

    // ---- マスターチE�Eタ照合�E正規化 & PE反映 ----
    function applyAnalyzedPartyToPE(data, targetPartyId) {
      editingPartyId = targetPartyId || null;
      pePokemons = Array.from({ length: 6 }, () => peEmptyPoke());

      // パ�EチE��吁E
      const nameInput = document.getElementById('pe-name-input');
      if (targetPartyId) {
        const existing = parties.find(p => p.id === targetPartyId);
        if (existing && nameInput) nameInput.value = existing.name;
      } else if (data.teamName && nameInput) {
        nameInput.value = data.teamName;
      } else if (nameInput) {
        nameInput.value = '新規パーチE��';
      }

      const allPokeSrc = localPokemon || POKEMON_LIST;
      const allMovesSrc = localMoves || MOVES_LIST;
      const allItemsSrc = localItems || ITEMS_LIST;

      const rawList = Array.isArray(data.pokemons) ? data.pokemons : [];

      rawList.forEach((rawPk, i) => {
        if (i >= 6) return;
        const pokeObj = peEmptyPoke();

        // 3. 持ち物の照吁E
        const matchedItem = matchItem(rawPk.item, allItemsSrc);
        pokeObj.item = matchedItem;

        // 1. ポケモン名�E照合！Eisplay名）！Eメガスト�Eン判宁E
        let matchedDisplay = matchPokemonDisplay(rawPk.name, rawPk.form, rawPk.ability, allPokeSrc);
        if (matchedItem) {
          matchedDisplay = resolveMegaFormByItem(matchedDisplay, matchedItem);
        }
        const resolvedPoke = findPokemon(matchedDisplay);
        pokeObj.name = resolvedPoke ? resolvedPoke.display : (matchedDisplay || rawPk.name || '');

        // 2. 特性の照吁E
        pokeObj.ability = matchAbility(matchedDisplay, rawPk.ability, allPokeSrc);

        // 4. 技の照吁E(4つ)
        const rawMoves = Array.isArray(rawPk.moves) ? rawPk.moves : [];
        pokeObj.moves = [0, 1, 2, 3].map(mIdx => matchMove(rawMoves[mIdx] || '', allMovesSrc));

        // 5. 性格の特定（上�E/下降から送E��き、また�E性格名�E合！E
        pokeObj.nature = resolveNature(rawPk.natureUp, rawPk.natureDown, rawPk.nature);

        // 6. 努力値�E�E、E2段階！E
        pokeObj.evs = resolveEvs(rawPk.evs);

        pePokemons[i] = pokeObj;
      });

      closeAiPartyModal();
      renderPartyEditBody();
      document.getElementById('page-party-edit').classList.add('active');
      document.getElementById('page-party-edit').scrollTop = 0;
      syncCopyBoardToPE();
    }

    // ポケモン名！Eisplay�E��EあいまぁE�E吁E
    function matchPokemonDisplay(rawName, rawForm, rawAbility, pokeSrc) {
      if (!rawName) return '';
      const rNameKana = toKatakana(rawName.trim());
      const rNameHira = toHiragana(rawName.trim());
      const rForm = (rawForm || '').trim();

      // 完�E一致チェチE��
      let exact = pokeSrc.find(p => p.display === rawName || p.name === rawName);

      // フォルムが指定されてぁE��場吁E
      if (rForm && rForm !== '通常') {
        const withForm = pokeSrc.find(p => {
          const h = toHiragana(p.display);
          return (p.display.includes(rNameKana) || h.includes(rNameHira)) &&
            (p.form.includes(rForm) || p.display.includes(rForm));
        });
        if (withForm) return withForm.display;
      }

      // 特性からフォルムを特定（侁E ぁE��あたまウインチE�� ↁEヒスイ�E�E
      if (rawAbility) {
        const withAbil = pokeSrc.find(p => {
          const h = toHiragana(p.display);
          const isNameMatch = p.display.includes(rNameKana) || h.includes(rNameHira) || p.name.includes(rNameKana);
          const isAbilMatch = p.ability1 === rawAbility || p.ability2 === rawAbility || p.ability_hidden === rawAbility;
          return isNameMatch && isAbilMatch;
        });
        if (withAbil) return withAbil.display;
      }

      // 部刁E��致
      const candidates = pokeSrc.filter(p => {
        const dH = toHiragana(p.display);
        return p.display.includes(rNameKana) || dH.includes(rNameHira) ||
          p.name.includes(rNameKana) || toHiragana(p.name).includes(rNameHira);
      });

      if (candidates.length) {
        // 通常フォームを優允E
        const normal = candidates.find(p => p.form === '通常' || p.display === p.name);
        return normal ? normal.display : candidates[0].display;
      }

      return rawName;
    }

    // 特性の照吁E
    function matchAbility(pokeDisplay, rawAbility, pokeSrc) {
      if (!rawAbility) return '';
      let pd = findPokemon(pokeDisplay);
      if (pd) {
        // メガシンカフォームの場合�Eベ�Eスポケモン�E�メガ前）�E特性から照吁E
        if (pd.form && pd.form.includes('メガ')) {
          const base = (localPokemon || POKEMON_LIST).find(p => p.name === pd.name && (p.form === '通常' || !p.form));
          if (base) pd = base;
        }
        const valid = [pd.ability1, pd.ability2, pd.ability_hidden].filter(Boolean);
        const found = valid.find(a => a === rawAbility || toHiragana(a) === toHiragana(rawAbility));
        if (found) return found;
        if (valid.length === 1) return valid[0];
      }
      return rawAbility;
    }

    // 持ち物の照吁E
    function matchItem(rawItem, itemsSrc) {
      if (!rawItem) return '';
      const rKana = toKatakana(rawItem.trim());
      const rHira = toHiragana(rawItem.trim());

      const itemNames = itemsSrc.map(it => typeof it === 'string' ? it : it.name);
      const found = itemNames.find(n => n === rawItem || n === rKana || toHiragana(n) === rHira);
      if (found) return found;

      const partial = itemNames.find(n => n.includes(rKana) || toHiragana(n).includes(rHira));
      return partial || rawItem;
    }

    // 技の照吁E
    function matchMove(rawMove, movesSrc) {
      if (!rawMove) return '';
      const rKana = toKatakana(rawMove.trim());
      const rHira = toHiragana(rawMove.trim());

      const found = movesSrc.find(m => m.name === rawMove || m.name === rKana || toHiragana(m.name) === rHira);
      if (found) return found.name;

      const partial = movesSrc.find(m => m.name.includes(rKana) || toHiragana(m.name).includes(rHira));
      return partial ? partial.name : rawMove;
    }

    // 性格の特宁E
    function resolveNature(up, down, rawNature) {
      if (up && down && up !== down) {
        const found = NATURES_DATA.find(n => n.up === up && n.down === down);
        if (found) return found.name;
      }
      if (rawNature) {
        const found = NATURES_DATA.find(n => n.name === rawNature || toHiragana(n.name) === toHiragana(rawNature));
        if (found) return found.name;
      }
      return 'まじめ';
    }

    // 努力値のクレンジング�E�E、E2段階！E
    function resolveEvs(rawEvs) {
      const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      if (!rawEvs || typeof rawEvs !== 'object') return evs;

      const keys = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
      let total = 0;

      keys.forEach(k => {
        let val = parseInt(rawEvs[k]) || 0;
        if (val > 32) {
          // 252などの実努力値が�Eってきた場合�E32段階に変換
          val = Math.min(32, Math.round(val / 7.875));
        }
        val = Math.max(0, Math.min(32, val));
        evs[k] = val;
        total += val;
      });

      // 合計が66を趁E��る場合�E比率で調整
      if (total > 66) {
        const ratio = 66 / total;
        keys.forEach(k => {
          evs[k] = Math.floor(evs[k] * ratio);
        });
      }

      return evs;
    }

    // ======================================================
    // ---- BATTLE SCREEN AUTO FILL (完�Eローカル・マルチモーダル認識エンジン) ----
    // ======================================================

    let recordScanMode = 'auto'; // 'auto' | 'not_selected' | 'selected'

    function setRecordScanMode(mode) {
      recordScanMode = mode;
      const btnAuto = document.getElementById('rec-mode-auto');
      const btnUnsel = document.getElementById('rec-mode-unselected');
      const btnSel = document.getElementById('rec-mode-selected');

      [btnAuto, btnUnsel, btnSel].forEach(b => {
        if (!b) return;
        b.style.background = 'transparent';
        b.style.color = 'var(--text-muted)';
        b.style.fontWeight = '500';
      });

      const activeBtn = (mode === 'not_selected') ? btnUnsel : (mode === 'selected' ? btnSel : btnAuto);
      if (activeBtn) {
        activeBtn.style.background = 'var(--accent)';
        activeBtn.style.color = '#fff';
        activeBtn.style.fontWeight = '600';
      }
    }

    function showRecordToast(message) {
      let toast = document.getElementById('rec-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'rec-toast';
        toast.className = 'rec-toast';
        document.body.appendChild(toast);
      }
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3500);
    }

    let currentRecordAiImgDataUrl = null;

    function setRecordAiLoading(isLoading, statusText = '') {
      const idleUi = document.getElementById('rec-ai-idle-ui');
      const loadingUi = document.getElementById('rec-ai-loading-ui');
      const previewUi = document.getElementById('rec-ai-preview-ui');
      const statusEl = document.getElementById('rec-ai-status-text');

      if (isLoading) {
        if (idleUi) idleUi.style.display = 'none';
        if (previewUi) previewUi.style.display = 'none';
        if (loadingUi) loadingUi.style.display = 'block';
      } else {
        if (loadingUi) loadingUi.style.display = 'none';
        if (currentRecordAiImgDataUrl) {
          if (idleUi) idleUi.style.display = 'none';
          if (previewUi) previewUi.style.display = 'block';
        } else {
          if (idleUi) idleUi.style.display = 'block';
          if (previewUi) previewUi.style.display = 'none';
        }
      }
      if (statusEl && statusText) statusEl.textContent = statusText;
    }

    function onRecDropZoneClick(event) {
      // プレビュー表示中はファイルダイアログを開かなぁE
      const previewUi = document.getElementById('rec-ai-preview-ui');
      if (previewUi && previewUi.style.display !== 'none') return;
      document.getElementById('rec-ai-file-input').click();
    }

    function clearRecordAiImage(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      currentRecordAiImgDataUrl = null;
      const idleUi = document.getElementById('rec-ai-idle-ui');
      const loadingUi = document.getElementById('rec-ai-loading-ui');
      const previewUi = document.getElementById('rec-ai-preview-ui');
      const previewImg = document.getElementById('rec-ai-preview-img');
      const fileInput = document.getElementById('rec-ai-file-input');

      if (previewImg) previewImg.src = '';
      if (fileInput) fileInput.value = '';
      if (loadingUi) loadingUi.style.display = 'none';
      if (previewUi) previewUi.style.display = 'none';
      if (idleUi) idleUi.style.display = 'block';
      // ※ すでに自動�E力された相手パーチE��めE��出の惁E��は保持する
    }

    function openImageLightbox(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (!currentRecordAiImgDataUrl) return;
      const modal = document.getElementById('image-lightbox-modal');
      const modalImg = document.getElementById('image-lightbox-img');
      if (modal && modalImg) {
        modalImg.src = currentRecordAiImgDataUrl;
        modal.classList.add('open');
      }
    }

    function closeImageLightbox(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      const modal = document.getElementById('image-lightbox-modal');
      if (modal) modal.classList.remove('open');
    }

    function handleRecordAiFileSelect(event) {
      const files = event.target.files;
      if (!files || !files.length) return;
      handleRecordAiFile(files[0]);
      event.target.value = '';
    }

    function loadImageFromFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
          currentRecordAiImgDataUrl = e.target.result;
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
    let _aiEngineLoadingPromise = null;
    function ensureAiEngineLoaded() {
      if (window.recognitionEngine && window.recognitionEngine.isLoaded) {
        return Promise.resolve();
      }
      if (_aiEngineLoadingPromise) return _aiEngineLoadingPromise;

      _aiEngineLoadingPromise = (async () => {
        // Tesseract.js (Optional OCR for trainer name - never blocks recognition)
        if (!window.Tesseract) {
          fetch('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js')
            .catch(() => {});
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
          document.head.appendChild(s);
          // Do NOT await - let it load in background
        }

        // recognition_engine.js is already loaded synchronously in <head>.
        // Just call loadDictionaries() to fetch JSON assets.
        if (!window.recognitionEngine) {
          throw new Error("Error");
        }
        await window.recognitionEngine.loadDictionaries();
        // loadDictionaries() sets isLoaded=true on success, false on error.
        // We do NOT throw on false - the engine can still attempt recognition.
      })();

      _aiEngineLoadingPromise.catch(() => { _aiEngineLoadingPromise = null; });
      return _aiEngineLoadingPromise;
    }

    async function handleRecordAiFile(file) {
      if (!file || !file.type.startsWith('image/')) {
        alert("Alert");
        return;
      }

      setRecordAiLoading(true, 'AI解析モジュール読込中...');
      try {
        await ensureAiEngineLoaded();
      } catch (err) {
        // エンジンスクリプト自体�E同期読み込み済みのため、辞書ロードが失敗しても続行を試みめE
        if (!window.recognitionEngine) {
          console.error("Error");
          setRecordAiLoading(false);
          alert("Alert");
          return;
        }
        console.warn('Dictionary preload warning (continuing with available data):', err);
      }

      setRecordAiLoading(true, 'AI高精度解析中�E�EHOG幾何エンジン�E�E..');
      const startTime = performance.now();

      try {
        const img = await loadImageFromFile(file);

        // プレビュー画像�EセチE��
        const previewImg = document.getElementById('rec-ai-preview-img');
        if (previewImg && currentRecordAiImgDataUrl) {
          previewImg.src = currentRecordAiImgDataUrl;
        }

        // 現在選択されてぁE��自刁E�Eパ�EチE��のポケモン一覧を取征E
        let myTeamList = [];
        const myParty = parties.find(p => p.id === selectedPartyId);
        if (myParty && myParty.pokemon && myParty.pokemon.length) {
          myTeamList = myParty.pokemon.map(pk => (typeof pk === 'string' ? pk : (pk && pk.name || '')));
        }

        // 高精度認識エンジン�E�大津2値化！E80次元PHOG�E�幾何Solidity記述子＋タイプ認識）�E実衁E
        const result = await window.recognitionEngine.recognize(img, myTeamList, recordScanMode);
        console.log("Log");

        // 1. 相手トレーナ�E名�E反映
        if (result.trainerName) {
          const tInput = document.getElementById('rec-opp-trainer');
          if (tInput) tInput.value = result.trainerName;
        }

        // 2. 相手パーチE��スロチE��に反映
        const oppInputs = document.querySelectorAll('#opp-party-slots input[type=text]');
        let setOppCount = 0;
        if (result.opponent && result.opponent.length) {
          result.opponent.forEach((pName, idx) => {
            if (idx >= 6 || !oppInputs[idx]) return;
            oppInputs[idx].value = pName;
            updateSlotIcon(oppInputs[idx], pName);
            if (pName && pName !== '???') setOppCount++;
          });
        }

        // 相手選出ドロチE�Eダウンの選択肢を�E構篁E
        rebuildOppSelectionDropdowns();

        // 3. 自刁E�E選出�E�EFTERモード時の先発1/先発2/後発1/後発2�E�を反映
        let isSelectionAutoFilled = false;
        if (result.mode === 'AFTER' && result.mySelection && result.mySelection.length === 4) {
          setSelectionFromNames('my', result.mySelection);
          if (currentRecordFormat === 'bo3') {
            setSelectionFromNames('my', result.mySelection, 0);
          }
          if (mySelectionOrder.length > 0 || (bo3Games[0] && bo3Games[0].mySelectionOrder.length > 0)) {
            isSelectionAutoFilled = true;
          }
        }

        const elapsedMs = Math.round(performance.now() - startTime);
        const modeLabel = (result.mode === 'BEFORE') ? '選出画面' : '準備画面';
        const trainerLabel = result.trainerName ? `�E�トレーナ�E: ${result.trainerName}�E�` : '';
        const toastMsg = `⚡ 、E{modeLabel}】相手パーチE��${setOppCount}体` + (isSelectionAutoFilled ? 'と自刁E�E選出4佁E : '') + `${trainerLabel}を�E動�E力しました�E�E��E{elapsedMs}ms�E�`;
        showRecordToast("Notification");

      } catch (err) {
        console.error("Error");
        clearRecordAiImage();
        alert('画像�E解析に失敗しました: ' + (err.message || err));
      } finally {
        setRecordAiLoading(false);
      }
    }

    // ドラチE���E�E��ロチE�E、�Eースト�Eイベントリスナ�E設定（記録画面用�E�E
    function initRecordAiEvents() {
      const dropZone = document.getElementById('rec-ai-drop-zone');
      if (dropZone) {
        ['dragenter', 'dragover'].forEach(name => {
          dropZone.addEventListener(name, e => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('drag-over');
          });
        });
        ['dragleave', 'drop'].forEach(name => {
          dropZone.addEventListener(name, e => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');
          });
        });
        dropZone.addEventListener('drop', e => {
          const dt = e.dataTransfer;
          if (dt && dt.files && dt.files.length) {
            handleRecordAiFile(dt.files[0]);
          }
        });
      }

      // グローバルペ�Eスト！Etrl+V�E�：記録画面表示中の場吁E
      window.addEventListener('paste', e => {
        const recordPage = document.getElementById('page-record');
        const partyModal = document.getElementById('ai-party-modal');
        if (!recordPage || !recordPage.classList.contains('active')) return;
        if (partyModal && partyModal.classList.contains('open')) return;

        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            const file = items[i].getAsFile();
            if (file) {
              e.preventDefault();
              handleRecordAiFile(file);
              break;
            }
          }
        }
      });
    }

    document.addEventListener('DOMContentLoaded', () => {
      initRecordAiEvents();
    });

    
    // ==== 共有設定�E観戦モード関連 ====
    async function generateShareHash(uid, passcode) {
      const msgUint8 = new TextEncoder().encode(uid + ':' + passcode);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function toggleShareEnabled() {
      const isEnabled = document.getElementById('dm-share-enabled').checked;
      const area = document.getElementById('dm-share-settings-area');
      if (area) area.style.display = isEnabled ? 'block' : 'none';
      
      if (!isEnabled) {
        // 共有OFF時�Eすぐにクラウドへ反映
        saveShareSettings(false);
      } else {
        if (currentUser) {
            document.getElementById('dm-share-url').value = location.origin + location.pathname + '?share=' + currentUser.uid;
        }
      }
    }

    async function saveShareSettings(forceEnabled) {
      const enabledCheckbox = document.getElementById('dm-share-enabled');
      const isEnabled = forceEnabled !== undefined ? forceEnabled : (enabledCheckbox ? enabledCheckbox.checked : false);
      const passcode = document.getElementById('dm-share-passcode') ? document.getElementById('dm-share-passcode').value.trim() : '';

      if (isEnabled && (!passcode || !/^[\x21-\x7E]{1,10}$/.test(passcode))) {
        alert("Alert");
        return;
      }

      localStorage.setItem('pkm_share_enabled', isEnabled);
      localStorage.setItem('pkm_share_passcode', passcode);

      if (currentUser && window._firestoreOps && _fbReady) {
        try {
          // mainドキュメントに状態保孁E
          await window._firestoreOps.setDoc(
            window._firestoreOps.doc(window._db, 'users', currentUser.uid, 'data', 'main'),
            {
              shareEnabled: isEnabled,
              sharePasscode: passcode,
              updatedAt: window._firestoreOps.serverTimestamp()
            },
            { merge: true }
          );
          
          // 共有ONの場合�Eshares_dataにもデータを同朁E
          if (isEnabled) {
             await syncShareData(currentUser.uid, passcode);
          } else if (passcode) {
             // 共有OFFの場合、該当ハチE��ュのチE�Eタを消去(任愁E
             const hash = await generateShareHash(currentUser.uid, passcode);
             await window._firestoreOps.deleteDoc(window._firestoreOps.doc(window._db, 'shares_data', hash));
          }

          if (forceEnabled !== false) {
             showRecordToast("Notification");
          }
        } catch(e) {
          console.error("Error");
        }
      }
    }

    window.toggleShareEnabled = toggleShareEnabled;
    window.saveShareSettings = saveShareSettings;
    window.copyShareUrl = function() {
        const url = document.getElementById('dm-share-url');
        if (url && url.value) {
            navigator.clipboard.writeText(url.value).then(() => showRecordToast('📋 URLをコピ�Eしました�E�E));
        }
    };

    function updateShareUI() {
       const isEnabled = localStorage.getItem('pkm_share_enabled') === 'true';
       const passcode = localStorage.getItem('pkm_share_passcode') || '';
       const cb = document.getElementById('dm-share-enabled');
       const passEl = document.getElementById('dm-share-passcode');
       const urlEl = document.getElementById('dm-share-url');
       
       if (cb) cb.checked = isEnabled;
       if (passEl) passEl.value = passcode;
       if (urlEl && currentUser) {
           urlEl.value = location.origin + location.pathname + '?share=' + currentUser.uid;
       }
       toggleShareEnabled();
    }

    async function syncShareData(uid, passcode) {
       if (!uid || !passcode || !_fbReady) return;
       const hash = await generateShareHash(uid, passcode);
       const payload = {
          ownerUid: uid,
          ownerName: getShowdownUsername() || currentUser.displayName || "Unknown",
          parties: parties || [],
          records: records || [],
          seasons: seasons || [],
          customTags: customTags || [],
          updatedAt: window._firestoreOps.serverTimestamp()
       };
       await window._firestoreOps.setDoc(
          window._firestoreOps.doc(window._db, 'shares_data', hash),
          payload
       );
    }

    async function initSpectatorMode() {
       const params = new URLSearchParams(window.location.search);
       const shareUid = params.get('share');
       if (!shareUid) return false;

       _isSpectatorMode = true;
       _spectatorOwnerUid = shareUid;

       // モード変更UI
       const banner = document.getElementById('spectator-banner');
       if (banner) banner.style.display = 'block';
       document.querySelectorAll('.dm-admin-only, .btn-auto-mode').forEach(el => el.style.display = 'none');
       
       // 記録・チE�Eタ管琁E��ブを隠ぁE
       document.querySelectorAll('nav button').forEach(b => {
           if (b.textContent.includes('記録する') || b.textContent.includes('チE�Eタ管琁E)) {
               b.style.display = 'none';
           }
       });

       setTimeout(async () => {
           let passcode = prompt("👀 共有データを閲覧するための合言葉を入力してください");
           if(passcode) passcode = passcode.trim();
           if (!passcode) {
               location.href = location.origin + location.pathname;
               return;
           }
           
           try {
               const hash = await generateShareHash(shareUid, passcode);
               // _fbReadyになるまで征E��
               let waitCount = 0;
               while (!_fbReady && waitCount < 50) {
                   await new Promise(r => setTimeout(r, 100));
                   waitCount++;
               }
               
               const snap = await window._firestoreOps.getDoc(window._firestoreOps.doc(window._db, 'shares_data', hash));
               if (snap.exists()) {
                   const data = snap.data();
                   parties = data.parties || [];
                   records = data.records || [];
                   seasons = data.seasons || [];
                   customTags = data.customTags || [];
                   
                   const ownerName = data.ownerName || "プレイヤー";
                   const nameSpan = document.getElementById('spectator-owner-name');
                   if (nameSpan) nameSpan.textContent = ownerName;
                   
                   renderParties();
                   renderHistory();
                   showRecordToast("Notification");
               } else {
                   alert("Alert");
                   location.href = location.origin + location.pathname;
               }
           } catch(e) {
               console.error("Error");
               alert("Alert");
           }
       }, 500);

       return true;
    }


    // ==== Spectator Mode Bootstrap ====
    window.addEventListener('DOMContentLoaded', () => {
        initSpectatorMode();
    });

    // ---- INIT ----
    // localStorageから初期チE�Eタを確実に読み込み
    try {
      const lp = localStorage.getItem('pkm_parties');
      const lr = localStorage.getItem('pkm_records');
      if (lp) parties = JSON.parse(lp);
      if (lr) records = JSON.parse(lr);
    } catch (e) { }
    loadStaticMasterData().then(async () => {
      await dmLoadMasterData();
      renderParties();
    });

    // ---- PWA: Service Worker 解除�E�キャチE��ュ問題対策！E----
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(reg => reg.unregister());
      });
    }

    // ---- WiFi検知: 接続変化時にアチE�Eロードキューを起勁E----
    if (navigator.connection) {
      navigator.connection.addEventListener('change', () => {
        const c = navigator.connection;
        if (c.type === 'wifi' || c.type === 'ethernet' || !c.saveData) {
          setTimeout(() => startUploadQueue(), 1000);
        }
      });
    }

    // アプリ起動時に未送信動画があれ�Eピルを表示�E�認証済みならキュー実行、未認証ならタチE�E連携を俁E���E�E
    setTimeout(async () => {
      initDraggableUploadPill();
      cleanupOldLocalVideos(); // 30刁E��過した過去のローカル動画を安�EにクリーンアチE�E
      const validToken = loadStoredDriveToken();
      updateDriveSettingsUI();

      const pendingCount = (records || []).filter(r => r.sync_status === 'local_pending').length;
      if (pendingCount === 0) return;

      if (validToken) {
        startUploadQueue();
      } else if (getDriveClientId()) {
        showActionUploadPill("Action", () => {
          requestGoogleDriveAccessToken(true);
        });
      }
    }, 800);

