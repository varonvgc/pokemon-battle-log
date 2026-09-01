#!/usr/bin/env python3
"""
OAuth 2.0 Refresh Token 取得スクリプト

YouTube Data API (アップロード) および Google Drive API にアクセスするための
Refresh Token を取得し、画面に表示します。
"""

import sys
import os
import json

try:
    from google_auth_oauthlib.flow import InstalledAppFlow
except ImportError:
    print("エラー: 必要なライブラリがインストールされていません。")
    print("以下を実行してください:")
    print("  pip install google-auth-oauthlib")
    sys.exit(1)

# 必要な権限スコープ
SCOPES = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/drive'
]

def main():
    print("=" * 60)
    print(" Google OAuth 2.0 Refresh Token 取得ツール")
    print("=" * 60)
    print()
    print("このスクリプトは、YouTube動画の自動アップロードおよび")
    print("Google Drive動画のダウンロード・削除に必要な Refresh Token を取得します。")
    print()

    client_id = os.environ.get("GCP_CLIENT_ID")
    client_secret = os.environ.get("GCP_CLIENT_SECRET")

    # client_secrets.json がある場合は読み込む
    secrets_file = "client_secrets.json"
    if os.path.exists(secrets_file):
        print(f"📄 {secrets_file} を検出しました。これを使用して認証を開始します。")
        flow = InstalledAppFlow.from_client_secrets_file(secrets_file, scopes=SCOPES)
    else:
        if not client_id or not client_secret:
            print("Google Cloud Console で作成した OAuth 2.0 クライアントの情報を入力してください:")
            print("（※デスクトップアプリ用 または ウェブアプリ用のクライアント情報）")
            print()
            client_id = input("Client ID: ").strip()
            client_secret = input("Client Secret: ").strip()

        if not client_id or not client_secret:
            print("❌ Client ID または Client Secret が入力されませんでした。終了します。")
            sys.exit(1)

        client_config = {
            "installed": {
                "client_id": client_id,
                "client_secret": client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": ["http://localhost", "urn:ietf:wg:oauth:2.0:oob"]
            }
        }
        flow = InstalledAppFlow.from_client_config(client_config, scopes=SCOPES)

    print()
    print("ブラウザが開きます。動画をアップロードしたい YouTube チャンネルの")
    print("Google アカウントでログインし、権限を許可してください...")
    print()

    try:
        # ローカルサーバーを起動してブラウザを開く
        creds = flow.run_local_server(port=8088, prompt='consent', access_type='offline')
    except Exception as e:
        print(f"⚠️ ローカルサーバー起動に失敗したため、コンソール認証モードへ切り替えます: {e}")
        creds = flow.run_console()

    print()
    print("=" * 60)
    print("🎉 認証に成功しました！ 以下の情報を GitHub Secrets に登録してください")
    print("=" * 60)
    print()
    print(f"GCP_CLIENT_ID:\n{client_id or creds.client_id}\n")
    print(f"GCP_CLIENT_SECRET:\n{client_secret or creds.client_secret}\n")
    print(f"GCP_REFRESH_TOKEN:\n{creds.refresh_token}\n")
    print("=" * 60)
    print("※ リフレッシュトークンは再表示されませんので、安全な場所に保管・設定してください。")
    print("=" * 60)

if __name__ == '__main__':
    main()
