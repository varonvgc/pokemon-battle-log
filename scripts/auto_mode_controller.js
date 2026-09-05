/**
 * auto_mode_controller.js
 * PC限定オートモード コントローラー
 * OBS仮想カメラ (1920x1080) から対戦開始・相手パーティ/名前・出撃ポケモン・勝敗を全自動検知
 */

(function (window) {
  'use strict';

  // 1920x1080 基準の認識座標マップ (pamo3 準拠)
  const COORDS = {
    // 見せ合い検知ボール (Matching Phase)
    MATCHING_BALL: { x: 139, y: 923, w: 46, h: 46 },
    // 選出数 3/4 OCR (選出匹数・シングル/ダブル判定)
    BATTLE_FORMAT_DIGIT: { x: 233.5, y: 923.9, w: 23, h: 46 },
    // 相手トレーナー名 (Champions)
    TRAINER_NAME: { x: 1562, y: 95.4, w: 280, h: 47.6 },
    // VS 画面検知
    VS_SCREEN: { x: 860, y: 565, w: 50, h: 84 },
    // 見せ合い画面の相手 6 匹アイコン
    RIVAL_ICON: (index) => {
      const top = 159.5 + 125.9 * index;
      return { x: 1620.8, y: top, w: 104.6, h: 104.6 };
    },
    // 出撃ポケモン名 (ダブルバトル: 相手2匹, 自分2匹)
    DISPATCH_DOUBLE: [
      { role: 'rival', index: 0, x: 1196.7, y: 50, w: 220, h: 46 }, // 相手先発1
      { role: 'rival', index: 1, x: 1599.8, y: 50, w: 220, h: 46 }, // 相手先発2
      { role: 'me',    index: 0, x: 154.9,  y: 933, w: 220, h: 46 }, // 自分先発1
      { role: 'me',    index: 1, x: 554.6,  y: 933, w: 220, h: 46 }  // 自分先発2
    ],
    // 出撃ポケモン名 (シングルバトル)
    DISPATCH_SINGLE: [
      { role: 'rival', index: 0, x: 1589.6, y: 52, w: 220, h: 46 },
      { role: 'me',    index: 0, x: 148.1,  y: 932, w: 220, h: 46 }
    ],
    // 勝敗ボール (Win / Lose 判定)
    WIN_BALL_ME:    { x: 445.3, y: 771, w: 72, h: 72 },
    WIN_BALL_RIVAL: { x: 1405,  y: 771, w: 72, h: 72 }
  };

  // レーベンシュタイン距離（編集距離）計算
  function levenshteinDistance(s1, s2) {
    if (!s1 || !s2) return (s1 || s2 || "").length;
    const d = [];
    const len1 = s1.length;
    const len2 = s2.length;
    for (let i = 0; i <= len1; i++) {
      d[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      d[0][j] = j;
    }
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        d[i][j] = Math.min(
          d[i - 1][j] + 1,
          d[i][j - 1] + 1,
          d[i - 1][j - 1] + cost
        );
      }
    }
    return d[len1][len2];
  }

  class AutoModeController {
    constructor() {
      this.isActive = false;
      this.isAutoRunning = false;
      this.videoElement = null;
      this.stream = null;
      this.captureCanvas = document.createElement('canvas');
      this.captureCanvas.width = 1920;
      this.captureCanvas.height = 1080;
      this.captureCtx = this.captureCanvas.getContext('2d', { willReadFrequently: true });

      // ワーカー & アセット
      this.pawmiWorker = null;
      this.tesseractWorker = null;
      this.katakanaWorker = null;
      this.jobSeq = 0;
      this.callbacks = new Map();
      this.templates = {};

      // 状態管理
      // IDLE -> WAITING_MATCHING -> MATCHING -> WAITING_GAME_START -> IN_GAME -> END_GAME
      this.phase = 'IDLE';
      this.battleMode = 'double'; // 'double' or 'single' (デフォルトダブル優位)
      this.waitingStartTimestamp = null;
      this.loopTimer = null;
      this.isProcessingFrame = false;

      // 試合中データ
      this.detectedDispatchedMe = [];
      this.detectedDispatchedRival = [];
      this.rivalPartyNames = [];
      this.isWorkersReady = false;
      this.isInitializingWorkers = false;
    }

    // --- ワーカー & アセットのオンデマンド初期化 (オートモード開始時のみ実行) ---
    async ensureWorkersReady() {
      if (this.isWorkersReady) return true;
      if (this.isInitializingWorkers) return false;
      this.isInitializingWorkers = true;
      try {
        await this._initWorkers();
        await this._initTesseract();
        this.isWorkersReady = true;
        console.log('[AutoMode] All workers and templates ready!');
        return true;
      } catch (err) {
        console.warn('[AutoMode] Worker init error:', err);
        return false;
      } finally {
        this.isInitializingWorkers = false;
      }
    }

    async _initWorkers() {
      // 1. OpenCV テンプレートマッチングワーカー
      try {
        this.pawmiWorker = new Worker('scripts/pawmi_worker.js');
        this.pawmiWorker.onmessage = (e) => {
          const data = e.data || {};
          const cb = this.callbacks.get(data.id);
          if (cb) {
            this.callbacks.delete(data.id);
            if (data.ok) {
              cb(null, data.maxVal);
            } else {
              cb(new Error(data.error || 'Worker error'));
            }
          }
        };
        console.log('[AutoMode] Pawmi template matching worker loaded');
      } catch (err) {
        console.warn('[AutoMode] Failed to init pawmi worker:', err);
      }

      // 2. テンプレート画像のロード (Base64 キャッシュ)
      const templatePaths = {
        matchingBall: 'assets/templates/matching_phase_ball.png',
        winBall:      'assets/templates/win_ball.png',
        vsLogo:       'assets/templates/vs_v.png'
      };

      for (const [key, path] of Object.entries(templatePaths)) {
        try {
          const res = await fetch(path);
          const blob = await res.blob();
          const reader = new FileReader();
          await new Promise((resolve) => {
            reader.onloadend = () => {
              this.templates[key] = reader.result;
              resolve();
            };
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          console.warn(`[AutoMode] Failed to load template ${path}:`, e);
        }
      }
    }

    async _initTesseract() {
      if (typeof Tesseract === 'undefined') {
        const script = document.createElement('script');
        script.src = 'scripts/tesseract/tesseract.min.js';
        document.head.appendChild(script);
        await new Promise(r => script.onload = r);
      }
      try {
        const TESSERACT_OPTS = {
          workerPath: 'scripts/tesseract/worker.min.js',
          corePath: 'scripts/tesseract/tesseract-core-simd-lstm.wasm.js',
          langPath: 'scripts/tesseract/lang-data'
        };

        // カタカナ特化ワーカー (出撃ポケモン名用)
        this.katakanaWorker = await Tesseract.createWorker('jpn', TESSERACT_OPTS);
        const katakanaWhitelist = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポァィゥェォッャュョヴヵヶー・';
        await this.katakanaWorker.setParameters({
          tessedit_char_whitelist: katakanaWhitelist,
          tessedit_pageseg_mode: '7' // 単一行モード
        });

        // 汎用ワーカー (トレーナー名 & 数字用)
        this.tesseractWorker = await Tesseract.createWorker('jpn+eng', TESSERACT_OPTS);
        console.log('[AutoMode] Tesseract OCR workers ready');
      } catch (err) {
        console.warn('[AutoMode] Failed to init Tesseract worker:', err);
      }
    }

    // --- テンプレートマッチング実行 (Worker経由) ---
    async matchTemplate(cropBase64, templateBase64, options = {}) {
      if (!this.pawmiWorker || !cropBase64 || !templateBase64) return 0;
      const id = ++this.jobSeq;
      return new Promise((resolve) => {
        this.callbacks.set(id, (err, maxVal) => {
          if (err) {
            resolve(0);
          } else {
            resolve(typeof maxVal === 'number' ? maxVal : 0);
          }
        });
        this.pawmiWorker.postMessage({
          id: id,
          imageBase64: cropBase64,
          templateBase64: templateBase64,
          options: options
        });
      });
    }

    // --- カメラ操作 ---
    async requestPermission() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('ブラウザがカメラAPIに対応していません (HTTPSまたはlocalhostでアクセスしてください)');
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        // 許可が得られたら即座にトラックを解放
        stream.getTracks().forEach(t => t.stop());
        return true;
      } catch (err) {
        console.warn('[AutoMode] Camera permission denied or failed:', err);
        return false;
      }
    }

    async getCameraDevices(requestPerm = false) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return [];
      }
      if (requestPerm) {
        await this.requestPermission();
      }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(d => d.kind === 'videoinput');
      } catch (e) {
        console.error('[AutoMode] Error enumerating video devices:', e);
        return [];
      }
    }

    async startCamera(deviceId = null) {
      if (this.stream) {
        this.stopCamera();
      }

      // 1080p 60fps を目指しつつ、OBS仮想カメラ等の仕様に合わせて柔軟に接続
      const constraints = {
        audio: false,
        video: deviceId ? {
          deviceId: { exact: deviceId },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          frameRate: { ideal: 60, min: 30 }
        } : {
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 }
        }
      };

      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e1) {
        console.warn('[AutoMode] Strict camera constraints failed, falling back to basic deviceId:', e1);
        try {
          // フォールバック: 解像度制約なしでデバイスに直結
          this.stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: deviceId ? { deviceId: { exact: deviceId } } : true
          });
        } catch (e2) {
          console.error('[AutoMode] Failed to start camera stream:', e2);
          return false;
        }
      }

      if (this.videoElement && this.stream) {
        this.videoElement.srcObject = this.stream;
        try {
          await this.videoElement.play();
        } catch (playErr) {
          console.warn('[AutoMode] Video play error (handling autoplay):', playErr);
        }
      }
      console.log('[AutoMode] Camera stream started successfully');
      return true;
    }

    stopCamera() {
      if (this.stream) {
        this.stream.getTracks().forEach(t => t.stop());
        this.stream = null;
      }
      if (this.videoElement) {
        this.videoElement.srcObject = null;
      }
    }

    // --- キャプチャフレーム切り出しヘルパー ---
    captureFrame() {
      if (!this.videoElement || this.videoElement.readyState < 2) return null;
      this.captureCtx.drawImage(this.videoElement, 0, 0, 1920, 1080);
      return this.captureCtx;
    }

    cropToBase64(ctx, rect) {
      const { x, y, w, h } = rect;
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = Math.round(w);
      cropCanvas.height = Math.round(h);
      const cropCtx = cropCanvas.getContext('2d');
      cropCtx.drawImage(ctx.canvas, x, y, w, h, 0, 0, cropCanvas.width, cropCanvas.height);
      return cropCanvas.toDataURL('image/png');
    }

    // pamo3 完全準拠: 出撃ネームプレート用前処理 (19.3度回転補正 + 2x拡大 + 閾値180二値化)
    cropForDispatchOcr(ctx, rect) {
      const { x, y, w, h } = rect;
      const angleRad = 19.3 * Math.PI / 180;

      // 1. 原寸切り出し
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = Math.round(w);
      srcCanvas.height = Math.round(h);
      const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
      srcCtx.drawImage(ctx.canvas, x, y, w, h, 0, 0, w, h);

      // 2. 19.3度回転 (Deskew) + 2x拡大で水平な大文字に補正
      const ocrCanvas = document.createElement('canvas');
      ocrCanvas.width = Math.round(w * 2);
      ocrCanvas.height = Math.round(h * 2);
      const ocrCtx = ocrCanvas.getContext('2d', { willReadFrequently: true });

      ocrCtx.fillStyle = '#FFFFFF';
      ocrCtx.fillRect(0, 0, ocrCanvas.width, ocrCanvas.height);

      ocrCtx.save();
      ocrCtx.translate(ocrCanvas.width / 2, ocrCanvas.height / 2);
      ocrCtx.rotate(angleRad);
      ocrCtx.drawImage(srcCanvas, -srcCanvas.width, -srcCanvas.height, srcCanvas.width * 2, srcCanvas.height * 2);
      ocrCtx.restore();

      // 3. 閾値 175〜180 による白文字二値化 (文字=黒 0, 背景=白 255)
      const imgData = ocrCtx.getImageData(0, 0, ocrCanvas.width, ocrCanvas.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const bright = 0.299 * r + 0.587 * g + 0.114 * b;
        const isText = (bright >= 175) || (r > 165 && g > 165 && b > 165);
        const val = isText ? 0 : 255;
        d[i] = val;
        d[i + 1] = val;
        d[i + 2] = val;
        d[i + 3] = 255;
      }
      ocrCtx.putImageData(imgData, 0, 0);

      return ocrCanvas.toDataURL('image/png');
    }

    // --- オートモードの開始・停止 ---
    async startAutoMode() {
      this.isAutoRunning = true;
      this.phase = 'WAITING_MATCHING';
      this.updateStatusBadge('ワーカー初期化中...');
      // フォームを即座に初期化・表示して待機
      this._setupRecordFormForNewBattle();
      await this.ensureWorkersReady();
      this.updateStatusBadge('自動モード稼働中 (対戦待ち)');
      this._startLoop();
    }

    stopAutoMode() {
      this.isAutoRunning = false;
      this.phase = 'IDLE';
      this.updateStatusBadge('自動モードOFF');
      if (this.loopTimer) {
        clearTimeout(this.loopTimer);
        this.loopTimer = null;
      }
    }

    // --- メイン解析ループ (ステートマシン) ---
    _startLoop() {
      const loop = async () => {
        if (!this.isAutoRunning) return;
        if (!this.isProcessingFrame) {
          this.isProcessingFrame = true;
          try {
            await this._processCurrentPhase();
          } catch (e) {
            console.warn('[AutoMode] Frame process error:', e);
          } finally {
            this.isProcessingFrame = false;
          }
        }
        // 次のフレームチェック（350ms間隔でCPU負荷を抑制）
        this.loopTimer = setTimeout(loop, 350);
      };
      loop();
    }

    async _processCurrentPhase() {
      const ctx = this.captureFrame();
      if (!ctx) return;

      switch (this.phase) {
        // 1. 見せ合い画面待ち
        case 'WAITING_MATCHING': {
          const ballCrop = this.cropToBase64(ctx, COORDS.MATCHING_BALL);
          const score = await this.matchTemplate(ballCrop, this.templates.matchingBall, { useAlphaMask: true });
          if (score > 0.45) {
            console.log('[AutoMode] MATCHING PHASE DETECTED! score=' + score);
            this.phase = 'MATCHING';
            this.updateStatusBadge('見せ合い画面検知: 相手情報取得中...');
            await this._handleMatchingPhase(ctx);
          }
          break;
        }

        // 2. 対戦開始 (VS画面) 待ち
        case 'WAITING_GAME_START': {
          const vsCrop = this.cropToBase64(ctx, COORDS.VS_SCREEN);
          const vsScore = await this.matchTemplate(vsCrop, this.templates.vsLogo, { useAlphaMask: true });
          const elapsed = Date.now() - (this.waitingStartTimestamp || Date.now());

          // VS検知 or 35秒フォールバック
          if (vsScore > 0.48 || elapsed > 35000) {
            console.log(`[AutoMode] GAME START DETECTED! (vsScore=${vsScore}, elapsed=${elapsed}ms)`);
            this.phase = 'IN_GAME';
            this.updateStatusBadge('試合中: 出撃ポケモン検知中...');
            this.resetVsBar();
          }
          break;
        }

        // 3. 試合中 (出撃ポケモン検知 & 勝敗検知)
        case 'IN_GAME': {
          await this._detectDispatchedPokemons(ctx);
          await this._checkGameFinish(ctx);
          break;
        }

        default:
          break;
      }
    }

    // --- 見せ合い画面突入時の処理 ---
    async _handleMatchingPhase(ctx) {
      // 1. 左側フォームのセットアップ
      this._setupRecordFormForNewBattle();

      // 2. ダブルバトル専用 (選出4匹) に固定
      this.battleMode = 'double';
      console.log('[AutoMode] Battle mode fixed to Double Battle (4 slots)');

      // 3. 高精度認識エンジン (window.recognitionEngine) で相手パーティ6匹 & トレーナー名を自動特定！
      this.rivalPartyNames = [];
      try {
        if (window.recognitionEngine) {
          if (!window.recognitionEngine.isLoaded && typeof window.recognitionEngine.loadDictionaries === 'function') {
            await window.recognitionEngine.loadDictionaries();
          }

          // 自分のパーティ一覧
          let myTeamList = this.myPartyNames || [];

          // 画面全体 (1920x1080) を認識エンジンへ渡す
          const res = await window.recognitionEngine.recognize(ctx.canvas, myTeamList, 'BEFORE');
          console.log('[AutoMode] Recognition Engine Result:', res);

          // 3-1. 相手パーティ 6 匹のセット
          if (res && res.opponent && res.opponent.length) {
            console.log('[AutoMode] Detected Opponent Party:', res.opponent);
            const oppInputs = document.querySelectorAll('#opp-party-slots input[type=text]');
            res.opponent.forEach((pName, idx) => {
              if (idx < 6 && oppInputs[idx] && pName && pName !== '???') {
                oppInputs[idx].value = pName;
                oppInputs[idx].dispatchEvent(new Event('input', { bubbles: true }));
                oppInputs[idx].dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof window.updateSlotIcon === 'function') {
                  window.updateSlotIcon(oppInputs[idx], pName);
                }
                this.rivalPartyNames.push(pName);
              }
            });
            if (typeof window.rebuildOppSelectionDropdowns === 'function') {
              window.rebuildOppSelectionDropdowns();
            }
          } else {
            console.warn('[AutoMode] Recognition engine returned empty or invalid opponent:', res);
          }

          // 3-2. 相手トレーナー名のセット (16:9補正エンジン結果 + 直接切り出しOCRの相互補正)
          let finalTrainerName = (res && res.trainerName) ? res.trainerName.trim() : '';

          if (this.tesseractWorker) {
            try {
              const nameCrop = this.cropToBase64(ctx, COORDS.TRAINER_NAME);
              const nameRes = await this.tesseractWorker.recognize(nameCrop);
              const directText = (nameRes && nameRes.data && nameRes.data.text || '').replace(/[\r\n\t]/g, ' ').trim();
              if (directText && (!finalTrainerName || directText.length <= 12)) {
                finalTrainerName = directText;
              }
            } catch (e) {
              console.warn('[AutoMode] Direct trainer OCR error:', e);
            }
          }

          if (finalTrainerName) {
            const oppTrainerInput = document.getElementById('rec-opp-trainer');
            if (oppTrainerInput) {
              oppTrainerInput.value = finalTrainerName;
              oppTrainerInput.dispatchEvent(new Event('input', { bubbles: true }));
              oppTrainerInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }
      } catch (e) {
        console.error('[AutoMode] Recognition engine error:', e);
      }

      // 自分の登録パーティ名一覧を確実に取得
      this._extractMyPartyNames();

      this.waitingStartTimestamp = Date.now();
      this.phase = 'WAITING_GAME_START';
      this.updateStatusBadge('対戦開始待ち (VS画面待機中...)');
    }

    // 記録画面の自動初期化 (チャンピオンズ / ランクマ / BO1 / 一番上のパーティ)
    _setupRecordFormForNewBattle() {
      // 1. 記録タブへ切り替え
      if (typeof window.showPage === 'function') {
        const recordBtn = document.querySelector('nav button[onclick*="record"]') || document.querySelector('nav button:nth-child(3)');
        window.showPage('record', recordBtn);
      }

      // 2. 🏆 チャンピオンズ モードに切り替え
      if (typeof window.setRecordMode === 'function') {
        window.setRecordMode('champions');
      }

      // 3. 形式: ランクマ / BO1
      if (typeof window.setRecordMatchType === 'function') {
        window.setRecordMatchType('ranked');
      }
      if (typeof window.setRecordMatchBo === 'function') {
        window.setRecordMatchBo(1);
      }

      // 4. パーティ管理の一番上のパーティを選択してフォームを確実に開く
      const allParties = (window.autoModeBridge && window.autoModeBridge.getParties && window.autoModeBridge.getParties()) ||
                         window.parties ||
                         JSON.parse(localStorage.getItem('pkm_parties') || '[]');

      if (allParties && allParties.length > 0) {
        const firstParty = allParties[0];
        if (typeof window.selectPartyForRecord === 'function') {
          window.selectPartyForRecord(firstParty.id);
        } else if (typeof window.onPartyDropdownChange === 'function') {
          window.onPartyDropdownChange(firstParty.id);
        }
        const partySelect = document.getElementById('party-select-dropdown');
        if (partySelect) {
          partySelect.value = firstParty.id;
        }
        if (typeof window.showRecordForm === 'function') {
          window.showRecordForm();
        }
      } else {
        const partySelect = document.getElementById('party-select-dropdown');
        if (partySelect && partySelect.options.length > 1) {
          partySelect.selectedIndex = 1;
          partySelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      console.log('[AutoMode] Record form fully auto-configured for Champions Ranked BO1');
    }

    // 自分のパーティのポケモン名一覧を取得
    _extractMyPartyNames() {
      this.myPartyNames = [];
      const allParties = (window.autoModeBridge && window.autoModeBridge.getParties && window.autoModeBridge.getParties()) ||
                         window.parties ||
                         JSON.parse(localStorage.getItem('pkm_parties') || '[]');
      const selId = (window.autoModeBridge && window.autoModeBridge.getSelectedPartyId && window.autoModeBridge.getSelectedPartyId()) ||
                    window.selectedPartyId ||
                    (allParties[0] && allParties[0].id);

      if (allParties && allParties.length > 0) {
        const party = allParties.find(p => p.id === selId) || allParties[0];
        if (party && party.pokemon) {
          this.myPartyNames = party.pokemon.map(pk => typeof pk === 'string' ? pk : (pk && pk.name || '')).filter(Boolean);
        }
      }
      // スロットDOMからバックアップ取得
      if (this.myPartyNames.length === 0) {
        const myIcons = document.querySelectorAll('#my-party-icons img, #my-party-icons .poke-tag, .my-team-slot');
        myIcons.forEach(el => {
          const alt = el.getAttribute('alt') || el.getAttribute('data-name') || el.textContent.trim();
          if (alt && !this.myPartyNames.includes(alt)) this.myPartyNames.push(alt);
        });
      }
      console.log('[AutoMode] My party Pokémon pool:', this.myPartyNames);
    }

    // ポケモン名の正規化（フォルムに「メガ」または「ゲンシ」がある場合のみベース名を抽出）
    _normalizeBasePokeName(name) {
      if (!name) return '';
      const s = String(name).trim();
      // 括弧があり、かつその中に「メガ」または「ゲンシ」が含まれている場合のみベース名を抽出
      if ((s.includes('(') || s.includes('（')) && (s.includes('メガ') || s.includes('ゲンシ'))) {
        return s.split('(')[0].split('（')[0].trim();
      }
      return s;
    }

    // --- 試合中: 出撃ポケモンの検知 (ダブルバトル4匹特化・カタカナ特化OCR) ---
    async _detectDispatchedPokemons(ctx) {
      if (!this.katakanaWorker) return;

      const maxSlots = 4; // ダブルバトル固定 (選出4匹)

      // 1. 自分・相手ともに出撃枠が上限（4匹）に達している場合はOCRを完全に停止して超軽量化！
      if (this.detectedDispatchedMe.length >= maxSlots && this.detectedDispatchedRival.length >= maxSlots) {
        return;
      }

      // 2. OCRの実行間隔を最短400msに調整して先発出撃演出の数秒間に確実に全匹拾い切る！
      const now = Date.now();
      if (this.lastOcrTimestamp && (now - this.lastOcrTimestamp < 400)) {
        return;
      }
      this.lastOcrTimestamp = now;

      if (!this.dispatchedSlotsMe) this.dispatchedSlotsMe = {};
      if (!this.dispatchedSlotsRival) this.dispatchedSlotsRival = {};

      // 3. ユーザーが選出画面等で手動修正した相手パーティ入力を常時同期！
      const oppInputs = document.querySelectorAll('#opp-party-slots input[type=text]');
      if (oppInputs && oppInputs.length > 0) {
        const liveOppNames = Array.from(oppInputs).map(inp => inp.value.trim()).filter(Boolean);
        if (liveOppNames.length > 0) {
          this.rivalPartyNames = liveOppNames;
        }
      }
      if (!this.myPartyNames || this.myPartyNames.length === 0) {
        this._extractMyPartyNames();
      }

      const targets = COORDS.DISPATCH_DOUBLE; // ダブルバトル 4箇所固定

      for (const target of targets) {
        // すでに該当陣営が上限に達していればスキップ
        const currentList = target.role === 'rival' ? this.detectedDispatchedRival : this.detectedDispatchedMe;
        if (currentList.length >= maxSlots) continue;

        // すでにそのスロットで直前に確認済みの場合は高速スキップ
        const slotTracker = target.role === 'rival' ? this.dispatchedSlotsRival : this.dispatchedSlotsMe;
        if (slotTracker[target.index] && currentList.includes(slotTracker[target.index]) && currentList.length < 2) {
          // 先発特定中は別スロット（未検知の相方）の検知を最優先
          continue;
        }

        try {
          // ★ pamo3 完全準拠: 19.3度回転Deskew + 白文字2倍二値化
          const cropBase64 = this.cropForDispatchOcr(ctx, target);
          const ocrRes = await this.katakanaWorker.recognize(cropBase64);
          const rawText = (ocrRes.data.text || '').replace(/[\s\r\n]/g, '');
          if (!rawText || rawText.length < 2) continue;

          // 照合候補リスト (相手なら rivalPartyNames, 自分なら myPartyNames)
          let candidatePool = target.role === 'rival' ? this.rivalPartyNames : this.myPartyNames;
          if (!candidatePool || candidatePool.length === 0) {
            const masterList = (window.POKEMON_LIST && window.POKEMON_LIST.length) ? window.POKEMON_LIST : (window.masterPokemonList || []);
            candidatePool = masterList.map(p => typeof p === 'string' ? p : (p && (p.name || p.display) || '')).filter(Boolean);
          }

          let bestMatch = null;
          let minDistance = 999;

          for (const candidate of candidatePool) {
            if (!candidate) continue;
            // 1. そのままの文字列との比較
            const distFull = levenshteinDistance(rawText, candidate);
            // 2. ベース名（例: メガリザードンY -> リザードン, メガガブリアスZ -> ガブリアス）との比較
            const baseCand = this._normalizeBasePokeName(candidate);
            const distBase = baseCand ? levenshteinDistance(rawText, baseCand) : 999;
            const dist = Math.min(distFull, distBase);

            if (dist < minDistance) {
              minDistance = dist;
              bestMatch = candidate;
            }
          }

          // 相手側で手持ちと一致しなかった場合、マスタ全体から追加探索（ニックネームや認識漏れ対応）
          if ((!bestMatch || minDistance > 2) && target.role === 'rival' && window.POKEMON_LIST && window.POKEMON_LIST.length) {
            for (const p of window.POKEMON_LIST) {
              const pName = typeof p === 'string' ? p : (p && (p.name || p.display) || '');
              if (!pName) continue;
              const distFull = levenshteinDistance(rawText, pName);
              const baseCand = this._normalizeBasePokeName(pName);
              const distBase = baseCand ? levenshteinDistance(rawText, baseCand) : 999;
              const dist = Math.min(distFull, distBase);
              if (dist < minDistance) {
                minDistance = dist;
                bestMatch = pName;
              }
            }
          }

          // 2文字以内の差なら一致と判定 (pamo3準拠)
          if (bestMatch && minDistance <= 2) {
            slotTracker[target.index] = bestMatch;
            this._handleDispatchedPokemonFound(target.role, bestMatch);
          }
        } catch (e) {
          // スキップ
        }
      }
    }

    // 出撃ポケモンが検知されたときの反映
    _handleDispatchedPokemonFound(role, pokemonName) {
      const list = role === 'rival' ? this.detectedDispatchedRival : this.detectedDispatchedMe;
      const maxSlots = this.battleMode === 'single' ? 3 : 4;

      if (!list.includes(pokemonName) && list.length < maxSlots) {
        list.push(pokemonName);
        console.log(`[AutoMode] Dispatched Pokémon confirmed! [${role}] #${list.length}: ${pokemonName}`);

        // 1. 右下 VS バーの更新 (モンスターボールからポケモンアイコン・名前に変身！)
        this.updateVsBarSlot(role, list.length - 1, pokemonName);

        // 2. 左側記録フォームの選出スロットに即時反映（BO1専用）
        if (typeof window.setSelectionFromNames === 'function') {
          const roleKey = role === 'me' ? 'my' : 'opp';
          window.setSelectionFromNames(roleKey, list);
        }
      }
    }

    // --- 勝敗検知 & 自動保存 ---
    async _checkGameFinish(ctx) {
      if (!this.templates.winBall) return;

      const myBallCrop = this.cropToBase64(ctx, COORDS.WIN_BALL_ME);
      const rivalBallCrop = this.cropToBase64(ctx, COORDS.WIN_BALL_RIVAL);

      const [myScore, rivalScore] = await Promise.all([
        this.matchTemplate(myBallCrop, this.templates.winBall, { useAlphaMask: true }),
        this.matchTemplate(rivalBallCrop, this.templates.winBall, { useAlphaMask: true })
      ]);

      if (myScore > 0.45 || rivalScore > 0.45) {
        const isWin = myScore > rivalScore;
        console.log(`[AutoMode] GAME FINISHED! Winner: ${isWin ? 'WIN (Me)' : 'LOSE (Rival)'} (my=${myScore}, rival=${rivalScore})`);
        this.phase = 'END_GAME';
        this.updateStatusBadge(`試合終了: ${isWin ? '🎉 勝利' : '破れたり...'}`);

        await this._handleGameFinished(isWin);
      }
    }

    async _handleGameFinished(isWin) {
      console.log(`[AutoMode] Handling game finish: ${isWin ? 'WIN' : 'LOSE'}`);

      // 0. 保存前に相手パーティがもし未入力なら、出撃検知した相手ポケモン等で自動補完！
      const oppInputs = document.querySelectorAll('#opp-party-slots input[type=text]');
      if (oppInputs) {
        const currentOppVals = Array.from(oppInputs).map(inp => inp.value.trim()).filter(Boolean);
        if (currentOppVals.length === 0) {
          const fallbackPool = this.detectedDispatchedRival.length > 0 ? this.detectedDispatchedRival : this.rivalPartyNames;
          if (fallbackPool.length > 0) {
            console.log('[AutoMode] Auto-filling empty opp party before saving record:', fallbackPool);
            fallbackPool.forEach((pName, idx) => {
              if (idx < 6 && oppInputs[idx] && pName) {
                oppInputs[idx].value = pName;
                oppInputs[idx].dispatchEvent(new Event('input', { bubbles: true }));
                oppInputs[idx].dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof window.updateSlotIcon === 'function') {
                  window.updateSlotIcon(oppInputs[idx], pName);
                }
              }
            });
            if (typeof window.rebuildOppSelectionDropdowns === 'function') {
              window.rebuildOppSelectionDropdowns();
            }
          }
        }
      }

      // 1. 左側フォームの勝敗ボタンをセット
      if (typeof window.setResult === 'function') {
        window.setResult(isWin ? 'win' : 'lose');
      } else {
        const winBtn = document.getElementById(isWin ? 'btn-win' : 'btn-lose');
        if (winBtn) winBtn.click();
      }

      // 2. 自動保存を実行
      setTimeout(() => {
        console.log('[AutoMode] Triggering battle log save via saveRecord()...');
        if (typeof window.saveRecord === 'function') {
          window.saveRecord();
        } else {
          const saveBtn = document.getElementById('record-save-btn');
          if (saveBtn) saveBtn.click();
        }

        // 3. 履歴画面へ自動遷移
        setTimeout(() => {
          console.log('[AutoMode] Switching to history view...');
          if (typeof window.showPage === 'function') {
            const histBtn = document.querySelector('nav button[onclick*="history"]') || document.querySelector('nav button:nth-child(4)');
            window.showPage('history', histBtn);
          }
          // 次の対戦に向けて待機状態へループ
          this.phase = 'WAITING_MATCHING';
          this.updateStatusBadge('記録保存完了: 次の対戦待ち');
        }, 1200);
      }, 800);
    }

    // --- UI 更新ヘルパー ---
    updateStatusBadge(text) {
      const el = document.getElementById('auto-mode-status-badge');
      if (el) el.textContent = text;
    }

    resetVsBar() {
      this.detectedDispatchedMe = [];
      this.detectedDispatchedRival = [];
      this.dispatchedSlotsMe = {};
      this.dispatchedSlotsRival = {};
      for (let i = 0; i < 4; i++) {
        this.updateVsBarSlot('me', i, null);
        this.updateVsBarSlot('rival', i, null);
      }
    }

    updateVsBarSlot(role, slotIndex, pokemonName) {
      const slotId = `vs-slot-${role}-${slotIndex}`;
      const slotEl = document.getElementById(slotId);
      if (!slotEl) return;

      if (!pokemonName) {
        // 初期状態: モンスターボール表示 (52pxに大型化)
        slotEl.innerHTML = `<img src="assets/templates/monsterball.png" alt="ball" style="width:52px;height:52px;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.6))">`;
      } else {
        // ポケモン特定後: ポケモンスプライトアイコン + 名前アニメーション
        let spriteHtml = '';
        if (typeof window.getPokeSpriteHTMLByDisplay === 'function') {
          spriteHtml = window.getPokeSpriteHTMLByDisplay(pokemonName);
        }
        if (!spriteHtml) {
          spriteHtml = `<div style="font-size:24px;line-height:1">⚡</div>`;
        }
        slotEl.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;animation:popIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)">
            <div style="transform:scale(1.55);transform-origin:center;margin:6px 0;filter:drop-shadow(0 3px 8px rgba(0,0,0,0.8))">
              ${spriteHtml}
            </div>
            <span style="font-size:11.5px;font-weight:800;color:#fff;white-space:nowrap;margin-top:4px;text-shadow:0 1px 4px #000;max-width:82px;overflow:hidden;text-overflow:ellipsis">
              ${pokemonName}
            </span>
          </div>
        `;
      }
    }
  }

  // グローバル公開
  window.AutoModeController = AutoModeController;
  window.autoModeController = new AutoModeController();

})(window);
