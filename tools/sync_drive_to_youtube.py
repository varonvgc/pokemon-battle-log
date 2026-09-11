#!/usr/bin/env python3
"""
Google Drive から YouTube (限定公開) への自動動画転送スクリプト

1. Firestoreから全ユーザーの sync_status == "pending" の対戦ログレコードを検索
2. created_at (または date) が古い順にソートし、最大5件を取得
3. Google Driveから一時ダウンロード
4. YouTube Data API v3 で限定公開 (unlisted) アップロード
5. Firestoreレコード更新 (video_url -> https://youtu.be/{VIDEO_ID}, sync_status -> "uploaded")
6. Google Driveの元動画ファイルを削除
7. クォータ上限到達時は安全に中断
"""

import os
import sys
import json
import tempfile
import traceback
from datetime import datetime

# Google API
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaFileUpload
from googleapiclient.errors import HttpError

# Firebase
import firebase_admin
from firebase_admin import credentials, firestore

# 定数設定
MAX_DAILY_UPLOADS = 5  # 1日あたりの最大転送件数 (YouTube Quota 10,000 units 安全枠: 1600 units * 5 = 8000 units)
SCOPES = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/drive'
]

def init_google_apis():
    """OAuth 2.0 資格情報から Google Drive & YouTube API クライアントを初期化"""
    client_id = os.environ.get("GCP_CLIENT_ID")
    client_secret = os.environ.get("GCP_CLIENT_SECRET")
    refresh_token = os.environ.get("GCP_REFRESH_TOKEN")

    if not all([client_id, client_secret, refresh_token]):
        raise ValueError("環境変数 GCP_CLIENT_ID, GCP_CLIENT_SECRET, GCP_REFRESH_TOKEN が設定されていません。")

    creds = Credentials(
        None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=SCOPES
    )

    drive_service = build('drive', 'v3', credentials=creds)
    youtube_service = build('youtube', 'v3', credentials=creds)
    return drive_service, youtube_service

def init_firestore():
    """Firebase Admin SDK を初期化して Firestore クライアントを取得"""
    sa_key = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY")
    if not sa_key:
        raise ValueError("環境変数 FIREBASE_SERVICE_ACCOUNT_KEY が設定されていません。")

    try:
        # JSON 文字列またはファイルパスの判定
        if sa_key.strip().startswith("{"):
            key_dict = json.loads(sa_key)
            cred = credentials.Certificate(key_dict)
        else:
            cred = credentials.Certificate(sa_key)

        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred)
        return firestore.client()
    except Exception as e:
        raise RuntimeError(f"Firebase Admin SDK 初期化失敗: {e}")

def fetch_pending_records(db):
    """
    Firestore 全ユーザーの records から sync_status == 'pending' のレコードを抽出し、
    作成日時の昇順 (FIFO: 古い順) でソートして返す
    """
    pending_items = []
    
    # 1. collection_group('data') で全 data/main ドキュメントを走査
    main_docs = []
    try:
        data_query = db.collection_group('data').stream()
        for d in data_query:
            if d.id == 'main':
                main_docs.append(d)
    except Exception as e:
        print(f"⚠️ collection_group 取得警告: {e}")

    # 2. 念のため users コレクションの list_documents() からも走査
    if not main_docs:
        try:
            users_ref = db.collection('users')
            for user_doc in users_ref.list_documents():
                m_doc = user_doc.collection('data').document('main').get()
                if m_doc.exists:
                    main_docs.append(m_doc)
        except Exception as e:
            print(f"⚠️ list_documents 取得警告: {e}")

    print(f"  🔍 対象 Firestore ドキュメント数: {len(main_docs)}")

    for main_doc in main_docs:
        try:
            # users/{uid}/data/main -> uid を取得
            uid = main_doc.reference.parent.parent.id
        except Exception:
            uid = 'unknown'

        data = main_doc.to_dict() or {}
        records = data.get('records', [])
        if not isinstance(records, list):
            continue

        for idx, rec in enumerate(records):
            if not isinstance(rec, dict):
                continue
            
            # sync_status が pending または drive_pending かつ drive_file_id が存在するもの
            if rec.get('sync_status') in ['pending', 'drive_pending'] and rec.get('drive_file_id'):
                # ソート用キーの決定: created_at (数値/文字列) または date
                created_at = rec.get('created_at')
                if not created_at:
                    date_val = rec.get('date', '')
                    try:
                        created_at = int(datetime.fromisoformat(date_val).timestamp() * 1000)
                    except Exception:
                        created_at = 0
                else:
                    try:
                        created_at = int(created_at)
                    except ValueError:
                        created_at = 0

                pending_items.append({
                    'uid': uid,
                    'record_index': idx,
                    'record_id': rec.get('id'),
                    'record': rec,
                    'created_at': created_at
                })

    # 古い順 (昇順) でソート
    pending_items.sort(key=lambda x: x['created_at'])
    return pending_items

