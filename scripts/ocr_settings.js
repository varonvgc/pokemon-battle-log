// ocr_settings.js
// OCR読み取りのための閾値（スケール値）を管理するモジュール

window.OCR_SETTINGS = {
    // デフォルトのスケール値 (pamo3準拠)
    _scale: parseFloat(localStorage.getItem('pbl_ocr_scale') || '1.00'),

    getScale: function() {
        return this._scale;
    },

    setScale: function(newScale) {
        this._scale = parseFloat(newScale);
        localStorage.setItem('pbl_ocr_scale', this._scale.toFixed(2));
    },

    resetToDefault: function() {
        this.setScale(1.0);
    }
};

// --- OCR設定（読み取りテスト）用UIロジック ---

// モーダルを開く
window.openOcrSetupModal = async function() {
    const video = document.getElementById('auto-mode-video');
    if (!video || video.readyState === 0 || video.videoWidth === 0) {
        alert("カメラ映像が取得されていません。\n先にオートモードの「📸セットアップを開始する」から映像を取り込んでください。");
        return;
    }

    // 最新のスケール値をUIに反映
    const slider = document.getElementById('ocr-scale-slider');
    const scaleVal = document.getElementById('ocr-scale-val');
    slider.value = window.OCR_SETTINGS.getScale();
    scaleVal.textContent = parseFloat(slider.value).toFixed(2);

    document.getElementById('ocr-setup-modal').style.display = 'flex';
    
    // 現在の映像フレームからテストを実行
    await runOcrSetupTest();
};

window.closeOcrSetupModal = function() {
    document.getElementById('ocr-setup-modal').style.display = 'none';
};

// スライダー変更時
window.onOcrScaleChange = async function(val) {
    document.getElementById('ocr-scale-val').textContent = parseFloat(val).toFixed(2);
    window.OCR_SETTINGS.setScale(val);
    await runOcrSetupTest();
};

// テストの実行
window.runOcrSetupTest = async function() {
    const video = document.getElementById('auto-mode-video');
    if (!video || video.videoWidth === 0) return;

    const scale = window.OCR_SETTINGS.getScale();

    // pamo3のボックス（ステータス）画面のテスト座標 (1920x1080基準)
    // - ポケモン名 (boxPokeOriginName)
    const nameRect = { x: 1420, y: 90, w: 200, h: 40 };
    // - 一番目のわざ (boxMove1)
    const moveRect = { x: 1320, y: 700, w: 280, h: 50 };

    await processOcrTestRow('ocr-test-name', video, nameRect, scale);
    await processOcrTestRow('ocr-test-move', video, moveRect, scale);
};

// 1行分（元画像 / 二値化画像 / OCR結果）の処理
async function processOcrTestRow(rowId, video, rect, scale) {
    const rowEl = document.getElementById(rowId);
    if (!rowEl) return;

    const cvsColor = rowEl.querySelector('.ocr-test-color');
    const cvsBin = rowEl.querySelector('.ocr-test-bin');
    const resText = rowEl.querySelector('.ocr-test-result');

    resText.textContent = "読み取り中...";
    resText.style.color = "var(--text-muted)";

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const rx = vw / 1920;
    const ry = vh / 1080;

    // 実際のビデオ解像度に合わせた座標を計算
    const sx = rect.x * rx;
    const sy = rect.y * ry;
    const sw = rect.w * rx;
    const sh = rect.h * ry;

    // カラー画像の切り抜き
    cvsColor.width = rect.w;
    cvsColor.height = rect.h;
    const ctxColor = cvsColor.getContext('2d');
    ctxColor.drawImage(video, sx, sy, sw, sh, 0, 0, rect.w, rect.h);

    // 二値化処理 (pamo3互換ロジック)
    cvsBin.width = rect.w;
    cvsBin.height = rect.h;
    const ctxBin = cvsBin.getContext('2d');
    ctxBin.drawImage(cvsColor, 0, 0);

    const imgData = ctxBin.getImageData(0, 0, rect.w, rect.h);
    const data = imgData.data;

    // pamo3の二値化閾値基準：155 * scale (スケール1.0の時155)
    const threshold = 155 * scale;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // 輝度計算 (pamo3準拠: R*0.299 + G*0.587 + B*0.114)
        const luma = r * 0.299 + g * 0.587 + b * 0.114;
        
        // pamo3では輝度が閾値以上の時黒(文字)、未満の時白(背景)にする
        // Tesseractに読ませるため、白背景・黒文字にするのが基本
        const val = (luma >= threshold) ? 0 : 255;
        data[i] = data[i + 1] = data[i + 2] = val;
        data[i + 3] = 255; // alpha
    }
    ctxBin.putImageData(imgData, 0, 0);

    // TesseractでOCR
    if (window.autoModeWorker) {
        try {
            // DataURL化してワーカーに渡す
            const dataUrl = cvsBin.toDataURL('image/png');
            const ret = await window.autoModeWorker.recognize(dataUrl);
            const text = ret.data.text.trim();
            resText.textContent = text || "(空)";
            resText.style.color = "var(--accent-cyan)";
        } catch (e) {
            resText.textContent = "エラー";
            resText.style.color = "var(--accent2)";
            console.error(e);
        }
    } else {
        resText.textContent = "OCR準備未完了";
        resText.style.color = "var(--accent2)";
    }
}
