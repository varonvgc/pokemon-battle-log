    let isAutoModeActive = false;

    // PC環境判定 & オートモードボタンの表示制御
    function checkPcAutoModeAvailability() {
      const btn = document.getElementById('btn-toggle-auto-mode');
      if (!btn) return;
      const isMobileDevice = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isPcWidth = window.innerWidth >= 1024;
      if (isPcWidth && !isMobileDevice) {
        btn.style.display = 'inline-flex';
      } else {
        btn.style.display = 'none';
        if (isAutoModeActive) {
          exitAutoMode();
        }
      }
    }
    window.addEventListener('resize', checkPcAutoModeAvailability);
    document.addEventListener('DOMContentLoaded', checkPcAutoModeAvailability);
    setTimeout(checkPcAutoModeAvailability, 500);

    // オートモード切り替え
    async function toggleAutoMode(btn) {
      if (isAutoModeActive) {
        exitAutoMode();
      } else {
        enterAutoMode(btn);
      }
    }

    async function enterAutoMode(btn) {
      isAutoModeActive = true;
      document.body.classList.add('auto-mode-layout');
      if (btn) btn.classList.add('active');

      // 1. 左側パネルで記録画面を開く
      const navRecordBtn = document.querySelector('nav button:nth-child(3)');
      showPage('record', navRecordBtn);

      // 2. 🏆 チャンピオンズ モードを自動選択
      if (typeof setRecordMode === 'function') {
        setRecordMode('champions');
      }

      // 3. 形式: 直前の記録の形式、なければランクマ / BO1
      let autoMatchType = 'ランクマ';
      try {
        const savedType = localStorage.getItem('pkm_last_match_type');
        if (savedType && ['ランクマ', '公式大会', '非公式', 'フレ戦', 'showdown'].includes(savedType)) {
          autoMatchType = savedType;
        }
      } catch (e) {}

      if (typeof setRecordMatchType === 'function') {
        setRecordMatchType(autoMatchType);
      }
      if (typeof setRecordMatchBo === 'function') {
        setRecordMatchBo(1);
      }

      // 4. 一番上のパーティを自動選択してフォームを開く
      if (typeof parties !== 'undefined' && parties && parties.length > 0) {
        selectPartyForRecord(parties[0].id);
        const partySelect = document.getElementById('party-select-dropdown');
        if (partySelect) {
          partySelect.value = parties[0].id;
        }
      } else {
        const partySelect = document.getElementById('party-select-dropdown');
        if (partySelect && partySelect.options.length > 1) {
          partySelect.selectedIndex = 1;
          partySelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      // コントローラーに video 要素をセット
      const videoEl = document.getElementById('auto-mode-video');
      if (window.autoModeController) {
        window.autoModeController.videoElement = videoEl;
      }

      // カメラ＆音声一覧をロード
      await refreshAutoCameraAndAudioDevices();

      // 保存されたプレビューミュート設定と音量設定を復元
      const savedMute = localStorage.getItem('autoModePreviewMuted') !== 'false';
      const savedVolStr = localStorage.getItem('autoModePreviewVolume');
      const savedVol = savedVolStr !== null ? parseFloat(savedVolStr) : 0.5;

      if (window.autoModeController) {
        window.autoModeController.setVolume(savedVol);
        window.autoModeController.setMute(savedMute);
      }
      
      // UIに反映
      const setupSlider = document.getElementById('auto-setup-volume-slider');
      const controlSlider = document.getElementById('auto-control-volume-slider');
      if (setupSlider) setupSlider.value = savedVol;
      if (controlSlider) controlSlider.value = savedVol;
      updateMuteUI(savedMute);

      console.log(`[AutoMode] Entered PC Auto Mode (Split View: Champions ${autoMatchType} BO1)`);
    }

    function exitAutoMode() {
      isAutoModeActive = false;
      document.body.classList.remove('auto-mode-layout');
      const btn = document.getElementById('btn-toggle-auto-mode');
      if (btn) btn.classList.remove('active');

      // オートモード処理・カメラを停止
      if (window.autoModeController) {
        window.autoModeController.stopAutoMode();
        window.autoModeController.stopCamera();
      }

      // セットアップUIを初期状態にリセット
      const chk = document.getElementById('chk-auto-mode-run');
      if (chk) chk.checked = false;
      const btnRun = document.getElementById('btn-auto-mode-start');
      if (btnRun) btnRun.classList.remove('running');
      const overlay = document.getElementById('auto-mode-setup-overlay');
      if (overlay) overlay.classList.remove('hidden');

      console.log('[AutoMode] Exited PC Auto Mode');
    }

    // カメラ＆音声デバイス一覧の更新
    async function refreshAutoCameraAndAudioDevices() {
      const camRes = await refreshAutoCameraDevices();
      const audioRes = await refreshAutoAudioDevices();
      return { camRes, audioRes };
    }

    // カメラデバイス一覧の更新
    async function refreshAutoCameraDevices() {
      const select = document.getElementById('auto-camera-select');
      if (!select || !window.autoModeController) return null;

      const devices = await window.autoModeController.getCameraDevices();
      select.innerHTML = '<option value="">カメラデバイスを選択...</option>';

      let obsDevice = null;
      let hasRealLabels = false;

      devices.forEach((d, idx) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        if (d.label) {
          hasRealLabels = true;
          opt.textContent = d.label;
        } else {
          opt.textContent = `カメラ ${idx + 1}`;
        }
        if (d.label && d.label.toLowerCase().includes('obs')) {
          obsDevice = d;
        }
        select.appendChild(opt);
      });

      // 保存されたカメラまたはOBS Virtual Camera を優先選択
      const savedCamId = localStorage.getItem('autoModeCameraDeviceId');
      if (savedCamId && devices.some(d => d.deviceId === savedCamId)) {
        select.value = savedCamId;
      } else if (obsDevice) {
        select.value = obsDevice.deviceId;
      } else if (devices.length === 1 && devices[0].deviceId) {
        select.value = devices[0].deviceId;
      }

      return { devices, obsDevice, hasRealLabels };
    }

    // 音声デバイス一覧の更新
    async function refreshAutoAudioDevices() {
      const select = document.getElementById('auto-audio-select');
      if (!select || !window.autoModeController) return null;

      const devices = await window.autoModeController.getAudioDevices();
      select.innerHTML = '<option value="">🎤 音声入力: なし (無音録画)</option>';

      let defaultAudio = null;
      devices.forEach((d, idx) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `マイク/オーディオ ${idx + 1}`;
        const lower = (d.label || '').toLowerCase();
        if (lower.includes('capture') || lower.includes('game') || lower.includes('obs') || lower.includes('line') || lower.includes('デジタル') || lower.includes('ライン')) {
          if (!defaultAudio) defaultAudio = d;
        }
        select.appendChild(opt);
      });

      // 保存された音声デバイスまたはキャプチャ機器を優先選択
      const savedAudioId = localStorage.getItem('autoModeAudioDeviceId');
      if (savedAudioId && devices.some(d => d.deviceId === savedAudioId)) {
        select.value = savedAudioId;
      } else if (defaultAudio) {
        select.value = defaultAudio.deviceId;
      }

      return { devices, defaultAudio };
    }

    // ミュート状態の反映とUI更新
    function updateMuteUI(isMuted) {
      const chk = document.getElementById('chk-auto-preview-mute');
      if (chk) chk.checked = isMuted;
      const labelText = document.getElementById('auto-mute-label-text');
      if (labelText) {
        labelText.textContent = isMuted ? '🔇 PCでゲーム音を出さない (ミュート)' : '🔊 PCでゲーム音を再生中';
      }
      const quickBtn = document.getElementById('btn-toggle-auto-mute');
      const quickIcon = document.getElementById('auto-mute-btn-icon');
      if (quickBtn) {
        quickBtn.title = isMuted ? 'PC音声ミュート中 (クリックで再生。録画には影響しません)' : 'PC音声再生中 (クリックでミュート。録画には影響しません)';
        if (quickIcon) quickIcon.textContent = isMuted ? '🔇' : '🔊';
        if (isMuted) {
          quickBtn.style.color = '#94a3b8';
        } else {
          quickBtn.style.color = '#22c55e';
        }
      }
    }

    // 音量変更ハンドラ
    function onAutoVolumeChange(value) {
      const vol = parseFloat(value);
      localStorage.setItem('autoModePreviewVolume', vol.toString());
      if (window.autoModeController) {
        window.autoModeController.setVolume(vol);
      }
      
      // UIのスライダーを同期
      const setupSlider = document.getElementById('auto-setup-volume-slider');
      const controlSlider = document.getElementById('auto-control-volume-slider');
      if (setupSlider && setupSlider.value !== value) setupSlider.value = value;
      if (controlSlider && controlSlider.value !== value) controlSlider.value = value;

      // 音量が0より大きければ自動的にミュート解除
      if (vol > 0 && window.autoModeController && window.autoModeController.isPreviewMuted) {
        toggleAutoPreviewMute(false);
      } else if (vol === 0 && window.autoModeController && !window.autoModeController.isPreviewMuted) {
        toggleAutoPreviewMute(true);
      }
    }

    function toggleAutoPreviewMute(isMuted) {
      localStorage.setItem('autoModePreviewMuted', isMuted ? 'true' : 'false');
      if (window.autoModeController) {
        window.autoModeController.setMute(isMuted);
      }
      updateMuteUI(isMuted);
    }

    function toggleAutoPreviewMuteQuick() {
      const current = window.autoModeController ? window.autoModeController.isPreviewMuted : true;
      toggleAutoPreviewMute(!current);
    }

    // セットアップ開始ボタンクリック
    async function onAutoSetupStartClick() {
      const select = document.getElementById('auto-camera-select');
      const audioSelect = document.getElementById('auto-audio-select');
      const muteWrapper = document.getElementById('auto-audio-preview-toggle-wrapper');
      const startBtn = document.getElementById('btn-auto-setup-start');
      const runBtn = document.getElementById('btn-auto-mode-start');
      const hint = document.getElementById('auto-setup-permission-hint');

      if (hint) hint.style.display = 'none';

      // 1. まずブラウザにカメラ・音声利用許可を要求
      const permitted = await window.autoModeController.requestPermission();
      if (!permitted) {
        if (hint) hint.style.display = 'block';
        return;
      }

      // 2. 許可された状態でデバイス一覧を再取得
      await refreshAutoCameraAndAudioDevices();
      if (select) select.style.display = 'block';
      if (audioSelect) audioSelect.style.display = 'block';
      if (muteWrapper) muteWrapper.style.display = 'block';
      if (startBtn) startBtn.style.display = 'none';

      // 保存されたプレビューミュート設定を復元 (デフォルトはミュート)
      const savedMute = localStorage.getItem('autoModePreviewMuted') !== 'false';
      toggleAutoPreviewMute(savedMute);

      // 3. 選択可能なカメラがあれば直ちに映像開始
      if (select && select.value) {
        await onAutoCameraSelectChange(select.value);
      }
    }

    // カメラ選択変更
    async function onAutoCameraSelectChange(deviceId) {
      if (!deviceId || !window.autoModeController) return;
      localStorage.setItem('autoModeCameraDeviceId', deviceId);
      const audioSelect = document.getElementById('auto-audio-select');
      const audioDeviceId = audioSelect ? audioSelect.value : null;
      const ok = await window.autoModeController.startCamera(deviceId, audioDeviceId);
      const runBtn = document.getElementById('btn-auto-mode-start');
      if (ok && runBtn) {
        runBtn.style.display = 'flex';
      }
    }

    // 音声デバイス選択変更
    async function onAutoAudioSelectChange(audioDeviceId) {
      if (!window.autoModeController) return;
      localStorage.setItem('autoModeAudioDeviceId', audioDeviceId || '');
      const camSelect = document.getElementById('auto-camera-select');
      const camDeviceId = camSelect ? camSelect.value : null;
      if (camDeviceId) {
        await window.autoModeController.startCamera(camDeviceId, audioDeviceId);
      }
    }

    // 自動モードのスタート/ストップ
    function toggleAutoModeCapture() {
      const chk = document.getElementById('chk-auto-mode-run');
      const runBtn = document.getElementById('btn-auto-mode-start');
      const overlay = document.getElementById('auto-mode-setup-overlay');
      if (!chk || !window.autoModeController) return;

      chk.checked = !chk.checked;
      if (chk.checked) {
        if (runBtn) runBtn.classList.add('running');
        window.autoModeController.startAutoMode();
        // 1.2秒後にオーバーレイをフェードアウトしてゲーム画面を全表示
        setTimeout(() => {
          if (overlay) overlay.classList.add('hidden');
        }, 800);
      } else {
        if (runBtn) runBtn.classList.remove('running');
        window.autoModeController.stopAutoMode();
        if (overlay) overlay.classList.remove('hidden');
      }
    }

    function toggleAutoSetupOverlay() {
      const overlay = document.getElementById('auto-mode-setup-overlay');
      if (overlay) overlay.classList.toggle('hidden');
    }

    function toggleAutoVideoFullscreen() {
      const wrapper = document.getElementById('auto-mode-video-wrapper');
      if (!wrapper) return;
      if (!document.fullscreenElement) {
        wrapper.requestFullscreen().catch(err => console.warn(err));
      } else {
        document.exitFullscreen();
      }
    }

    // オートモード用グローバルAPIブリッジ
    window.autoModeBridge = {
      getParties: () => parties,
      getSelectedPartyId: () => selectedPartyId,
      selectPartyForRecord: (id) => selectPartyForRecord(id),
      onPartyDropdownChange: (id) => onPartyDropdownChange(id),
      showRecordForm: () => showRecordForm(),
      setSelectionFromNames: (type, names, gameIdx) => setSelectionFromNames(type, names, gameIdx),
      setResult: (res) => setResult(res),
      saveRecord: () => saveRecord(),
      showPage: (name, btn) => showPage(name, btn),
      updateSlotIcon: (input, name) => updateSlotIcon(input, name),
      rebuildOppSelectionDropdowns: () => rebuildOppSelectionDropdowns(),
      getPokeSpriteHTMLByDisplay: (disp) => getPokeSpriteHTMLByDisplay(disp),
      findPokemon: (q) => findPokemon(q)
    };
    window.parties = parties;
    window.selectPartyForRecord = selectPartyForRecord;
    window.onPartyDropdownChange = onPartyDropdownChange;
    window.showRecordForm = showRecordForm;
    window.setSelectionFromNames = setSelectionFromNames;
    window.setResult = setResult;
    window.saveRecord = saveRecord;
    window.showPage = showPage;
    window.updateSlotIcon = updateSlotIcon;
    window.rebuildOppSelectionDropdowns = rebuildOppSelectionDropdowns;
    window.getPokeSpriteHTMLByDisplay = getPokeSpriteHTMLByDisplay;
    window.findPokemon = findPokemon;

    // --- 自動録画機能の状態管理とUI連携 ---
    async function attachVideoFileAsync(file) {
      if (!file || typeof window.onVideoFileSelected !== 'function') return false;
      const fakeInput = { files: [file], value: '' };
      try {
        await window.onVideoFileSelected(fakeInput);
        return true;
      } catch (err) {
        console.error('[AutoRecord] Video attachment failed:', err);
        return false;
      }
    }
    window.attachVideoFileAsync = attachVideoFileAsync;

    function initAutoRecordState() {
      const isAutoRecord = localStorage.getItem('autoModeAutoRecord') === 'true';
      syncAutoRecordState(isAutoRecord, true);
    }
    
    function toggleAutoRecordState() {
      const chk = document.getElementById('chk-auto-record-setup');
      if (chk) {
        syncAutoRecordState(!chk.checked);
      }
    }
    
    function syncAutoRecordState(isEnabled, isInit = false) {
      localStorage.setItem('autoModeAutoRecord', isEnabled);
      
      const chk = document.getElementById('chk-auto-record-setup');
      if (chk) chk.checked = isEnabled;
      
      const btn = document.getElementById('btn-toggle-auto-record');
      const icon = document.getElementById('auto-record-icon');
      const dot = document.getElementById('auto-record-status-dot');
      
      if (btn) btn.title = isEnabled ? '自動録画: ON' : '自動録画: OFF';
      if (icon) {
        icon.style.filter = isEnabled ? 'none' : 'grayscale(1)';
        icon.style.opacity = isEnabled ? '1' : '0.5';
      }
      if (dot) {
        dot.style.display = isEnabled ? 'block' : 'none';
      }
      
      if (!isInit && window.autoModeController) {
        window.autoModeController.setAutoRecordEnabled(isEnabled);
      }
    }

    document.addEventListener('DOMContentLoaded', () => {
      initAutoRecordState();
    });