def download_drive_file(drive_service, file_id, dest_path):
    """Google Drive から一時ファイルへダウンロード"""
    print(f"  📥 Google Drive からダウンロード中... (File ID: {file_id})")
    request = drive_service.files().get_media(fileId=file_id)
    with open(dest_path, 'wb') as f:
        downloader = MediaIoBaseDownload(f, request, chunksize=1024 * 1024 * 5)
        done = False
        while not done:
            status, done = downloader.next_chunk()
            if status:
                print(f"    ダウンロード進捗: {int(status.progress() * 100)}%")
    print(f"  ✅ ダウンロード完了: {os.path.getsize(dest_path)} bytes")

def create_video_metadata(rec):
    """対戦レコードから YouTube アップロード用のタイトルと概要欄を生成"""
    rec_date = rec.get('date') or datetime.now().strftime('%Y-%m-%d %H:%M')
    result = rec.get('result', '')
    result_str = '【勝利】' if result == 'win' else ('【敗北】' if result == 'lose' else ('【引分】' if result == 'draw' else ''))
    opp = rec.get('oppTrainer')
    opp_str = f" vs {opp}" if opp else ""
    format_str = f"[{rec.get('matchType', 'ランクマ')}]"

    title = f"{format_str} {result_str} ポケモン対戦録画 {opp_str} ({rec_date})"
    if len(title) > 95:
        title = title[:92] + "..."

    description_lines = [
        "ポケモンスカーレット・バイオレット / ポケモン対戦記録動画",
        f"日時: {rec_date}",
        f"形式: {rec.get('matchType', 'ランクマ')} / {rec.get('format', 'bo1').upper()}",
    ]
    if rec.get('regulation'):
        description_lines.append(f"レギュレーション: {rec['regulation']}")
    if rec.get('season'):
        description_lines.append(f"シーズン: {rec['season']}")
    if rec.get('tags'):
        description_lines.append(f"タグ: {', '.join(rec['tags'])}")
    if rec.get('memo'):
        description_lines.append(f"\n■ 対戦メモ:\n{rec['memo']}")
    
    description_lines.append("\n※ この動画は対戦記録アプリより限定公開で自動転送されたアーカイブです。")

    return {
        'snippet': {
            'title': title,
            'description': "\n".join(description_lines),
            'tags': ['Pokemon', 'ポケモン対戦', 'バトルログ'],
            'categoryId': '20'  # 20 = Gaming
        },
        'status': {
            'privacyStatus': 'unlisted',  # 限定公開（URLを知っている人のみ閲覧可能）
            'selfDeclaredMadeForKids': False
        }
    }

def upload_to_youtube(youtube_service, file_path, metadata):
    """YouTube Data API v3 で動画をアップロード (限定公開)"""
    print("  📤 YouTube へアップロード中 (限定公開)...")
    body = metadata
    media = MediaFileUpload(file_path, mimetype='video/mp4', chunksize=1024 * 1024 * 5, resumable=True)

    request = youtube_service.videos().insert(
        part="snippet,status",
        body=body,
        media_body=media
    )

    response = None
    while response is None:
        status, response = request.next_chunk()
        if status:
            print(f"    アップロード進捗: {int(status.progress() * 100)}%")

    video_id = response.get('id')
    print(f"  🎉 YouTube アップロード完了！ Video ID: {video_id}")
    return video_id

def delete_drive_file(drive_service, file_id):
    """Google Drive からファイルを削除"""
    print(f"  🗑️ Google Drive からファイル削除中... (File ID: {file_id})")
    try:
        drive_service.files().delete(fileId=file_id).execute()
        print("  ✅ Google Drive のファイル削除完了")
    except Exception as e:
        print(f"  ⚠️ Google Drive のファイル削除に失敗しました (手動削除推奨): {e}")

