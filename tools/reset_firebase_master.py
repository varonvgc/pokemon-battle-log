import os
import json
import firebase_admin
from firebase_admin import credentials, firestore

def main():
    print("\n--- Resetting Firebase Master Data ---")
    sa_key_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY")
    if not sa_key_json:
        print("Skipping Firebase reset: FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set.")
        return

    # version.jsonから最新バージョンを読み込む
    version_file = os.path.join(os.path.dirname(__file__), "..", "data", "version.json")
    try:
        with open(version_file, "r", encoding="utf-8") as f:
            vdata = json.load(f)
            static_ver = vdata.get("version", 0)
    except Exception as e:
        print(f"Could not read version.json: {e}")
        return

    try:
        # Firebase Adminの初期化
        cred = credentials.Certificate(json.loads(sa_key_json))
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred)
        
        db = firestore.client()
        
        # shared/master を更新 (overridesをリセット)
        doc_ref = db.collection("shared").document("master")
        doc_ref.set({
            "masterVersion": static_ver,
            "overrides": {},
            "itemOverrides": {},
            "updatedAt": firestore.SERVER_TIMESTAMP
        }, merge=True)
        print(f"Firebase shared/master successfully reset and updated to static version: {static_ver}")
    except Exception as e:
        print(f"Failed to reset Firebase shared/master: {e}")

if __name__ == "__main__":
    main()
