# YouTube自動転送 ＆ Google Drive連携 設定ガイド

このガイドでは、対戦録画動画を **Google Drive 経由で YouTube（限定公開）へ自動転送** するための初期設定手順を説明します。
初期設定は **初回に1回だけ** 行えば、以降は毎日バッチが自動実行されます。

---

## 全体の流れ
1. **Google Cloud Console** で API 有効化 ＆ OAuth クライアント作成
2. **Firebase Console** で サービスアカウント秘密鍵の生成
3. **ローカル環境** で Refresh Token を取得
4. **GitHub リポジトリ** に Secrets を登録
5. **Webアプリ（データ管理画面）** で Google Drive フォルダIDを設定

---

## 1. Google Cloud Console の設定

### 1-1. プロジェクト作成または選択
1. [Google Cloud Console](https://console.cloud.google.com/) にアクセスします。
2. 既存の Firebase プロジェクト（例: `pokemon-battle-log-9eaf6`）を選択するか、新規プロジェクトを作成します。

### 1-2. API の有効化
左メニューの「APIとサービス」➔「有効なAPIとサービス」➔「+ APIとサービスの有効化」から、以下の2つのAPIを検索して有効化します：
- **Google Drive API**
- **YouTube Data API v3**

### 1-3. OAuth 同意画面の設定
1. 「APIとサービス」➔「OAuth 同意画面」を開きます。
2. User Type で **「外部」** を選択し「作成」をクリックします。
3. アプリ情報（アプリ名・ユーザーサポートメール等）を入力します。
4. **スコープ**:
   - `.../auth/drive`（Google ドライブのすべてのファイルの表示、編集、作成、削除）
   - `.../auth/youtube.upload`（YouTube 動画の管理）
   - `.../auth/youtube`（YouTube アカウントの管理）
   を追加します。
5. **テストユーザー**:
   - 動画をアップロードしたい YouTube チャンネルの Google アカウント（ご自身のメールアドレス）を追加します。
6. 「保存して次へ」で完了します。

### 1-4. OAuth 2.0 クライアント ID の作成
「APIとサービス」➔「認証情報」➔「+ 認証情報を作成」➔「OAuth クライアント ID」をクリックします。

#### ① デスクトップアプリ用（バッチ用）
- アプリケーションの種類: **デスクトップ アプリ**
- 名前: `YouTube Sync Batch`
- 作成後、表示される **クライアント ID** と **クライアント シークレット** をメモします。

#### ② ウェブアプリケーション用（フロントエンド直接アップロード用）
- アプリケーションの種類: **ウェブ アプリケーション**
- 名前: `Pokemon Battle Log Web`
- 承認済みの JavaScript 生成元:
  - `http://localhost:5000`（ローカル検証用など）
  - `https://pokemon-battle-log-9eaf6.firebaseapp.com`（本番URL）
  - `https://pokemon-battle-log-9eaf6.web.app`
- 作成後、表示される **クライアント ID** をメモします。

---

## 2. Firebase サービスアカウント秘密鍵の取得

GitHub Actions から Firestore の対戦レコードを更新するために必要です。

1. [Firebase Console](https://console.firebase.google.com/) にアクセスします。
2. プロジェクトを選択 ➔ 画面左上の歯車アイコン（プロジェクト設定）を開きます。
3. **「サービス アカウント」** タブを開きます。
4. **「新しい秘密鍵の生成」** ボタンをクリックし、JSON ファイルをダウンロードします。
5. この JSON ファイルの中身（テキスト全体）を後ほど GitHub Secrets に登録します。

---

## 3. Refresh Token の取得

Python スクリプトを実行して、YouTube チャンネルを所有する Google アカウントでログインし、Refresh Token を取得します。

### 実行手順
ターミナルまたは PowerShell で以下のコマンドを実行します：

```bash
# 依存関係をインストール
pip install google-auth-oauthlib google-api-python-client

# トークン取得スクリプトを実行
python scripts/get_oauth_token.py
```

実行すると、プロンプトで `Client ID` と `Client Secret`（手順 1-4 ①のデスクトップ用）の入力を求められます。
入力後、自動的にブラウザが開くので、**アップロード先としたい YouTube チャンネルの Google アカウントでログイン・許可** してください。

認証完了後、画面に `GCP_REFRESH_TOKEN` が表示されます。

---

## 4. GitHub Secrets の登録

GitHub のリポジトリページを開き、**「Settings」➔「Secrets and variables」➔「Actions」** にアクセスします。
「**New repository secret**」をクリックし、以下の4つのシークレットを登録します：

| Secret 名 | 内容 |
|---|---|
| `GCP_CLIENT_ID` | 手順 1-4 ① で取得したクライアント ID |
| `GCP_CLIENT_SECRET` | 手順 1-4 ① で取得したクライアント シークレット |
| `GCP_REFRESH_TOKEN` | 手順 3 で取得したリフレッシュトークン |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | 手順 2 でダウンロードした Firebase JSON ファイルの全文 |

---

## 5. Webアプリでの設定（Google Drive フォルダID）

1. [Google Drive](https://drive.google.com/) を開き、対戦録画の一時保存先としたいフォルダを作成します（例: `PokemonBattleLogs`）。
2. そのフォルダを開き、ブラウザの URL バーからフォルダ ID をコピーします。
   - 例: `https://drive.google.com/drive/folders/1a2B3c4D5e6F7g8H9i0jK` の場合、`1a2B3c4D5e6F7g8H9i0jK` がフォルダIDです。
3. Web アプリの **「データ管理」画面** を開き、「🎥 Google Drive 動画連携設定」カードにフォルダIDを入力して保存します。

---

## 6. 動作確認

1. **Webアプリから動画アップロード**:
   - 記録画面で対戦を入力し、「🎥 動画ファイル添付」から mp4 動画を選択して記録。
   - アップロード完了後、履歴一覧・詳細で Google Drive のプレビューリンクが表示されることを確認。
2. **GitHub Actions 手動実行テスト**:
   - GitHub リポジトリの「Actions」タブ ➔「Sync Drive Videos to YouTube」を選択。
   - 「Run workflow」をクリックして手動実行。
   - 正常に完了すると、YouTube に限定公開でアップロードされ、Firestore のリンクが YouTube URL に差し替わり、Drive の元動画が削除されます。