def update_firestore_record(db, uid, record_id, youtube_video_id):
    """Firestore の該当レコードを更新"""
    main_doc_ref = db.collection('users').document(uid).collection('data').document('main')
    main_doc = main_doc_ref.get()
    if not main_doc.exists:
        print(f"  ⚠️ ユーザー {uid} の main ドキュメントが存在しません")
        return

    data = main_doc.to_dict()
    records = data.get('records', [])
    updated = False

    for rec in records:
        if isinstance(rec, dict) and rec.get('id') == record_id:
            rec['video_url'] = f"https://youtu.be/{youtube_video_id}"
            rec['youtube_video_id'] = youtube_video_id
            rec['sync_status'] = 'uploaded'
            rec['synced_at'] = int(datetime.now().timestamp() * 1000)
            updated = True
            break

    if updated:
        main_doc_ref.update({
            'records': records,
            'updatedAt': firestore.SERVER_TIMESTAMP
        })
        print(f"  ✅ Firestore レコード更新完了 (Record ID: {record_id})")
    else:
        print(f"  ⚠️ レコード ID {record_id} が見つかりませんでした")

def main():
    print("=" * 60)
    print("🚀 Google Drive ➔ YouTube 自動転送バッチ開始")
    print(f"実行時刻: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # 1. 各種クライアント初期化
    try:
        drive_service, youtube_service = init_google_apis()
        db = init_firestore()
    except Exception as e:
        print(f"❌ 初期化エラー: {e}")
        sys.exit(1)

    # 2. 待機中 (pending) のレコードを取得
    pending_items = fetch_pending_records(db)
    print(f"📋 転送待機中の動画総数: {len(pending_items)} 件")

    if not pending_items:
        print("✨ 転送対象の動画はありませんでした。処理を終了します。")
        return

    # 今回処理する対象（最大5件）
    targets = pending_items[:MAX_DAILY_UPLOADS]
    print(f"🎯 本日転送対象: {len(targets)} 件 (上限: {MAX_DAILY_UPLOADS} 件/日)")
    print()

    success_count = 0

    for i, item in enumerate(targets, 1):
        uid = item['uid']
        rec = item['record']
        record_id = item['record_id']
        drive_file_id = rec.get('drive_file_id')

        print(f"[{i}/{len(targets)}] レコード処理中 (ID: {record_id}, User: {uid})")

        temp_video_path = None
        try:
            # 一時ファイル作成
            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as temp_file:
                temp_video_path = temp_file.name

            # Google Drive からダウンロード
            download_drive_file(drive_service, drive_file_id, temp_video_path)

            # YouTube メタデータ作成
            metadata = create_video_metadata(rec)

            # YouTube アップロード
            youtube_video_id = upload_to_youtube(youtube_service, temp_video_path, metadata)

            # Firestore 更新
            update_firestore_record(db, uid, record_id, youtube_video_id)

            # Google Drive 元動画削除
            delete_drive_file(drive_service, drive_file_id)

            success_count += 1
            print(f"  ✨ 転送パイプライン完了: https://youtu.be/{youtube_video_id}")
            print()

        except HttpError as err:
            err_content = err.content.decode('utf-8', errors='ignore') if hasattr(err, 'content') else str(err)
            print(f"❌ Google API エラー: {err_content}")
            # クォータ上限エラー判定
            if "quotaExceeded" in err_content or "uploadLimitExceeded" in err_content or err.resp.status in (403, 429):
                print("🛑 YouTube API のクォータ上限に達しました。バッチを安全に中断し、残りは明日実行します。")
                break
            else:
                print(f"⚠️ この動画の転送をスキップして次へ進みます。")
        except Exception as e:
            print(f"❌ 予期せぬエラー: {e}")
            traceback.print_exc()
            print(f"⚠️ この動画の転送をスキップして次へ進みます。")
        finally:
            # 一時ファイル削除
            if temp_video_path and os.path.exists(temp_video_path):
                try:
                    os.remove(temp_video_path)
                except Exception:
                    pass

    print("=" * 60)
    print(f"🏁 バッチ処理完了: 成功 {success_count} / 対象 {len(targets)} 件")
    print("=" * 60)

if __name__ == '__main__':
    main()
