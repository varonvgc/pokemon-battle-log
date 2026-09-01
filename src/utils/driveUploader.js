/**
 * Google Drive Resumable Uploader
 * 
 * 大容量動画ファイルをチャンク（分割）送信し、iPhone / Safari のメモリ制約や
 * 通信切断時の中断・再開（Resumable）に対応したアップローダー。
 */

export class GoogleDriveResumableUploader {
  /**
   * @param {Object} options
   * @param {File} options.file - アップロードする動画ファイル (Blob/File)
   * @param {string} options.accessToken - Google OAuth 2.0 アクセストークン
   * @param {string} [options.folderId] - 保存先のGoogle DriveフォルダID
   * @param {string} [options.customFileName] - 保存時のファイル名 (未指定時は file.name)
   * @param {number} [options.chunkSize] - チャンクサイズ (256KBの倍数、デフォルト: 2MB)
   * @param {number} [options.maxRetries] - チャンク失敗時の最大リトライ回数 (デフォルト: 5)
   * @param {Function} [options.onProgress] - 進捗コールバック (percent, loadedBytes, totalBytes, speedBytesPerSec)
   * @param {Function} [options.onStatusChange] - 状態変化コールバック (status: 'initializing' | 'uploading' | 'paused' | 'completed' | 'error', message)
   */
  constructor(options) {
    this.file = options.file;
    this.accessToken = options.accessToken;
    this.folderId = options.folderId || null;
    this.customFileName = options.customFileName || this.file.name;
    // Google Drive Resumable API requires chunk size to be a multiple of 256KB (262,144 bytes)
    this.chunkSize = options.chunkSize || 2 * 1024 * 1024; // 2MB
    this.maxRetries = options.maxRetries || 5;
    this.onProgress = options.onProgress || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});

    this.uploadUrl = null;
    this.uploadedBytes = 0;
    this.isAborted = false;
    this.isPaused = false;
    this.startTime = null;
  }

  /**
   * アップロードを開始
   * @returns {Promise<{id: string, name: string, webViewLink?: string}>}
   */
  async start() {
    this.isAborted = false;
    this.isPaused = false;
    this.startTime = Date.now();
    this.onStatusChange('initializing', 'アップロードセッションを初期化中...');

    try {
      // 1. Resumable Upload セッションの作成
      this.uploadUrl = await this._initiateResumableSession();
      this.onStatusChange('uploading', '動画をアップロード中...');

      // 2. チャンク分割送信
      const result = await this._uploadChunks();
      this.onStatusChange('completed', 'アップロードが完了しました');
      return result;
    } catch (error) {
      if (this.isAborted) {
        this.onStatusChange('aborted', 'アップロードがキャンセルされました');
      } else {
        this.onStatusChange('error', error.message || 'アップロード中にエラーが発生しました');
      }
      throw error;
    }
  }

  /**
   * アップロードを一時停止
   */
  pause() {
    this.isPaused = true;
    this.onStatusChange('paused', 'アップロードを一時停止しました');
  }

  /**
   * アップロードを再開
   */
  async resume() {
    if (!this.isPaused || !this.uploadUrl) return;
    this.isPaused = false;
    this.onStatusChange('uploading', 'アップロードを再開中...');
    
    // 現在のサーバー側受信位置を確認
    this.uploadedBytes = await this._queryServerProgress();
    return this._uploadChunks();
  }

  /**
   * アップロードをキャンセル
   */
  abort() {
    this.isAborted = true;
    this.isPaused = false;
  }

  /**
   * Resumable Upload セッションURLの初期化 (POST)
   * @private
   */
  async _initiateResumableSession() {
    const metadata = {
      name: this.customFileName,
      mimeType: this.file.type || 'video/mp4'
    };

    if (this.folderId) {
      metadata.parents = [this.folderId];
    }

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': this.file.type || 'video/mp4',
        'X-Upload-Content-Length': this.file.size.toString()
      },
      body: JSON.stringify(metadata)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`セッション初期化に失敗しました (HTTP ${res.status}): ${errText}`);
    }

    const location = res.headers.get('Location');
    if (!location) {
      throw new Error('セッション初期化レスポンスにLocationヘッダーが含まれていません');
    }
    return location;
  }

  /**
   * サーバー側の現在のアップロード済みバイト数を問い合わせ (PUT Content-Range: bytes * / total)
   * @private
   */
  async _queryServerProgress() {
    const res = await fetch(this.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Range': `bytes */${this.file.size}`
      }
    });

    if (res.status === 308) {
      const range = res.headers.get('Range');
      if (range) {
        const match = range.match(/bytes=0-(\d+)/);
        if (match) {
          return parseInt(match[1], 10) + 1;
        }
      }
      return 0;
    } else if (res.status === 200 || res.status === 201) {
      return this.file.size;
    } else {
      throw new Error(`進捗問い合わせに失敗しました (HTTP ${res.status})`);
    }
  }

  /**
   * チャンクごとの送信ループ
   * @private
   */
  async _uploadChunks() {
    const totalSize = this.file.size;

    while (this.uploadedBytes < totalSize) {
      if (this.isAborted) {
        throw new Error('Upload aborted by user');
      }
      if (this.isPaused) {
        return;
      }

      const chunkStart = this.uploadedBytes;
      const chunkEnd = Math.min(chunkStart + this.chunkSize, totalSize) - 1;
      const currentChunkLength = chunkEnd - chunkStart + 1;

      // 重要: メモリにファイル全体を載せないよう Blob.slice() を使用
      const chunkBlob = this.file.slice(chunkStart, chunkEnd + 1);

      let success = false;
      let lastError = null;

      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        if (this.isAborted) throw new Error('Upload aborted by user');

        try {
          const res = await fetch(this.uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Range': `bytes ${chunkStart}-${chunkEnd}/${totalSize}`,
              'Content-Length': currentChunkLength.toString()
            },
            body: chunkBlob
          });

          if (res.status === 308) {
            // チャンク受信成功（アップロード継続中）
            this.uploadedBytes = chunkEnd + 1;
            this._notifyProgress();
            success = true;
            break;
          } else if (res.status === 200 || res.status === 201) {
            // 全チャンク送信完了
            this.uploadedBytes = totalSize;
            this._notifyProgress();
            const data = await res.json();
            return data;
          } else if (res.status >= 500 || res.status === 429) {
            // サーバーエラーまたはレートリミット: 指数バックオフでリトライ
            const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
            console.warn(`[DriveUpload] HTTP ${res.status} リトライ試行 ${attempt}/${this.maxRetries} (${Math.round(delay)}ms後)`);
            await new Promise(r => setTimeout(r, delay));
            // サーバーの受信位置を再確認
            this.uploadedBytes = await this._queryServerProgress();
            break; // 内側ループを抜けて次のチャンク判定へ
          } else {
            const errBody = await res.text();
            throw new Error(`チャンクアップロード失敗 (HTTP ${res.status}): ${errBody}`);
          }
        } catch (err) {
          lastError = err;
          if (attempt === this.maxRetries) {
            throw new Error(`リトライ上限到達 (${this.maxRetries}回): ${err.message}`);
          }
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(r => setTimeout(r, delay));
          try {
            this.uploadedBytes = await this._queryServerProgress();
          } catch (e) {
            // query失敗時はそのまま次試行へ
          }
        }
      }

      if (!success && this.uploadedBytes === chunkStart) {
        throw lastError || new Error('チャンクの送信に失敗しました');
      }
    }
  }

  /**
   * 進捗通知
   * @private
   */
  _notifyProgress() {
    const total = this.file.size;
    const loaded = Math.min(this.uploadedBytes, total);
    const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
    
    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    const speed = elapsedSeconds > 0 ? Math.round(loaded / elapsedSeconds) : 0;

    this.onProgress({
      percent,
      loadedBytes: loaded,
      totalBytes: total,
      speedBytesPerSec: speed
    });
  }
}
