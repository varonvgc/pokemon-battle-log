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
    // 様子を見る (ターゲット選択画面) のポケモン名領域 (出撃見逃しリカバリー用)
    TARGET_SELECT_DOUBLE: [
      { role: 'rival', index: 0, x: 650,  y: 300, w: 260, h: 55, isHorizontal: true }, // 相手1 (左上パネル: コノヨザル等)
      { role: 'rival', index: 1, x: 1150, y: 300, w: 260, h: 55, isHorizontal: true }, // 相手2 (右上パネル: イッカネズミ等)
      { role: 'me',    index: 0, x: 650,  y: 660, w: 260, h: 55, isHorizontal: true }, // 自分1 (左下パネル: フラエッテ等)
      { role: 'me',    index: 1, x: 1150, y: 660, w: 260, h: 55, isHorizontal: true }  // 自分2 (右下パネル: イダイトウ等)
    ],
    // 対戦中 (通常コマンド画面) のHPバー上のポケモン名領域 (pamo3 原典完全準拠ネイティブ座標: 19.3度シアー変形適用)
    BATTLE_HP_DOUBLE: [
      { role: 'rival', index: 0, x: 1196.7, y: 50,  w: 220, h: 46 }, // 相手先発/スロット1 (コノヨザル等)
      { role: 'rival', index: 1, x: 1599.8, y: 50,  w: 220, h: 46 }, // 相手スロット2 (イッカネズミ等)
      { role: 'me',    index: 0, x: 154.9,  y: 933, w: 220, h: 46 }, // 自分先発/スロット1 (フラエッテ等)
      { role: 'me',    index: 1, x: 554.6,  y: 933, w: 220, h: 46 }  // 自分スロット2 (イダイトウ等)
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
      this._hasScrolledForOpponentParty = false;
      this.isWorkersReady = false;
      this.isInitializingWorkers = false;

      // 自動録画用の状態
      this.isAutoRecordingEnabled = false;
      this.mediaRecorder = null;
      this.recordedChunks = [];
      this.isRecording = false;
      this.cancelCurrentRecording = false;
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

    _getBasePath() {
      if (typeof window !== 'undefined' && window.location.pathname.includes('/test/')) {
        return '../';
      }
      return '';
    }

    async _initWorkers() {
      const base = this._getBasePath();
      // 1. OpenCV テンプレートマッチングワーカー
      try {
        this.pawmiWorker = new Worker(`${base}scripts/pawmi_worker.js`);
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
        matchingBall: `${base}assets/templates/matching_phase_ball.png`,
        winBall:      `${base}assets/templates/win_ball.png`,
        vsLogo:       `${base}assets/templates/vs_v.png`
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
      const base = this._getBasePath();
      if (typeof Tesseract === 'undefined') {
        const script = document.createElement('script');
        script.src = `${base}scripts/tesseract/tesseract.min.js`;
        document.head.appendChild(script);
        await new Promise(r => script.onload = r);
      }
      try {
        const TESSERACT_OPTS = {
          workerPath: `${base}scripts/tesseract/worker.min.js`,
          corePath: `${base}scripts/tesseract/tesseract-core-simd-lstm.wasm.js`,
          langPath: `${base}scripts/tesseract/lang-data`
        };

        // カタカナ特化ワーカー (出撃ポケモン名用)
        this.katakanaWorker = await Tesseract.createWorker('jpn', TESSERACT_OPTS);
        const katakanaWhitelist = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポァィゥェォッャュョヴヵヶー・';
        await this.katakanaWorker.setParameters({
          tessedit_char_whitelist: katakanaWhitelist,
          tessedit_pageseg_mode: '7' // 単一行モードに戻す
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
        alert('ブラウザがカメラAPIに対応していません。\nセキュリティ上の制約により、ローカルサーバー(http://localhost)を立てるか、HTTPS環境でアクセスしてください。');
        return false;
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

    // ★ pamo3 原典完全準拠: 白黒二値化処理 (閾値150: d.yv(f, !0, 150))
    cropBinarizedToBase64(ctx, rect, threshold = 150) {
      const scale = (window.OCR_SETTINGS && window.OCR_SETTINGS.getScale) ? window.OCR_SETTINGS.getScale() : 1.0;
      const finalThreshold = threshold * scale;

      const { x, y, w, h } = rect;
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = Math.round(w);
      cropCanvas.height = Math.round(h);
      const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
      cropCtx.drawImage(ctx.canvas, x, y, w, h, 0, 0, cropCanvas.width, cropCanvas.height);
      const imgData = cropCtx.getImageData(0, 0, cropCanvas.width, cropCanvas.height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const v = gray >= finalThreshold ? 255 : 0;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
      }
      cropCtx.putImageData(imgData, 0, 0);
      return cropCanvas.toDataURL('image/png');
    }

    // 選出画面（見せ合い）の「選出完了」ボタン（鮮やかな黄緑色）の存在判定
    isSelectionButtonPresent(ctx) {
      if (!ctx || !ctx.canvas) return false;
      try {
        const imgData = ctx.getImageData(300, 925, 150, 40);
        const data = imgData.data;
        let greenCount = 0;
        for (let i = 0; i < data.length; i += 16) { // 4ピクセル毎に間引きサンプリング
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // 選出完了ボタン特有の鮮やかな黄緑色 (G > 170, R > 70, B < 90)
          if (g > 170 && r > 70 && b < 90) {
            greenCount++;
            if (greenCount >= 20) return true;
          }
        }
      } catch (e) {
        // cross-origin などによる例外防止
      }
      return false;
    }

    // pamo3 完全準拠: 出撃ネームプレート用前処理 (水平シアー変形 + 2x拡大 + 閾値175二値化)
    cropForDispatchOcr(ctx, rect) {
      const { x, y, w, h } = rect;

      // 1. 原寸切り出し
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = Math.round(w);
      srcCanvas.height = Math.round(h);
      const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
      srcCtx.drawImage(ctx.canvas, x, y, w, h, 0, 0, w, h);

      // 2. 水平軸を維持したまま文字のイタリック傾きを正立させるシアー変形 (tan(19.3°) ≈ 0.3502)
      // さらに、Tesseractの認識精度を上げるため上下左右にパディング（余白）を追加
      const skew = Math.tan(19.3 * Math.PI / 180);
      const padX = 20; // 左右の余白
      const padY = 20; // 上下の余白
      
      const ocrCanvas = document.createElement('canvas');
      ocrCanvas.width = Math.round(w * 2 + h * 2 * skew) + padX * 2;
      ocrCanvas.height = Math.round(h * 2) + padY * 2;
      const ocrCtx = ocrCanvas.getContext('2d', { willReadFrequently: true });

      ocrCtx.fillStyle = rect.isHorizontal ? '#FFFFFF' : '#000000';
      ocrCtx.fillRect(0, 0, ocrCanvas.width, ocrCanvas.height);

      if (rect.isHorizontal) {
        // 水平文字 (様子を見る画面のパネル等) はシアー変形不要
        ocrCtx.drawImage(srcCanvas, padX, padY, w * 2, h * 2);
      } else {
        ocrCtx.save();
        ocrCtx.transform(1, 0, skew, 1, padX, padY);
        ocrCtx.drawImage(srcCanvas, 0, 0, w * 2, h * 2);
        ocrCtx.restore();
      }

      // 3. 二値化処理 (文字=黒 0, 背景=白 255)
      const scale = (window.OCR_SETTINGS && window.OCR_SETTINGS.getScale) ? window.OCR_SETTINGS.getScale() : 1.0;
      const imgData = ocrCtx.getImageData(0, 0, ocrCanvas.width, ocrCanvas.height);
      const d = imgData.data;

      if (rect.isHorizontal) {
        // 様子を見る画面 (ターゲット選択パネル):
        // 選択状態による黄緑ハイライト（明るい背景に青文字）や、紫パネル（低輝度白文字）に対応するため
        // 大津の二値化 (Otsu) + 背景明暗極性判定を適用して確実に文字を抽出
        const hist = new Int32Array(256);
        const grays = new Uint8Array(ocrCanvas.width * ocrCanvas.height);
        let sum = 0;
        let pIdx = 0;
        for (let i = 0; i < d.length; i += 4) {
          const br = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
          grays[pIdx++] = br;
          hist[br]++;
          sum += br;
        }

        const total = grays.length;
        let sumB = 0;
        let wB = 0;
        let maxVar = 0;
        let autoThresh = 128;
        for (let t = 0; t < 256; t++) {
          wB += hist[t];
          if (wB === 0) continue;
          const wF = total - wB;
          if (wF === 0) break;
          sumB += t * hist[t];
          const mB = sumB / wB;
          const mF = (sum - sumB) / wF;
          const v = wB * wF * (mB - mF) * (mB - mF);
          if (v > maxVar) {
            maxVar = v;
            autoThresh = t;
          }
        }

        // 外周ピクセルから背景が明るいか暗いかを判定
        let borderSum = 0;
        let borderCount = 0;
        const cw = ocrCanvas.width;
        const ch = ocrCanvas.height;
        for (let x = 0; x < cw; x++) {
          borderSum += grays[x] + grays[(ch - 1) * cw + x];
          borderCount += 2;
        }
        for (let y = 1; y < ch - 1; y++) {
          borderSum += grays[y * cw] + grays[y * cw + (cw - 1)];
          borderCount += 2;
        }
        const isLightBg = (borderSum / borderCount) > autoThresh;

        pIdx = 0;
        for (let i = 0; i < d.length; i += 4) {
          const isBright = grays[pIdx++] >= autoThresh;
          const isText = isLightBg ? !isBright : isBright;
          const val = isText ? 0 : 255;
          d[i] = val;
          d[i + 1] = val;
          d[i + 2] = val;
          d[i + 3] = 255;
        }
      } else {
        // 出撃ネームプレート (BATTLE_HP): 濁点などの消失を防ぐため閾値を下げる (145)
        const threshold = 145 * scale;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          const bright = 0.299 * r + 0.587 * g + 0.114 * b;
          const isText = (bright >= threshold);
          const val = isText ? 0 : 255;
          d[i] = val;
          d[i + 1] = val;
          d[i + 2] = val;
          d[i + 3] = 255;
        }

        // モルフォロジー演算 (膨張処理 / Dilation):
        // 濁点・半濁点の消失や線の途切れ・かすれを修復するため黒文字を1px太らせる
        const cw = ocrCanvas.width;
        const ch = ocrCanvas.height;
        const dilated = new Uint8ClampedArray(d);
        for (let y = 1; y < ch - 1; y++) {
          for (let x = 1; x < cw - 1; x++) {
            const idx = (y * cw + x) * 4;
            if (d[idx] === 255) {
              if (
                d[((y - 1) * cw + x) * 4] === 0 ||
                d[((y + 1) * cw + x) * 4] === 0 ||
                d[(y * cw + (x - 1)) * 4] === 0 ||
                d[(y * cw + (x + 1)) * 4] === 0
              ) {
                dilated[idx] = 0;
                dilated[idx + 1] = 0;
                dilated[idx + 2] = 0;
              }
            }
          }
        }
        for (let i = 0; i < d.length; i += 4) {
          d[i] = dilated[i];
          d[i + 1] = dilated[i + 1];
          d[i + 2] = dilated[i + 2];
        }
      }
      ocrCtx.putImageData(imgData, 0, 0);

      // デバッグ・テスト環境でのリアルタイム表示用に保持
      if (rect && rect.role) {
        window._lastOcrCanvas = window._lastOcrCanvas || {};
        window._lastOcrCanvas[`${rect.role}_${rect.index}`] = ocrCanvas;
      }

      return ocrCanvas.toDataURL('image/png');
    }

    // --- 自動録画制御 ---
    _updateRecordingIndicator(isRecording) {
      const badge = document.getElementById('vs-recording-badge');
      if (badge) {
        badge.style.display = isRecording ? 'inline-flex' : 'none';
      }
      const dot = document.getElementById('auto-record-status-dot');
      if (dot) {
        if (isRecording) {
          dot.style.display = 'block';
          dot.style.animation = 'recBlink 1s infinite alternate';
        } else {
          const isAutoRecord = typeof localStorage !== 'undefined' && localStorage.getItem('autoModeAutoRecord') === 'true';
          dot.style.display = isAutoRecord ? 'block' : 'none';
          dot.style.animation = 'none';
        }
      }
    }

    setAutoRecordEnabled(isEnabled) {
      this.isAutoRecordingEnabled = isEnabled;
      console.log(`[AutoRecord] Auto record enabled: ${isEnabled}`);
      if (!isEnabled && (this.isRecording || this.mediaRecorder)) {
        console.log('[AutoRecord] Canceled recording by user toggle.');
        this._cancelAndDiscardRecording();
      }
    }

    _cancelAndDiscardRecording() {
      if (this.mediaRecorder) {
        this.cancelCurrentRecording = true;
        this.isRecording = false;
        this._updateRecordingIndicator(false);
        try {
          if (this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
          }
        } catch (e) {
          console.warn('[AutoRecord] Error stopping mediaRecorder on cancel:', e);
        }
        this.recordedChunks = [];
        this.mediaRecorder = null;
        this._recordingStopPromise = null;
      } else {
        this.isRecording = false;
        this._updateRecordingIndicator(false);
      }
    }

    _startRecording() {
      if (!this.isAutoRecordingEnabled || this.isRecording || !this.stream) return;
      try {
        this.recordedChunks = [];
        this.cancelCurrentRecording = false;
        const options = { mimeType: 'video/webm; codecs=vp8,opus' };
        let mime = 'video/webm';
        if (MediaRecorder.isTypeSupported(options.mimeType)) {
          mime = options.mimeType;
        } else if (MediaRecorder.isTypeSupported('video/webm; codecs=vp9')) {
          mime = 'video/webm; codecs=vp9';
        }
        
        this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: mime });
        this.mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            this.recordedChunks.push(e.data);
          }
        };

        this._recordingStopPromise = new Promise((resolve) => {
          this.mediaRecorder.onstop = async () => {
            this.isRecording = false;
            this._updateRecordingIndicator(false);
            if (this.cancelCurrentRecording) {
              console.log('[AutoRecord] Data discarded due to cancellation/reset.');
              this.recordedChunks = [];
              this.mediaRecorder = null;
              resolve(null);
              return;
            }
            
            console.log('[AutoRecord] Recording stopped, converting to file...');
            const finalMime = (this.mediaRecorder && this.mediaRecorder.mimeType) || 'video/webm';
            const blob = new Blob(this.recordedChunks, { type: finalMime });
            this.recordedChunks = [];
            this.mediaRecorder = null;
            
            const filename = `autorec_${Date.now()}.webm`;
            const file = new File([blob], filename, { type: finalMime });
            
            if (typeof window.attachVideoFileAsync === 'function') {
              console.log('[AutoRecord] Attaching video file...');
              await window.attachVideoFileAsync(file);
            }
            resolve(file);
          };
        });

        this.mediaRecorder.start(1000);
        this.isRecording = true;
        this._updateRecordingIndicator(true);
        console.log('[AutoRecord] Started recording.');
      } catch (err) {
        console.error('[AutoRecord] Failed to start MediaRecorder:', err);
        this.isRecording = false;
        this.mediaRecorder = null;
        this._updateRecordingIndicator(false);
      }
    }

    async _stopRecordingAsync() {
      if (!this.isRecording || !this.mediaRecorder) {
        this._updateRecordingIndicator(false);
        return;
      }
      
      try {
        if (this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.stop();
        }
      } catch(e) {
        console.warn('[AutoRecord] Failed to stop recorder:', e);
        this.isRecording = false;
        this._updateRecordingIndicator(false);
      }

      if (this._recordingStopPromise) {
        await this._recordingStopPromise;
        this._recordingStopPromise = null;
      }
    }

    // --- オートモードの開始・停止 ---
    async startAutoMode() {
      this.isAutoRunning = true;
      this.phase = 'WAITING_MATCHING';
      this.updateStatusBadge('ワーカー初期化中...');
      // 初期状態を読み込む
      if (typeof localStorage !== 'undefined') {
        this.isAutoRecordingEnabled = localStorage.getItem('autoModeAutoRecord') === 'true';
      }
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
      this._cancelAndDiscardRecording();
      if (this.loopTimer) {
        clearTimeout(this.loopTimer);
        this.loopTimer = null;
      }
    }

    // --- 通信切断・スタック時の手動フェーズ強制リセット (案B仕様) ---
    forceResetPhase() {
      console.log(`[AutoMode] Force resetting phase from ${this.phase} to WAITING_MATCHING`);
      this._cancelAndDiscardRecording();
      this.phase = 'WAITING_MATCHING';
      this.waitingStartTimestamp = null;
      this.updateStatusBadge('自動モード稼働中 (手動リセット完了/待機中)');
      this.resetVsBar();
      // 入力フォーム側の相手パーティや選出は保持し、ユーザーが手動で勝敗選択および保存を行えるようにする
      if (typeof window.showRecordToast === 'function') {
        window.showRecordToast('🔄 オートモードを対戦待ちへリセットしました。現在の記録は手動で結果選択・保存できます。');
      } else if (typeof window.showToast === 'function') {
        window.showToast('対戦待ち状態へリセットしました');
      } else {
        alert('オートモードを対戦待ちへリセットしました。\n現在の試合記録は手動で結果選択・保存を行ってください。');
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
        // pamo3 リアクティブ駆動方式: 前のフレーム解析完了後、微小ウェイト(50ms)で最速レスポンス
        this.loopTimer = setTimeout(loop, 50);
      };
      loop();
    }

    async _processCurrentPhase() {
      const ctx = this.captureFrame();
      if (!ctx) return;

      switch (this.phase) {
        // 1. 見せ合い画面待ち
        case 'WAITING_MATCHING': {
          // ★ pamo3 原典完全準拠: 試合終了後のクールダウンガード (試合終了後8秒間は新対戦検知をスキップ)
          const timeSinceFinish = Date.now() - (this.lastGameFinishTimestamp || 0);
          if (timeSinceFinish < 8000) {
            return;
          }

          const ballCrop = this.cropToBase64(ctx, COORDS.MATCHING_BALL);
          const score = await this.matchTemplate(ballCrop, this.templates.matchingBall, { useAlphaMask: true });

          // ★ 誤検知防止: 閾値を0.85に引き上げ、2連続フレーム一致を要求
          if (score >= 0.85) {
            this.matchingEnterCount = (this.matchingEnterCount || 0) + 1;
            if (this.matchingEnterCount >= 2) {
              console.log(`[AutoMode] MATCHING PHASE DETECTED! score=${score.toFixed(3)} >= 0.85`);
              this.phase = 'MATCHING';
              this.matchingEnterCount = 0;
              this.matchingExitCount = 0;
              this._startRecording();
              // pamo3 原典完全再現シーケンスを _handleMatchingPhase 内で実行
              await this._handleMatchingPhase(ctx);
            }
          } else {
            this.matchingEnterCount = 0;
          }
          break;
        }

        // 見せ合い画面継続中 (ボールマークが消えるまで留まる)
        case 'MATCHING': {
          this._syncManualSelections();
          const ballCrop = this.cropToBase64(ctx, COORDS.MATCHING_BALL);
          const score = await this.matchTemplate(ballCrop, this.templates.matchingBall, { useAlphaMask: true });

          // ボールマーク消灯 (score < 0.40)
          if (score < 0.40) {
            this.matchingExitCount = (this.matchingExitCount || 0) + 1;
            // 連続3フレーム (約1秒) 連続で消灯した場合のみ見せ合い終了と判定
            if (this.matchingExitCount >= 3) {
              console.log('[AutoMode] MATCHING FINISHED! Transition to WAITING_GAME_START');
              this.waitingStartTimestamp = Date.now();
              this.phase = 'WAITING_GAME_START';
              this.updateStatusBadge('対戦開始待ち (VS画面待機中...)');
            }
          } else {
            this.matchingExitCount = 0;
          }
          break;
        }

        // 2. 対戦開始 (VS画面) 待ち
        case 'WAITING_GAME_START': {
          this._syncManualSelections();
          const vsCrop = this.cropToBase64(ctx, COORDS.VS_SCREEN);
          const vsScore = await this.matchTemplate(vsCrop, this.templates.vsLogo, { useAlphaMask: true });
          const elapsed = Date.now() - (this.waitingStartTimestamp || Date.now());

          // ★ 出撃見逃し防止: VSロゴ検知 (vsScore > 0.40) または 暗転から8秒経過で直ちに試合中へ！
          // (VSロゴ演出は1〜2秒で終了し、直後の暗転〜10秒後から先発出撃演出が始まるため、40秒待機では先発を100%見失う)
          if (vsScore > 0.40 || elapsed > 8000) {
            console.log(`[AutoMode] GAME START DETECTED! (vsScore=${vsScore.toFixed(3)}, elapsed=${elapsed}ms)`);
            this.phase = 'IN_GAME';
            this.inGameStartTimestamp = Date.now();
            this.winBallMeCount = 0;
            this.winBallRivalCount = 0;
            this.updateStatusBadge('試合中: 出撃ポケモン検知中...');
            // 相手パーティ記録時にまだスクロールしていない場合のみ安全にスクロール
            if (!this._hasScrolledForOpponentParty) {
              this._hasScrolledForOpponentParty = true;
              this._scrollToOppTrainerSection();
            }
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

    // --- 見せ合い画面突入時の処理 (pamo3 原典完全再現シーケンス) ---
    async _handleMatchingPhase(initialCtx) {
      // 0. 新しい対戦開始時に選出管理・VSバーを初期化し、手入力リスナーを登録
      this.resetVsBar();
      this._setupManualInputListeners();
      this._setupSelectionClickListeners();

      // 1. 左側フォームのセットアップ
      this._setupRecordFormForNewBattle();

      // 2. ダブルバトル専用 (選出4匹) に固定
      this.battleMode = 'double';
      console.log('[AutoMode] Battle mode fixed to Double Battle (4 slots)');
      this.rivalPartyNames = [];

      // ★ pamo3 原典完全再現 ①: 暗転・フェードイン完了待ち (3.0秒 / 3000ms: B.jZ = 3e6 us)
      this.updateStatusBadge('見せ合い画面検知: 画面安定待ち (3秒ウェイト)...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // ★ pamo3 原典完全再現 ③: 最新安定フレームから相手トレーナー名OCR (二値化閾値 150)
      const trainerCtx = this.captureFrame() || initialCtx;
      let finalTrainerName = '';
      if (this.tesseractWorker) {
        try {
          // pamo3 原典 Line 58-61 準拠: 二値化閾値 150 で前処理
          const nameCropB64 = this.cropBinarizedToBase64(trainerCtx, COORDS.TRAINER_NAME, 150);
          const nameRes = await this.tesseractWorker.recognize(nameCropB64);
          const directText = (nameRes && nameRes.data && nameRes.data.text || '').replace(/[\r\n\t]/g, ' ').trim();
          if (directText) {
            finalTrainerName = directText;
            console.log(`[AutoMode:pamo3-OCR] Opponent Trainer Name (Binarized 150): "${finalTrainerName}"`);
          }
        } catch (e) {
          console.warn('[AutoMode] Direct trainer OCR error:', e);
        }
      }

      if (finalTrainerName) {
        this.oppTrainerName = finalTrainerName;
        const oppTrainerInput = document.getElementById('rec-opp-trainer');
        if (oppTrainerInput) {
          oppTrainerInput.value = finalTrainerName;
          oppTrainerInput.dispatchEvent(new Event('input', { bubbles: true }));
          oppTrainerInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      // ★ pamo3 原典完全再現 ①: 相手6匹取得前の安定待機 (1.0秒 / 1000ms: B.ce = 1e6 us)
      this.updateStatusBadge('見せ合い画面検知: 相手6匹認識中 (1秒ウェイト)...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 完全に明るく安定した最新フレームを再キャプチャして相手6匹認識へ！
      const partyCtx = this.captureFrame() || trainerCtx;

      try {
        // ★ 相手の6匹がすでに取得完了している場合は、重い認識処理を完全にスキップする！
        let shouldRecognize = true;
        if (this._hasScrolledForOpponentParty && this.rivalPartyNames && this.rivalPartyNames.length > 0) {
          shouldRecognize = false;
        }

        if (shouldRecognize && window.recognitionEngine) {
          if (!window.recognitionEngine.isLoaded && typeof window.recognitionEngine.loadDictionaries === 'function') {
            await window.recognitionEngine.loadDictionaries();
          }

          // 自分のパーティ一覧
          let myTeamList = this.myPartyNames || [];

          // 画面全体 (1920x1080) を認識エンジンへ渡し、相手6匹を OpenCV TM_CCOEFF_NORMED で高精度特定！
          const res = await window.recognitionEngine.recognize(partyCtx.canvas, myTeamList, 'BEFORE', true);
          console.log('[AutoMode] Recognition Engine Result:', res);

          // 相手パーティ 6 匹のセット
          if (res && res.opponent && res.opponent.length) {
            console.log('[AutoMode] Detected Opponent Party:', res.opponent);
            this.rivalPartyNames = []; // ★毎フレーム初期化して無限増殖を完全に防ぐ
            const oppInputs = document.querySelectorAll('#opp-party-slots input[type=text]');
            res.opponent.forEach((pName, idx) => {
              if (idx < 6 && pName && pName !== '???') {
                this.rivalPartyNames.push(pName);
                if (oppInputs && oppInputs[idx]) {
                  oppInputs[idx].value = pName;
                  oppInputs[idx].dispatchEvent(new Event('input', { bubbles: true }));
                  oppInputs[idx].dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof window.updateSlotIcon === 'function') {
                    window.updateSlotIcon(oppInputs[idx], pName);
                  }
                }
              }
            });
            if (typeof window.rebuildOppSelectionDropdowns === 'function') {
              window.rebuildOppSelectionDropdowns();
            }
            // ★ 予測変換（サジェスト）ドロップダウンの強制非表示とフォーカス解除
            document.querySelectorAll('.autocomplete-list').forEach(l => {
              l.classList.remove('open');
              l.innerHTML = '';
            });
            if (document.activeElement && typeof document.activeElement.blur === 'function') {
              document.activeElement.blur();
            }

            // ★ 相手パーティの記録完了直後に自動スクロールを実行！ (1試合につき1度だけ確実に実行)
            if (!this._hasScrolledForOpponentParty) {
              this._hasScrolledForOpponentParty = true;
              console.log('[AutoMode] Opponent party registered! Triggering auto-scroll to opponent section...');
              this._scrollToOppTrainerSection();
            }
          } else {
            console.warn('[AutoMode] Recognition engine returned empty or invalid opponent:', res);
          }
        }
      } catch (e) {
        console.error('[AutoMode] Recognition engine error:', e);
      }

      // 自分の登録パーティ名一覧を確実に取得
      this._extractMyPartyNames();

      // 見せ合い画面中は MATCHING フェーズを維持 (画面のボールマークが消えるまで留まる)
      if (this.rivalPartyNames && this.rivalPartyNames.length > 0) {
        this.updateStatusBadge(`見せ合い: 相手6匹取得完了 (${this.rivalPartyNames.slice(0, 3).join('/')}...)`);
      } else {
        this.updateStatusBadge('見せ合い画面: 相手情報取得完了');
      }
    }

    // 記録画面の自動初期化 (チャンピオンズ / ランクマ / BO1 / 一番上のパーティ)
    _setupRecordFormForNewBattle() {
      this._hasScrolledForOpponentParty = false;

      // 1. 記録タブへ切り替え
      if (typeof window.showPage === 'function') {
        const recordBtn = document.querySelector('nav button[onclick*="record"]') || document.querySelector('nav button:nth-child(3)');
        window.showPage('record', recordBtn);
      }

      // 2. 🏆 チャンピオンズ モードに切り替え
      if (typeof window.setRecordMode === 'function') {
        window.setRecordMode('champions');
      }

      // 3. 形式: 直前の記録の形式、なければランクマ / BO1
      let matchType = 'ランクマ';
      try {
        const savedType = localStorage.getItem('pkm_last_match_type');
        if (savedType && ['ランクマ', '公式大会', '非公式', 'フレ戦', 'showdown'].includes(savedType)) {
          matchType = savedType;
        }
      } catch (e) {}

      if (typeof window.setRecordMatchType === 'function') {
        window.setRecordMatchType(matchType);
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

      console.log(`[AutoMode] Record form fully auto-configured for Champions (${matchType} BO1)`);
    }

    // 自分のパーティのポケモン名一覧を取得
    _extractMyPartyNames(force = false) {
      // テスト環境、またはすでに外部(GT等)からパーティが設定されている場合は上書き保護
      if (!force && this.myPartyNames && this.myPartyNames.length > 0 && window.isTestRunner) {
        return;
      }
      const existingPool = (this.myPartyNames && this.myPartyNames.length > 0) ? [...this.myPartyNames] : [];
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
      // それでも取得できず、既存プールがあれば復元
      if (this.myPartyNames.length === 0 && existingPool.length > 0) {
        this.myPartyNames = existingPool;
      }
      console.log('[AutoMode] My party Pokémon pool:', this.myPartyNames);
    }

    // ポケモン名の正規化（フォルムに「メガ」または「ゲンシ」がある場合のみベース名を抽出）
    _normalizeBasePokeName(name) {
      if (!name) return '';
      const s = String(name).trim();
      if (s.includes('(') || s.includes('（')) {
        return s.split('(')[0].split('（')[0].trim();
      }
      return s;
    }

    // --- 試合中: 出撃ポケモンの検知 (ダブルバトル先発2匹ガード & 対戦中リカバリー pamo3完全準拠) ---
    async _detectDispatchedPokemons(ctx) {
      if (!this.katakanaWorker) return;

      // 手動選出があれば常に最新状態を取り込み
      this._syncManualSelections();



      const maxSlots = this.battleMode === 'single' ? 3 : 4;
      const meCount = this.detectedDispatchedMe.length;
      const rivalCount = this.detectedDispatchedRival.length;

      // 両陣営とも上限（ダブル4匹、シングル3匹）に達していればOCRを完全スキップ
      if (meCount >= maxSlots && rivalCount >= maxSlots) {
        return;
      }

      // OCRの実行間隔を最短150msに調整 (リアクティブ駆動と合わせて実効200〜250msで最速レスポンス)
      const now = Date.now();
      if (this.lastOcrTimestamp && (now - this.lastOcrTimestamp < 150)) {
        return;
      }
      this.lastOcrTimestamp = now;

      if (!this.dispatchedSlotsMe) this.dispatchedSlotsMe = {};
      if (!this.dispatchedSlotsRival) this.dispatchedSlotsRival = {};
      if (!this.slotConfidence) this.slotConfidence = {};

      // ユーザーが手入力修正した相手パーティ入力を同期
      const oppInputs = document.querySelectorAll('#opp-party-slots input[type=text]');
      if (oppInputs && oppInputs.length > 0) {
        const liveOppNames = Array.from(oppInputs)
          .map(inp => inp.value.trim())
          .filter(val => val && val !== '???');
        if (liveOppNames.length > 0) {
          this.rivalPartyNames = liveOppNames;
        }
      }
      if (!this.myPartyNames || this.myPartyNames.length === 0) {
        this._extractMyPartyNames();
      }

      // 対象スロットの動的選定 (最大匹数に達した陣営はOCR対象から除外)
      // ★ 通常コマンド画面HPバー (シングルなら DISPATCH_SINGLE, ダブルなら BATTLE_HP_DOUBLE) に絞り込む
      let targets = [];
      const hpCoords = this.battleMode === 'single' ? COORDS.DISPATCH_SINGLE : COORDS.BATTLE_HP_DOUBLE;
      for (const t of hpCoords) {
        if (t.role === 'me' && meCount >= maxSlots) continue;
        if (t.role === 'rival' && rivalCount >= maxSlots) continue;
        targets.push(t);
      }

      for (const target of targets) {
        // すでに該当陣営が上限枠に達していればスキップ
        const currentCount = target.role === 'rival' ? this.detectedDispatchedRival.length : this.detectedDispatchedMe.length;
        if (currentCount >= maxSlots) continue;

        const slotTracker = target.role === 'rival' ? this.dispatchedSlotsRival : this.dispatchedSlotsMe;
        const confKey = `${target.role}_${target.index}`;

        try {
          // ★ pamo3 完全準拠: 19.3度回転Deskew + 白文字2倍二値化 (閾値180)
          const cropBase64 = this.cropForDispatchOcr(ctx, target);

          // ★ pamo3 原典完全準拠: 画像キャッシュによるスキップは完全撤廃！
          // 毎周素直にOCRを実行し、検知されたポケモンがすでに選出記録済みかどうかで判定する。
          const ocrRes = await this.katakanaWorker.recognize(cropBase64);
          const rawText = (ocrRes.data.text || '').replace(/[\s\r\n]/g, '');
          if (!rawText || rawText.length < 2) {
            if (this.slotConfidence[confKey]) {
              this.slotConfidence[confKey].count = 0;
            }
            continue;
          }

          // 照合候補リスト (相手なら rivalPartyNames, 自分なら myPartyNames)
          let candidatePool = target.role === 'rival' ? this.rivalPartyNames : this.myPartyNames;
          const hasRegisteredPool = Array.isArray(candidatePool) && candidatePool.length > 0;
          if (!hasRegisteredPool) {
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

          // 手持ち・登録パーティが未登録、またはプールが6匹揃っていない不完全な状態の場合で、
          // プール内に該当するポケモンがいなければ (minDistance > 2)、マスタ全体から追加探索する
          const isPoolIncomplete = Array.isArray(candidatePool) && candidatePool.length < 6;
          if ((!hasRegisteredPool || isPoolIncomplete) && (!bestMatch || minDistance > 2) && window.POKEMON_LIST && window.POKEMON_LIST.length) {
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

          // ★ pamo3 原典完全準拠の判定ロジック:
          // 1. 完全一致 (minDistance === 0): 即時確定！
          // 2. 文字数2文字以下: 完全一致のみ許可 (曖昧一致禁止)
          // 3. 文字数3文字以上: 距離2以内 (minDistance <= 2) で採用
          const matchedTargetName = bestMatch ? (this._normalizeBasePokeName(bestMatch) || bestMatch) : '';
          const nameLen = matchedTargetName.length;
          let isValid = false;

          if (bestMatch) {
            if (minDistance === 0) {
              isValid = true;
            } else if (nameLen >= 3 && minDistance <= 2) {
              isValid = true;
            }
          }

          if (typeof this.onOcrSlotResult === 'function') {
            this.onOcrSlotResult(target.role, target.index, rawText, bestMatch, minDistance, isValid);
          }

          // 出撃確定反映
          if (isValid && bestMatch) {
            // ★ 検知されたポケモンがすでに選出記録済みの場合は記録しない（スキップ）
            if (this._isAlreadyDispatched(target.role, bestMatch)) {
              continue;
            }

            // 未選出の新規ポケモン（3匹目や4匹目の交代・繰り出しを含む）:
            const currentConf = this.slotConfidence[confKey] || { pokemon: null, count: 0 };
            if (currentConf.pokemon === bestMatch) {
              currentConf.count += 1;
            } else {
              currentConf.pokemon = bestMatch;
              currentConf.count = 1;
            }
            this.slotConfidence[confKey] = currentConf;

            // ★ 高速確定: 登録パーティ候補からの照合の場合、距離1以内（完全一致または1文字ブレ）なら1発即時確定！
            // （交代で出た瞬間に倒された場合でも見逃さずキャッチ）
            const requiredHits = (minDistance <= 1) ? 1 : 2;
            if (currentConf.count >= requiredHits) {
              slotTracker[target.index] = bestMatch;
              this._handleDispatchedPokemonFound(target.role, bestMatch);
            }
          } else {
            // 一致しなかった（ノイズ）場合はカウンタをリセット
            if (this.slotConfidence[confKey]) {
              this.slotConfidence[confKey].count = 0;
            }
          }
        } catch (e) {
          // スキップ
        }
      }
    }

    // 既に出撃登録済みか判定（ベース名一致も含め二重登録を完全防止）
    _isAlreadyDispatched(role, pokemonName) {
      const list = role === 'rival' ? this.detectedDispatchedRival : this.detectedDispatchedMe;
      const baseName = this._normalizeBasePokeName(pokemonName);
      return list.some(existing => {
        const existBase = this._normalizeBasePokeName(existing);
        return existBase === baseName || existing === pokemonName;
      });
    }

    // 出撃ポケモンが検知されたときの反映
    _handleDispatchedPokemonFound(role, pokemonName) {
      // 最新の手動選出状態を取り込み
      this._syncManualSelections();

      const list = role === 'rival' ? this.detectedDispatchedRival : this.detectedDispatchedMe;
      const maxSlots = this.battleMode === 'single' ? 3 : 4;

      // 重複チェック: 一度選出に出たポケモンは絶対に再登録しない
      if (!this._isAlreadyDispatched(role, pokemonName) && list.length < maxSlots) {
        list.push(pokemonName);
        console.log(`[AutoMode] Dispatched Pokémon confirmed! [${role}] #${list.length}: ${pokemonName}`);

        // 1. 右下 VS バーの更新 (モンスターボールからポケモンアイコン・名前に変身！)
        this.updateVsBarSlot(role, list.length - 1, pokemonName);

        // 2. 左側記録フォームの選出スロットに即時反映（BO1専用）
        if (typeof window.setSelectionFromNames === 'function') {
          const roleKey = role === 'me' ? 'my' : 'opp';
          window.setSelectionFromNames(roleKey, list);
        }

        // 3. ★ 初回出撃検知時、確実に左側フォームを相手トレーナー名〜メモ欄へスクロール
        if (this.detectedDispatchedMe.length + this.detectedDispatchedRival.length === 1) {
          this._scrollToOppTrainerSection();
        }
      }
    }

    // --- 勝敗検知 & 自動保存 ---
    async _checkGameFinish(ctx) {
      if (!this.templates.winBall) return;

      // ★ 試合途中終了の完全防止 ①: IN_GAME突入後15秒間は勝敗判定を一切行わない (技演出等の誤爆防止)
      const elapsedInGame = Date.now() - (this.inGameStartTimestamp || 0);
      if (elapsedInGame < 15000) {
        return;
      }

      const myBallCrop = this.cropToBase64(ctx, COORDS.WIN_BALL_ME);
      const rivalBallCrop = this.cropToBase64(ctx, COORDS.WIN_BALL_RIVAL);

      const [myScore, rivalScore] = await Promise.all([
        this.matchTemplate(myBallCrop, this.templates.winBall, { useAlphaMask: true }),
        this.matchTemplate(rivalBallCrop, this.templates.winBall, { useAlphaMask: true })
      ]);

      // ★ 試合途中終了の完全防止 ②: 閾値を0.60に厳格化 & 連続4フレーム（約1.2秒）の安定検知を要求
      const WIN_THRESHOLD = 0.60;
      const REQUIRED_CONSECUTIVE_FRAMES = 4;

      if (myScore >= WIN_THRESHOLD) {
        this.winBallMeCount = (this.winBallMeCount || 0) + 1;
      } else {
        this.winBallMeCount = 0;
      }

      if (rivalScore >= WIN_THRESHOLD) {
        this.winBallRivalCount = (this.winBallRivalCount || 0) + 1;
      } else {
        this.winBallRivalCount = 0;
      }

      if (this.winBallMeCount >= REQUIRED_CONSECUTIVE_FRAMES || this.winBallRivalCount >= REQUIRED_CONSECUTIVE_FRAMES) {
        const isWin = this.winBallMeCount > this.winBallRivalCount;
        console.log(`[AutoMode] GAME FINISHED! Winner: ${isWin ? 'WIN (Me)' : 'LOSE (Rival)'} (myHits=${this.winBallMeCount}, rivalHits=${this.winBallRivalCount})`);
        this.phase = 'END_GAME';
        this.updateStatusBadge(`試合終了: ${isWin ? '🎉 勝利' : '破れたり...'}`);

        await this._handleGameFinished(isWin);
      }
    }

    async _handleGameFinished(isWin) {
      console.log(`[AutoMode] Handling game finish: ${isWin ? 'WIN' : 'LOSE'}`);
      this.lastGameFinishTimestamp = Date.now();

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

      // 1. 左側フォームの勝敗ボタンをセット (ユーザーの手動選択があればそれを最優先！)
      const winBtn = document.getElementById('btn-win');
      const loseBtn = document.getElementById('btn-lose');
      const hasManualWin = winBtn && (winBtn.classList.contains('active') || winBtn.classList.contains('selected'));
      const hasManualLose = loseBtn && (loseBtn.classList.contains('active') || loseBtn.classList.contains('selected'));

      if (!hasManualWin && !hasManualLose) {
        if (typeof window.setResult === 'function') {
          window.setResult(isWin ? 'win' : 'lose');
        } else {
          const targetBtn = document.getElementById(isWin ? 'btn-win' : 'btn-lose');
          if (targetBtn) targetBtn.click();
        }
      } else {
        console.log('[AutoMode] User already manually selected result. Preserving manual result.');
      }

      // 2. 自動録画停止・添付を待機してから自動保存を実行
      setTimeout(async () => {
        if (this.isRecording) {
          this.updateStatusBadge('録画処理中 (添付中...)');
          await this._stopRecordingAsync();
        }
        
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
          // 次の対戦に向けて待機状態へループ (8秒クールダウンを付与)
          this.lastGameFinishTimestamp = Date.now();
          this.phase = 'WAITING_MATCHING';
          this.updateStatusBadge('記録保存完了: 次の対戦待ち (待機中)');
        }, 1200);
      }, 800);
    }

    // --- 手入力修正・手動選出の同期 & リスナー管理 ---

    // 画面上の現在の選出ポケモン名配列を取得（手動選出の最優先取得）
    _getLiveSelectedPokemonNames(role) {
      const isMe = role === 'me';
      const names = [];

      // 1. グローバル配列 (mySelectionOrder / oppSelectionOrder) から取得
      const orderArr = isMe ? window.mySelectionOrder : window.oppSelectionOrder;
      if (Array.isArray(orderArr) && orderArr.length > 0) {
        if (isMe) {
          const allParties = (window.autoModeBridge && window.autoModeBridge.getParties && window.autoModeBridge.getParties()) ||
                             window.parties ||
                             JSON.parse(localStorage.getItem('pkm_parties') || '[]');
          const selId = (window.autoModeBridge && window.autoModeBridge.getSelectedPartyId && window.autoModeBridge.getSelectedPartyId()) ||
                        window.selectedPartyId ||
                        (allParties[0] && allParties[0].id);
          const party = allParties.find(p => p.id === selId) || allParties[0];
          const myPokemon = party ? party.pokemon : [];
          orderArr.forEach(idx => {
            const pk = myPokemon[idx];
            const pName = typeof pk === 'string' ? pk : (pk && pk.name || '');
            if (pName && !names.includes(pName)) names.push(pName);
          });
        } else {
          const oppInputs = document.querySelectorAll('#opp-party-slots input[type=text]');
          orderArr.forEach(idx => {
            if (oppInputs[idx]) {
              const val = oppInputs[idx].value.trim();
              if (val && !names.includes(val)) names.push(val);
            }
          });
        }
      }

      // 2. DOM (.selection-poke-card.selected) からのフォールバック取得
      if (names.length === 0) {
        const containerId = isMe ? 'my-selection-slots' : 'opp-selection-slots';
        const container = document.getElementById(containerId);
        if (container) {
          const cards = container.querySelectorAll('.selection-poke-card.selected');
          const cardList = Array.from(cards).map(card => {
            const badge = card.querySelector('.selection-order-badge');
            const order = badge ? parseInt(badge.textContent.trim(), 10) : 99;
            const name = card.getAttribute('title') || '';
            return { order, name };
          }).filter(c => c.name && !isNaN(c.order));
          cardList.sort((a, b) => a.order - b.order);
          cardList.forEach(c => {
            if (!names.includes(c.name)) names.push(c.name);
          });
        }
      }

      return names;
    }

    // 手動選出（1〜4のバッジタップ）をオートモードの内部管理および下部VSバーへ即座に反映
    _syncManualSelections() {
      const manualMe = this._getLiveSelectedPokemonNames('me');
      const manualRival = this._getLiveSelectedPokemonNames('rival');

      // 1. 自分選出: 手動選出があれば手動選出を基底とし、自動検知ポケモンがあれば空き枠に追加
      if (manualMe.length > 0) {
        const mergedMe = [...manualMe];
        for (const p of this.detectedDispatchedMe) {
          if (!mergedMe.includes(p) && mergedMe.length < 4) {
            mergedMe.push(p);
          }
        }
        this.detectedDispatchedMe = mergedMe;
      }

      // 2. 相手選出: 手動選出があれば手動選出を基底とし、自動検知ポケモンがあれば空き枠に追加
      if (manualRival.length > 0) {
        const mergedRival = [...manualRival];
        for (const p of this.detectedDispatchedRival) {
          if (!mergedRival.includes(p) && mergedRival.length < 4) {
            mergedRival.push(p);
          }
        }
        this.detectedDispatchedRival = mergedRival;
      }

      // 3. 下部VSバーのスロット（0〜3）をリアルタイム更新
      for (let i = 0; i < 4; i++) {
        this.updateVsBarSlot('me', i, this.detectedDispatchedMe[i] || null);
        this.updateVsBarSlot('rival', i, this.detectedDispatchedRival[i] || null);
      }
    }

    // 見せ合い中の相手パーティ手入力修正イベントリスナー登録
    _setupManualInputListeners() {
      const oppSlotsContainer = document.getElementById('opp-party-slots');
      if (oppSlotsContainer && !this._hasOppSlotsListener) {
        this._hasOppSlotsListener = true;
        const handler = () => this._onOppPartyManualChange();
        oppSlotsContainer.addEventListener('input', handler);
        oppSlotsContainer.addEventListener('change', handler);
      }
    }

    // 相手パーティが手入力修正されたときの即時同期ハンドラ
    _onOppPartyManualChange() {
      const oppInputs = document.querySelectorAll('#opp-party-slots input[type=text]');
      if (oppInputs && oppInputs.length > 0) {
        const liveOppNames = Array.from(oppInputs).map(inp => inp.value.trim()).filter(Boolean);
        if (liveOppNames.length > 0) {
          this.rivalPartyNames = liveOppNames;
          console.log('[AutoMode] Live updated rivalPartyNames from manual input:', this.rivalPartyNames);
        }
      }
      // 相手選出グリッドの再描画（修正された名前とアイコンを表示）
      if (typeof window.renderSelectionSlots === 'function') {
        window.renderSelectionSlots('opp');
      }
      if (typeof window.rebuildOppSelectionDropdowns === 'function') {
        window.rebuildOppSelectionDropdowns();
      }
      this._syncManualSelections();
    }

    // 選出グリッドの手動クリックイベントリスナー登録
    _setupSelectionClickListeners() {
      const mySel = document.getElementById('my-selection-slots');
      if (mySel && !this._hasMySelListener) {
        this._hasMySelListener = true;
        mySel.addEventListener('click', () => {
          setTimeout(() => this._syncManualSelections(), 50);
        });
      }
      const oppSel = document.getElementById('opp-selection-slots');
      if (oppSel && !this._hasOppSelListener) {
        this._hasOppSelListener = true;
        oppSel.addEventListener('click', () => {
          setTimeout(() => this._syncManualSelections(), 50);
        });
      }
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
      this.slotImageCache = {};
      this.slotConfidence = {};
      this._hasScrolledForOpponentParty = false;
      this.winBallMeCount = 0;
      this.winBallRivalCount = 0;
      for (let i = 0; i < 4; i++) {
        this.updateVsBarSlot('me', i, null, true);
        this.updateVsBarSlot('rival', i, null, true);
      }
    }

    // 記録フォームを「自分の選出」エリアが見える位置へ自動スクロール
    // （相手パーティ記録後に呼び出され、選出入力がスムーズに行えるように中央に配置）
    _scrollToOppTrainerSection() {
      let attempts = 0;
      const maxAttempts = 15;

      const tryScroll = () => {
        attempts++;

        // 1. 「記録する」ページがアクティブか確認し、開いていなければ開く
        const recordPage = document.getElementById('page-record');
        if (!recordPage || !recordPage.classList.contains('active')) {
          if (typeof window.showPage === 'function') {
            const recordBtn = document.querySelector('nav button[onclick*="record"]') || document.querySelector('nav button:nth-child(3)');
            window.showPage('record', recordBtn);
          }
        }

        // ターゲットを「自分の選出」に変更する
        const bo1Area = document.getElementById('rec-area-bo1');
        const isBo3 = bo1Area && window.getComputedStyle(bo1Area).display === 'none';
        
        let targetEl = null;
        if (isBo3) {
          targetEl = document.getElementById('my-selection-slots-bo3-0');
        } else {
          targetEl = document.getElementById('my-selection-slots');
        }
        
        // フォールバックとして相手のパーティ枠
        if (!targetEl) {
          targetEl = document.getElementById('opp-party-slots');
        }

        // 要素がDOMに未接続、または高さが0の場合はリトライ
        if (!targetEl || !document.contains(targetEl)) {
          if (attempts < maxAttempts) {
            setTimeout(tryScroll, 50);
          }
          return;
        }

        const targetRect = targetEl.getBoundingClientRect();
        // レイアウト完了前ならリトライ
        if (targetRect.height === 0 && attempts < maxAttempts) {
          setTimeout(tryScroll, 50);
          return;
        }

        // scrollIntoView を使って中央にスクロール
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };

      tryScroll();
    }

    updateVsBarSlot(role, slotIndex, pokemonName, force = false) {
      const slotId = `vs-slot-${role}-${slotIndex}`;
      const slotEl = document.getElementById(slotId);
      if (!slotEl) return;

      const currentPokemon = slotEl.dataset.currentPokemon || '';
      const targetPokemon = pokemonName || '';
      // すでに同じ内容が表示されている場合は再描画せず、毎フレームの popIn アニメーション（ピコピコ）を防止
      if (!force && currentPokemon === targetPokemon) {
        return;
      }
      slotEl.dataset.currentPokemon = targetPokemon;

      if (!pokemonName) {
        // 初期状態: モンスターボール表示 (大型化: 68px)
        slotEl.innerHTML = `<img src="assets/templates/monsterball.png" alt="ball" style="width:68px;height:68px;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.65))">`;
      } else {
        // ポケモン特定後: 名前を削除し、ポケモンスプライトアイコンを四角い枠いっぱいに大型表示
        let spriteHtml = '';
        if (typeof window.getPokeSpriteHTMLByDisplay === 'function') {
          spriteHtml = window.getPokeSpriteHTMLByDisplay(pokemonName);
        }
        if (!spriteHtml) {
          spriteHtml = `<div style="font-size:36px;line-height:1">⚡</div>`;
        }
        slotEl.innerHTML = `
          <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;animation:popIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)">
            <div style="transform:scale(2.3);transform-origin:center;filter:drop-shadow(0 4px 10px rgba(0,0,0,0.85));display:flex;align-items:center;justify-content:center">
              ${spriteHtml}
            </div>
          </div>
        `;
      }
    }
  }

  // グローバル公開
  window.COORDS = COORDS;
  window.AutoModeController = AutoModeController;
  AutoModeController.COORDS = COORDS;
  window.autoModeController = new AutoModeController();
  window.forceResetAutoModePhase = () => {
    if (window.autoModeController) {
      window.autoModeController.forceResetPhase();
    }
  };

})(window);
