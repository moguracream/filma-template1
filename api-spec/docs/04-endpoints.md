# エンドポイント
### パラメーター表記について

各エンドポイントのパラメーターテーブルで使用される記号の意味：

| 記号 | 意味 | 説明 |
|---|---|---|
| ✓ | 必須 | 必ず指定が必要なパラメーター |
| * | 認証必須 | 認証のため必要だが、複数の認証方法のうちいずれか1つを指定 |
| - | 任意 | 省略可能なパラメーター |

**認証パラメーターについて:**

- `api_key`と`jwt`は両方とも「\*」（認証必須）ですが、**どちらか一方のみ**指定すれば認証されます
- 両方を同時に指定した場合は、[認証方法の優先順位](02-authentication.md)に従って処理されます
- 認証ヘッダーまたはCookieを使用する場合は、対応するクエリパラメーターは不要です：
    - `Authorization: Bearer`ヘッダー使用時 → `jwt`パラメーター不要
    - `X-Api-Key`ヘッダー使用時 → `api_key`パラメーター不要
    - `filmajwt` Cookie使用時 → `jwt`パラメーター不要

### JWT認証API

JWTトークンの発行・情報取得・更新を行います。

#### JWTトークン発行

```
POST /filmaapi/token
```

APIキーを使用してJWTトークンを発行します。発行されたJWTトークンは、JSONレスポンスで返却されると同時に、HTTPS環境では自動的にCookieとしても設定されます。

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| api_key | string | * | - | APIキー（X-Api-Keyヘッダーまたはクエリパラメータで指定） |
| expires_in | integer | - | 3600 | JWT有効期限（秒）。最大7日間（604800秒） |
| jwt_expires_at | string | - | - | JWT有効期限をISO 8601形式で指定（expires_inより優先） |
| mediafile_id | integer | - | - | 特定のメディアファイルに限定したJWT発行（セキュリティ強化） |

**認証:** APIキー認証（X-Api-Keyヘッダーまたは`api_key`クエリ）

**リクエスト例:**

**ヘッダー認証（推奨）**
```bash
curl -X POST "https://filma.biz/filmaapi/token" \
  -H "X-Api-Key: e47aad55d7fb4f152603b91b" \
  -H "Content-Type: application/json"
```

**クエリパラメータ認証**
```bash
curl -X POST "https://filma.biz/filmaapi/token?api_key=e47aad55d7fb4f152603b91b" \
  -H "Content-Type: application/json"
```

**メディアファイル固有JWT発行**
```bash
curl -X POST "https://filma.biz/filmaapi/token" \
  -H "X-Api-Key: e47aad55d7fb4f152603b91b" \
  -H "Content-Type: application/json" \
  -d '{"mediafile_id": 12345, "expires_in": 7200}'
```

**レスポンス例:**

**成功時（HTTP 200）**
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...signature",
  "token_type": "Bearer",
  "expires_in": 7200,
  "expires_at": 1703928000,
  "user_id": 1,
  "organization_id": 1,
  "api_type": "readonly",
  "mediafile_id": 12345
}
```

**JWTペイロード構造:**

発行されたJWTトークンには以下の情報が含まれます：

```json
{
  "user_id": 1,
  "api_type": "readonly",
  "auth_method": "api_key",
  "mediafile_id": 12345,
  "iat": 1703920800,
  "exp": 1703928000
}
```

| フィールド名 | 型 | 説明 |
|---|---|---|
| user_id | integer | ユーザーID |
| api_type | string | API権限レベル（readonly, fullaccess） |
| auth_method | string | 認証方法（api_key, session_login, jwt_refresh等） |
| mediafile_id | integer \| null | メディアファイル固有JWT時のファイルID。指定時はそのファイルのみアクセス可能 |
| iat | integer | トークン発行時刻（UnixTimestamp） |
| exp | integer | トークン有効期限（UnixTimestamp） |

**メディアファイル固有JWT:**

- `mediafile_id`を指定してJWTを発行した場合、そのJWTは指定されたメディアファイルのみアクセス可能
- ストリーミングやプレイヤーアクセス時に、JWTのmediafile_idとリクエストされたファイルIDが一致しない場合は基本的に403エラー
- 例外として、DASHストリーミングでは「同一親メディア配下の音声」「同一解像度の動画」に限り別IDのアクセスを許可
- セキュリティ強化により不正なアクセスを防止

**JWTトークンCookie設定（HTTPS環境でのみ）:**
```
Set-Cookie: filmajwt=eyJhbGciOiJIUzI1NiJ9...; Expires=Mon, 01 Jan 2024 12:00:00 GMT; Path=/; Secure; HttpOnly; SameSite=Lax
```

**Cookieの特徴:**

- **自動設定**: JWTトークン発行時にHTTPS環境で自動的にCookieが設定される
- **セキュリティ**: `HttpOnly`でJavaScriptからのアクセスを防止
- **SameSite=Lax**: 外部サイトからのGETリクエストを許可、POSTリクエストを保護
- **期限**: JWTトークンと同じ有効期限
- **利便性**: 次回以降のAPIアクセスでCookie認証が利用可能

**SameSite=Laxの動作:**

- **同一サイト**: 全てのリクエストでCookieが送信される
- **外部サイト（GET）**: 動画プレイヤーや埋め込みコンテンツでCookieが送信される
- **外部サイト（POST）**: CSRF攻撃を防止するため、Cookieは送信されない
- **スクリプトからのアクセス**: curl、Python、Node.js等では制限なし

**エラー時（HTTP 401）:**
```json
{
  "error": "api_key_authentication_failed",
  "message": "API認証に失敗しました"
}
```

#### JWTトークン情報取得

```
GET /filmaapi/token
```

現在のJWTトークンの情報を取得します。

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| jwt | string | * | - | JWTトークン（Authorizationヘッダー、Cookie、またはクエリで指定） |

**認証:** JWT認証、またはCookie認証

**リクエスト例:**

```bash
curl -H "Authorization: Bearer <jwt_token>" \
  "https://filma.biz/filmaapi/token"
```

**レスポンス例:**

**成功時（HTTP 200）**
```json
{
  "user_id": 1,
  "organization_id": 1,
  "api_type": "readonly",
  "expires_at": 1704007200,
  "issued_at": 1703920800,
  "is_valid": true,
  "time_remaining": 86400
}
```

#### JWTトークンリフレッシュ

```
POST /filmaapi/token/refresh
```

有効なJWTトークンを使用して新しいトークンを発行します。

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| jwt | string | * | - | 現在のJWTトークン（Authorizationヘッダー、Cookie、またはクエリで指定） |
| expires_in | integer | - | 3600 | 新しいJWT有効期限（秒）。最大7日間（604800秒） |

**認証:** JWT認証、またはCookie認証

**リクエスト例:**

```bash
curl -X POST "https://filma.biz/filmaapi/token/refresh" \
  -H "Authorization: Bearer <current_jwt_token>" \
  -H "Content-Type: application/json"
```

**レスポンス例:**

**成功時（HTTP 200）**
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...new_signature",
  "token_type": "Bearer",
  "expires_in": 3600,
  "expires_at": 1703924400,
  "user_id": 1,
  "organization_id": 1,
  "api_type": "readonly"
}
```

### Storage API

ファイルの管理と配信を行います。

#### 共通パラメータ

**jwt_expires_at パラメータについて:**

`jwt_expires_at`パラメータは、API応答で返されるプレイヤーURLや埋め込みコードに使用されるJWTトークンの有効期限を指定するためのパラメータです。

| 項目 | 説明 |
|---|---|
| **形式** | ISO 8601形式の日時文字列（例：`2024-12-31T23:59:59Z`） |
| **目的** | 生成されるJWTトークンの有効期限を制御 |
| **デフォルト値** | 未指定時は現在時刻+1時間 |
| **使用場面** | プレイヤーURL、埋め込みコード生成時 |

**使用例:**

```bash
# 2024年12月31日 23:59:59 UTC まで有効なJWTを含むプレイヤーURLを生成
curl -H "X-Api-Key: your_api_key" \
  "https://filma.biz/filmaapi/storage/12345?jwt_expires_at=2024-12-31T23:59:59Z"
```

**動作:**

- 指定された日時まで有効なJWTトークンが自動生成される
- 生成されたJWTは該当メディアファイル専用（mediafile_id付き）
- プレイヤーURLと埋め込みコードに含まれるすべてのJWTトークンに適用
- 無効な日時形式の場合は400エラー

**注意事項:**

- 過去の日時を指定した場合、即座に期限切れとなる
- 最大有効期限は7日間（システム制限）
- JWTトークンの有効期限はストリーミング再生時間を考慮して設定することを推奨

#### 共通レスポンス項目

##### ユーザーメタデータ

Filma APIでは、管理画面で入力されたカスタムメタデータを `user_metadata` フィールドとして取得できます。

**メタデータの構造:**

```json
// メタデータが設定されている場合
{
  "user_metadata": {
    "tags": ["製品紹介", "プロモーション", "2024年春"],
    "category": "マーケティング"
  }
}

// 一部のメタデータのみ設定されている場合
{
  "user_metadata": {
    "tags": ["企業紹介"],
    "category": null
  }
}

// メタデータが未設定の場合
{
  "user_metadata": {}
}
```

**基本フィールド:**

- **`tags`**: タグの配列（未設定時は `null`）
- **`category`**: カテゴリ（未設定時は `null`）

**未設定時の動作:**

- **`user_metadata` 自体が未設定の場合**: 空のオブジェクト `{}` を返す
- **`tags` が未設定の場合**: `null` を返す
- **`category` が未設定の場合**: `null` を返す

**拡張性:**

`user_metadata` は管理画面で追加されたすべてのカスタムメタデータを自動的に含むため、将来的に新しいメタデータフィールドが追加されても、APIコードの変更なしに自動的に対応されます。

#### ファイル一覧取得

```
GET /filmaapi/storage
```

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |
| page | integer | - | 1 | ページ番号 |
| per_page | integer | - | 20 | 1ページあたりの件数（最大100） |
| folder_id | integer | - | - | フォルダID（指定時は該当フォルダのファイルのみ取得） |
| tags | string \| array | - | - | タグフィルタリング（指定時は該当タグを含むファイルのみ取得） |
| category | string | - | - | カテゴリフィルタリング（指定時は該当カテゴリのファイルのみ取得） |
| show_all | boolean | - | false | 全ファイル表示フラグ（fullaccess権限のみ有効） |

**認証:** APIキー認証、JWT認証、またはCookie認証のいずれか

**注意:**

- デフォルトでは公開されたファイルのみ取得
- `show_all=true`かつfullaccess権限の場合、非公開ファイルも含めて全ファイル取得

**フィルタリング機能:**

- **タグフィルタリング**: `tags`パラメータで指定されたタグのいずれかを含むファイルを取得
      - 単一タグ: `?tags=製品紹介`
      - 複数タグ: `?tags[]=製品紹介&tags[]=プロモーション`
- **カテゴリフィルタリング**: `category`パラメータで指定されたカテゴリのファイルを取得
      - 例: `?category=マーケティング`
- **複合フィルタリング**: タグとカテゴリを組み合わせてフィルタリング可能
      - 例: `?tags=製品紹介&category=マーケティング`

**レスポンス例:**

```json
{
  "items": [
    {
      "id": 12345,
      "filename": "sample_video.mp4",
      "mediafile_id": 12345,
      "folder_id": 100,
      "folder_name": "動画フォルダ",
      "created_at": "2024-01-01T10:00:00Z",
      "updated_at": "2024-01-01T10:00:00Z",
      "creator": "山田太郎",
      "updater": "山田太郎",
      "published": true,
      "published_until": "2024-12-31T23:59:00Z",
      "published_with_expiry": true,
      "published_status_text": "公開（2024/12/31 23:59まで）",
      "drm": true,
      "screen_shots": [
        "https://example.com/storage/screenshot1.jpg",
        "https://example.com/storage/screenshot2.jpg",
        "https://example.com/storage/screenshot3.jpg"
      ],
      "user_metadata": {
        "tags": ["製品紹介", "プロモーション", "2024年春"],
        "category": "マーケティング"
      }
    }
  ],
  "pagination": {
    "current_page": 1,
    "per_page": 20,
    "total_count": 150,
    "total_pages": 8
  }
}
```

**レスポンスフィールド詳細:**

| フィールド名 | 型 | 説明 |
|---|---|---|
| items | array | ファイル情報の配列 |
| items[].id | integer | ファイルの一意識別子 |
| items[].filename | string | ファイル名 |
| items[].mediafile_id | integer | メディアファイルID（プレイヤーやストリーミングで使用） |
| items[].folder_id | integer | 所属フォルダのID |
| items[].folder_name | string | 所属フォルダの名前 |
| items[].created_at | string | ファイル作成日時（ISO 8601形式） |
| items[].updated_at | string | ファイル更新日時（ISO 8601形式） |
| items[].creator | string | ファイル作成者名 |
| items[].updater | string | ファイル更新者名 |
| items[].published | boolean | 公開状態（true: 公開設定, false: 非公開設定） |
| items[].published_until | string \| null | 公開期限（ISO 8601形式、nullの場合は期限なし） |
| items[].published_with_expiry | boolean | 公開期限を考慮した実際の公開状態 |
| items[].published_status_text | string | 公開状態の表示文字列（「公開」「公開（期限付き）」「公開期限切れ」「非公開」） |
| items[].drm | boolean | DRM有無（メディアファイルまたは派生ファイルにDRMが含まれる場合はtrue） |
| items[].screen_shots | array | スクリーンショット画像のURL配列 |
| items[].user_metadata | object | 管理画面で入力されたカスタムメタデータ（未設定時は空オブジェクト `{}`） |
| items[].user_metadata.tags | array \| null | タグの配列（未設定時は `null`） |
| items[].user_metadata.category | string \| null | カテゴリ（未設定時は `null`） |
| pagination | object | ページング情報 |
| pagination.current_page | integer | 現在のページ番号 |
| pagination.per_page | integer | 1ページあたりの件数 |
| pagination.total_count | integer | 総ファイル数 |
| pagination.total_pages | integer | 総ページ数 |

#### ファイル再生情報取得

```
GET /filmaapi/storage/{id}
```

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |
| id | integer | ✓ | - | ファイルID |
| show_all | boolean | - | false | 全ファイル表示フラグ（fullaccess権限のみ有効） |
| jwt_expires_at | string | - | 現在時刻+1時間 | 生成されるJWTトークンの有効期限をISO 8601形式で指定 |

**認証:** APIキー認証、JWT認証、またはCookie認証のいずれか

**注意:**

- デフォルトでは公開されたファイルのみアクセス可能
- `show_all=true`かつfullaccess権限の場合、非公開ファイルもアクセス可能

**レスポンス例:**

```json
{
  "url": "https://example.com/filmaapi/player/12345?jwt=eyJhbGciOiJIUzI1NiJ9...",
  "embed_code": "<script src=\"https://example.com/dash_player/js/xcream_player.min.js\"></script>\n<link rel=\"stylesheet\" type=\"text/css\" href=\"https://example.com/dash_player/css/style.css\">\n<div id=\"video-12345\" class=\"filma-video\" data-drm=\"true\" style=\"width: 100%;\"></div>\n<script>\n  document.addEventListener('DOMContentLoaded', function() {\n    let elem = document.getElementById('video-12345');\n    if (elem == null) {\n      return;\n    }\n    if (isSafari()) {\n      elem.dataset.src = 'https://example.com/filmaapi/hls/12345.m3u8?jwt=eyJhbGciOiJIUzI1NiJ9...';\n    } else {\n      elem.dataset.src = 'https://example.com/filmaapi/dash/12345.mpd?jwt=eyJhbGciOiJIUzI1NiJ9...';\n    }\n    init_xcream_player('video-12345');\n  });\n</script>",
  "simple_embed_code": "<div id=\"video-12345\" class=\"filma-video\" data-drm=\"true\" style=\"width: 100%;\"></div>",
  "mediafile_id": 12345,
  "drm": true,
  "screen_shots": [
    "https://example.com/storage/screenshot1.jpg",
    "https://example.com/storage/screenshot2.jpg",
    "https://example.com/storage/screenshot3.jpg"
  ],
  "user_metadata": {
    "tags": ["製品紹介", "プロモーション", "2024年春"],
    "category": "マーケティング"
  }
}
```

**レスポンスフィールド詳細:**

| フィールド名 | 型 | 説明 |
|---|---|---|
| url | string | プレイヤーページのURL（JWTトークン付き） |
| embed_code | string | 完全なHTMLプレイヤー埋め込みコード（JS/CSS込み） |
| simple_embed_code | string | シンプルなHTML埋め込みコード（JS/CSSは別途読み込みが必要） |
| mediafile_id | integer | エンコード済みファイルの識別子 |
| drm | boolean | DRM有無（メディアファイルまたは派生ファイルにDRMが含まれる場合はtrue） |
| screen_shots | array | スクリーンショット画像のURL配列 |
| user_metadata | object | 管理画面で入力されたカスタムメタデータ（未設定時は空オブジェクト `{}`） |
| user_metadata.tags | array \| null | タグの配列（未設定時は `null`） |
| user_metadata.category | string \| null | カテゴリ（未設定時は `null`） |

**補足:**

- `url` / `embed_code` / `simple_embed_code` に含まれるJWTは **mediafile_id付き** で発行されます

**完全な埋め込みコード（embed_code）**: スクリプトとCSSが含まれているため、そのままページに貼り付けるだけで動作します。

**シンプルな埋め込みコード（simple_embed_code）**: HTMLの`<div>`要素のみです。以下のJavaScriptとCSSを別途HTMLに読み込む必要があります：

```html
<script src="https://filma.biz/dash_player/js/xcream_player.min.js"></script>
<link rel="stylesheet" type="text/css" href="https://filma.biz/dash_player/css/style.css">
<script>
  // 初期化処理
  document.addEventListener('DOMContentLoaded', function() {
    init_xcream_player('video-12345'); // video-{mediafile_id}を指定
  });
</script>
```

**JWT認証について**: 生成されるプレイヤーURLと埋め込みコードには、リクエストした時点でのユーザー権限に基づいた専用JWTトークンが含まれます。このJWTは該当メディアファイルのみアクセス可能で、セキュリティが強化されています。

#### ファイルメタデータ取得

```
GET /filmaapi/storage/metadata/{id}
```

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |
| id | integer | ✓ | - | ファイルID |
| show_all | boolean | - | false | 全ファイル表示フラグ（fullaccess権限のみ有効） |
| jwt_expires_at | string | - | 現在時刻+1時間 | 生成されるJWTトークンの有効期限をISO 8601形式で指定 |

**認証:** APIキー認証、JWT認証、またはCookie認証のいずれか

**注意:**

- デフォルトでは公開されたファイルのみアクセス可能
- `show_all=true`かつfullaccess権限の場合、非公開ファイルもアクセス可能

**レスポンス例:**

```json
{
  "id": 12345,
  "mediafile_id": 12345,
  "name": "sample_video.mp4",
  "folder_id": 100,
  "folder_name": "動画フォルダ",
  "created_at": "2024-01-01T10:00:00Z",
  "updated_at": "2024-01-01T10:00:00Z",
  "creator": "山田太郎",
  "updater": "山田太郎",
  "published": true,
  "published_until": "2024-12-31T23:59:00Z",
  "published_with_expiry": true,
  "published_status_text": "公開（2024/12/31 23:59まで）",
  "drm": true,
  "screen_shots": [
    "https://example.com/storage/screenshot1.jpg",
    "https://example.com/storage/screenshot2.jpg",
    "https://example.com/storage/screenshot3.jpg"
  ],
  "user_metadata": {
    "tags": ["製品紹介", "プロモーション", "2024年春"],
    "category": "マーケティング"
  },
  "player_data": [
     {
       "mediafile_id": 67890,
       "resolution_string": "HD 1280x720",
       "filesize_megabyte": 150.5,
       "bitrate_human": "2.5 Mbps",
       "drm": true,
       "player_url": "https://example.com/filmaapi/player/67890?jwt=eyJhbGciOiJIUzI1NiJ9...",
       "player_embedding_html": "<script src=\"https://example.com/dash_player/js/xcream_player.min.js\"></script>\n<link rel=\"stylesheet\" type=\"text/css\" href=\"https://example.com/dash_player/css/style.css\">\n<div id=\"video-67890\" class=\"filma-video\" data-drm=\"true\" style=\"width: 100%;\"></div>\n<script>\n  document.addEventListener('DOMContentLoaded', function() {\n    let elem = document.getElementById('video-67890');\n    if (elem == null) {\n      return;\n    }\n    if (isSafari()) {\n      elem.dataset.src = 'https://example.com/filmaapi/hls/67890.m3u8?jwt=eyJhbGciOiJIUzI1NiJ9...';\n    } else {\n      elem.dataset.src = 'https://example.com/filmaapi/dash/67890.mpd?jwt=eyJhbGciOiJIUzI1NiJ9...';\n    }\n    init_xcream_player('video-67890');\n  });\n</script>",
       "player_embedding_html_simple": "<div id=\"video-67890\" class=\"filma-video\" data-drm=\"true\" style=\"width: 100%;\"></div>",
       "screen_shots": [
         "https://example.com/storage/screenshot1.jpg",
         "https://example.com/storage/screenshot2.jpg",
         "https://example.com/storage/screenshot3.jpg"
       ]
     }
   ]
}
```

**レスポンスフィールド詳細:**

| フィールド名 | 型 | 説明 |
|---|---|---|
| id | integer | ファイルの一意識別子 |
| mediafile_id | integer | メディアファイルID（プレイヤーやストリーミングで使用） |
| name | string | ファイル名 |
| folder_id | integer | 所属フォルダのID |
| folder_name | string | 所属フォルダの名前 |
| created_at | string | ファイル作成日時（ISO 8601形式） |
| updated_at | string | ファイル更新日時（ISO 8601形式） |
| creator | string | ファイル作成者名 |
| updater | string | ファイル更新者名 |
| published | boolean | 公開状態（true: 公開設定, false: 非公開設定） |
| published_until | string \| null | 公開期限（ISO 8601形式、nullの場合は期限なし） |
| published_with_expiry | boolean | 公開期限を考慮した実際の公開状態 |
| published_status_text | string | 公開状態の表示文字列（「公開」「公開（期限付き）」「公開期限切れ」「非公開」） |
| drm | boolean | DRM有無（メディアファイルまたは派生ファイルにDRMが含まれる場合はtrue） |
| screen_shots | array | ファイル全体のスクリーンショット画像URL配列 |
| user_metadata | object | 管理画面で入力されたカスタムメタデータ（未設定時は空オブジェクト `{}`） |
| user_metadata.tags | array \| null | タグの配列（未設定時は `null`） |
| user_metadata.category | string \| null | カテゴリ（未設定時は `null`） |
| player_data | array | エンコード済みファイル（解像度別）の情報配列 |
| player_data[].mediafile_id | integer | エンコード済みファイルのメディアファイルID |
| player_data[].resolution_string | string | 解像度の表示文字列（例：「HD 1280x720」） |
| player_data[].filesize_megabyte | number | ファイルサイズ（MB） |
| player_data[].bitrate_human | string | ビットレートの人間が読める形式（例：「2.5 Mbps」） |
| player_data[].drm | boolean | DRM有無（該当メディアファイルのDRM状態） |
| player_data[].player_url | string | 該当解像度ファイルのプレイヤーページURL（JWTトークン付き） |
| player_data[].player_embedding_html | string | 該当解像度ファイル用の完全な埋め込みHTMLコード（JS/CSS込み） |
| player_data[].player_embedding_html_simple | string | 該当解像度ファイル用のシンプルな埋め込みHTMLコード（JS/CSSは別途読み込みが必要） |
| player_data[].screen_shots | array | 該当解像度ファイルのスクリーンショット画像URL配列 |

**player_dataについて:**

- `player_data[].player_url` / `player_data[].player_embedding_html` に含まれるJWTは **mediafile_id付き** で発行されます
- 音声のみのファイルは含まれません
- 動画ファイルのみが対象となります
- 解像度の低い順から配列に格納されます

#### ストレージ情報取得

```
GET /filmaapi/storage/metadata
```

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |

**認証:** APIキー認証、JWT認証、またはCookie認証のいずれか

**レスポンス:**
```json
[]
```

*注: 現在は空の配列を返します。*

#### メタデータオプション取得

```
GET /filmaapi/storage/metadata_options
```

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |
| show_all | boolean | - | false | 全ファイル表示フラグ（fullaccess権限のみ有効） |

**認証:** APIキー認証、JWT認証、またはCookie認証のいずれか

**注意:**

- デフォルトでは公開されたファイルのみ対象
- `show_all=true`かつfullaccess権限の場合、非公開ファイルも含めて全ファイル対象
- メタデータが設定されているファイルのみを対象として集計

**レスポンス例:**

```json
{
  "total_files_with_metadata": 25,
  "metadata_keys": {
    "tags": {
      "count": 15,
      "unique_values": ["製品紹介", "プロモーション", "企業紹介", "2024年春", "マーケティング"],
      "total_unique_values": 5
    },
    "category": {
      "count": 12,
      "unique_values": ["マーケティング", "教育", "エンターテイメント", "技術"],
      "total_unique_values": 4
    },
    "priority": {
      "count": 8,
      "unique_values": ["高", "中", "低"],
      "total_unique_values": 3
    },
    "department": {
      "count": 6,
      "unique_values": ["営業部", "マーケティング部", "開発部"],
      "total_unique_values": 3
    }
  }
}
```

**レスポンスフィールド詳細:**

| フィールド名 | 型 | 説明 |
|---|---|---|
| total_files_with_metadata | integer | メタデータが設定されているファイルの総数 |
| metadata_keys | object | 動的に収集されたメタデータキーの詳細情報 |
| metadata_keys.{key} | object | 各メタデータキーの詳細情報 |
| metadata_keys.{key}.count | integer | そのキーが使用されているファイル数 |
| metadata_keys.{key}.unique_values | array | そのキーのユニークな値の配列（アルファベット順） |
| metadata_keys.{key}.total_unique_values | integer | そのキーのユニークな値の総数 |

#### フォルダ一覧取得

```
GET /filmaapi/storage/folders
```

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |

**認証:** APIキー認証、JWT認証、またはCookie認証のいずれか

**レスポンス例:**

```json
[
  {
    "id": 100,
    "name": "動画フォルダ",
    "created_at": "2024-01-01T10:00:00Z",
    "updated_at": "2024-01-01T10:00:00Z",
    "creator": "山田太郎",
    "updater": "山田太郎"
  },
  {
    "id": 101,
    "name": "教育動画",
    "created_at": "2024-01-02T11:00:00Z",
    "updated_at": "2024-01-02T11:00:00Z",
    "creator": "佐藤花子",
    "updater": "佐藤花子"
  }
]
```

**レスポンスフィールド詳細:**

| フィールド名 | 型 | 説明 |
|---|---|---|
| id | integer | フォルダの一意識別子 |
| name | string | フォルダ名 |
| created_at | string | フォルダ作成日時（ISO 8601形式） |
| updated_at | string | フォルダ更新日時（ISO 8601形式） |
| creator | string | フォルダ作成者名 |
| updater | string | フォルダ更新者名 |

#### フォルダ詳細取得

```
GET /filmaapi/storage/folders/{id}
```

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |
| id | integer | ✓ | - | フォルダID |

**認証:** APIキー認証、JWT認証、またはCookie認証のいずれか

**レスポンス例:**

```json
{
  "id": 100,
  "name": "動画フォルダ",
  "created_at": "2024-01-01T10:00:00Z",
  "updated_at": "2024-01-01T10:00:00Z",
  "creator": "山田太郎",
  "updater": "山田太郎"
}
```

**レスポンスフィールド詳細:**

| フィールド名 | 型 | 説明 |
|---|---|---|
| id | integer | フォルダの一意識別子 |
| name | string | フォルダ名 |
| created_at | string | フォルダ作成日時（ISO 8601形式） |
| updated_at | string | フォルダ更新日時（ISO 8601形式） |
| creator | string | フォルダ作成者名 |
| updater | string | フォルダ更新者名 |

#### ファイルアップロード（未実装）

```
POST /filmaapi/storage
```

**権限:** fullaccess権限が必要

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |

*注: 現在未実装です。*

#### ファイル削除

```
DELETE /filmaapi/storage/{id}
```

**権限:** fullaccess権限が必要

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |
| id | integer | ✓ | - | ファイルID |

**認証:** APIキー認証、JWT認証、またはCookie認証のいずれか

**レスポンス例:**

```json
{
  "id": 12345,
  "status": "deleted",
  "filename": "sample_video.mp4"
}
```

**レスポンスフィールド詳細:**

| フィールド名 | 型 | 説明 |
|---|---|---|
| id | integer | 削除されたファイルの識別子 |
| status | string | 削除ステータス（常に「deleted」） |
| filename | string | 削除されたファイル名 |

**削除について:**

- 削除されたファイルは、通常のAPI呼び出しでは取得できなくなります
- 削除されたファイルは、配信対象外として扱われます

### Encode API（未実装）

動画エンコーディングの管理を行います。

*注: 以下のエンドポイントは現在未実装です。*

#### エンコード状況取得

```
GET /filmaapi/encode/{id}
```

**権限:** fullaccess権限が必要

#### エンコード開始

```
POST /filmaapi/encode
```

**権限:** fullaccess権限が必要

#### エンコード削除

```
DELETE /filmaapi/encode/{id}
```

**権限:** fullaccess権限が必要

### Player API

動画プレイヤーの表示を行います。

#### プレイヤー表示

```
GET /filmaapi/player/{id}
```

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |
| id | integer | ✓ | - | エンコードファイルID |
| show_all | boolean | - | false | 全ファイル表示フラグ（fullaccess権限のみ有効） |

**認証:** APIキー認証、JWT認証、またはCookie認証のいずれか

**エンコードファイルIDについて:**

- `GET /filmaapi/storage/{id}`の`mediafile_id`フィールドで取得可能
- ファイルメタデータ取得の`player_data[].player_url`からも確認可能

**レスポンス:**

- HTMLプレイヤー画面

**注意:**

- デフォルトでは公開されたファイルのみアクセス可能
- `show_all=true`かつfullaccess権限の場合、非公開ファイルもアクセス可能

### DASH API

DASH形式での動画配信を行います。

#### DASH配信

```
GET /filmaapi/dash/{id}.mpd
```

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |
| id | integer | ✓ | - | エンコードファイルID |
| show_all | boolean | - | false | 全ファイル表示フラグ（fullaccess権限のみ有効） |

**認証:** APIキー認証、JWT認証、またはCookie認証のいずれか

**エンコードファイルIDについて:**

- `GET /filmaapi/storage/{id}`の`mediafile_id`フィールドで取得可能
- ファイルメタデータ取得の`player_data[].player_url`からも確認可能

**注意:**

- デフォルトでは公開されたファイルのみアクセス可能
- `show_all=true`かつfullaccess権限の場合、非公開ファイルもアクセス可能

### HLS API

HLS形式での動画配信を行います。

#### HLS配信

```
GET /filmaapi/hls/{id}.m3u8
```

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |
| id | integer | ✓ | - | エンコードファイルID |
| show_all | boolean | - | false | 全ファイル表示フラグ（fullaccess権限のみ有効） |

**認証:** APIキー認証、JWT認証、またはCookie認証のいずれか

#### HLSメディア配信

```
GET /filmaapi/hls/media/{id}.m3u8
```

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |
| id | integer | ✓ | - | エンコードファイルID |
| show_all | boolean | - | false | 全ファイル表示フラグ（fullaccess権限のみ有効） |

**認証:** APIキー認証、JWT認証、またはCookie認証のいずれか

#### HLSヘッダー取得

```
HEAD /filmaapi/hls/{id}.m3u8
```

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |
| id | integer | ✓ | - | エンコードファイルID |
| show_all | boolean | - | false | 全ファイル表示フラグ（fullaccess権限のみ有効） |

**認証:** APIキー認証、JWT認証、またはCookie認証のいずれか

**エンコードファイルIDについて（HLS API共通）:**

- `GET /filmaapi/storage/{id}`の`mediafile_id`フィールドで取得可能
- ファイルメタデータ取得の`player_data[].player_url`からも確認可能

**注意（HLS API共通）:**

- デフォルトでは公開されたファイルのみアクセス可能
- `show_all=true`かつfullaccess権限の場合、非公開ファイルもアクセス可能

### DRMライセンス API

DRM（Widevine/FairPlay/PlayReady）ライセンスの取得を行います。
Filma APIキー認証またはJWT認証が必要です。

**JWTのmediafile_idについて（DRMライセンス共通）:**

- JWTに`mediafile_id`が含まれている場合は、原則として同一IDのメディアのみ許可されます
- ただし、親メディアのJWTは同一親配下のDASH子メディアに限り許可されます
- 子メディアのJWTは音声トラックは常に許可され、動画は同一解像度のみ許可されます

#### Widevineライセンス

```
POST /filmaapi/license/widevine
```

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |

**リクエストボディ:**

- Widevineライセンス要求（バイナリ）
- 証明書要求も同じエンドポイントで処理されます

**レスポンス:**

- ライセンス（バイナリ）

**注意:**

- 認証情報（api_key / jwt）を付与しない場合は401になります

#### FairPlayライセンス（FPS）

```
POST /filmaapi/license/fps
```

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| KID | string | ✓ | - | キーID |
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |

**リクエストボディ:**

- `spc`（フォーム形式）を送信します

**レスポンス:**

- CKC（バイナリ）

**注意:**

- 認証情報（api_key / jwt）を付与しない場合は401になります
- KID未指定の場合は400になります

#### PlayReadyライセンス

```
GET /filmaapi/license/playready
```

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| key_id | string | ✓ | - | メディアファイルのキーID |
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |

**レスポンス:**

- ライセンス情報（XML）
- `Content-Type: text/xml; charset=UTF-8`

**注意:**

- 認証情報（api_key / jwt）を付与しない場合は401になります
- `key_id` 未指定の場合はXML形式のエラー（HTTP 400）を返します

### Customers API

#### 会員一覧取得

```
GET /filmaapi/customers
```

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- | --- |
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |
| page | integer | - | 1 | ページ番号 |
| per_page | integer | - | 20 | 1ページあたりの件数（最大100） |
| query | string | - | - | 氏名・メールアドレスでの部分一致検索 |
| status | string | - | - | `enabled` / `disabled` などの状態 |

**認証:** APIキー認証または管理者JWT認証

**レスポンス例:**

```json
{
  "records": [
    {
      "id": 123,
      "email": "user@example.com",
      "name": "田中 太郎",
      "status": "enabled",
      "created_at": "2025-11-10T12:00:00Z",
      "updated_at": "2025-11-12T09:30:00Z"
    }
  ],
  "pagination": {
    "current_page": 1,
    "per_page": 20,
    "total_count": 52,
    "total_pages": 3
  }
}
```

**レスポンスフィールド詳細:**

| フィールド名 | 型 | 説明 |
| --- | --- | --- |
| records | array | 会員レコードの配列 |
| records[].id | integer | 会員ID |
| records[].email | string | メールアドレス |
| records[].name | string | 氏名 |
| records[].status | string | `enabled` / `disabled` などの状態 |
| records[].created_at | string | 作成日時（ISO8601） |
| records[].updated_at | string | 更新日時（ISO8601） |
| pagination | object | ページング情報 |
| pagination.current_page | integer | 現在のページ番号 |
| pagination.per_page | integer | 1ページあたりの件数 |
| pagination.total_count | integer | 全件数 |
| pagination.total_pages | integer | 総ページ数 |

#### 会員詳細取得

```
GET /filmaapi/customers/{id}
```

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- | --- |
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |
| id | integer | ✓ | - | 対象会員ID |

**認証:** APIキー認証または管理者JWT認証

**レスポンス例:**

```json
{
  "id": 123,
  "email": "user@example.com",
  "name": "田中 太郎",
  "status": "enabled",
  "created_at": "2025-11-10T12:00:00Z",
  "updated_at": "2025-11-12T09:30:00Z",
  "notes": "VIP顧客",
  "shop_memberships": [
    {
      "shop_id": 1,
      "shop_name": "Filmaショップ",
      "expires_at": null
    }
  ]
}
```

**レスポンスフィールド詳細:**

| フィールド名 | 型 | 説明 |
| --- | --- | --- |
| id | integer | 会員ID |
| email | string | メールアドレス |
| name | string | 氏名 |
| status | string | `enabled` / `disabled` などの状態 |
| created_at / updated_at | string | 作成・更新日時（ISO8601） |
| notes | string | メモ |
| shop_memberships | array | 所属ショップ情報 |
| shop_memberships[].shop_id | integer | ショップID |
| shop_memberships[].shop_name | string | ショップ名 |
| shop_memberships[].expires_at | string | 所属期限（ISO8601 / null） |

#### 会員作成（デフォルトショップ所属）

```
POST /filmaapi/customers
```

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- | --- |
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |

**パラメータ（JSON Body）:**

| フィールド名 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| email | string | ✓ | 会員のメールアドレス（組織内で一意） |
| name | string | ✓ | 会員名 |
| notes | string | - | 管理用メモ |

**認証:** APIキー認証または管理者JWT認証

**処理内容:**

- 指定されたメールアドレス・氏名で会員を作成（既存メールはエラー）
- 組織のデフォルトショップに会員を所属させる（設定がない場合はエラー）
- 会員向けマイページのURLを生成して返却

**レスポンス例:**

```json
{
  "customer": {
    "id": 789,
    "email": "user@example.com",
    "name": "田中 太郎",
    "status": "enabled",
    "created_at": "2025-11-12T03:00:00Z",
    "shop_memberships": [
      { "shop_id": 45, "shop_name": "Tokyo Shop", "expires_at": null }
    ]
  },
  "customer_portal_url": "https:/filma.biz/filmacustomer?shop_id=45"
}
```

**レスポンスフィールド詳細:**

| フィールド名 | 型 | 説明 |
| --- | --- | --- |
| customer | object | 生成された会員情報（会員詳細取得と同じフィールド） |
| customer_portal_url | string | 会員がログインするためのマイページURL |

**エラーレスポンス例:**

| ステータス | メッセージ | 説明 |
| --- | --- | --- |
| 400 | `default_shop_required` | 組織にデフォルトショップが設定されていない |
| 422 | `email_taken` | 同じメールアドレスの会員が既に存在 |


#### 会員向け視聴権一覧

```
GET /filmaapi/customers/entitlements/{id}
```

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- | --- |
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |
| id | integer | ✓ | - | 対象会員ID |

**認証:** APIキー認証または管理者JWT認証

**レスポンス例:**

```json
{
  "records": [
    {
      "id": 789,
      "scope_type": "item",
      "item_id": 123,
      "status": "active",
      "starts_at": "2025-11-12T00:00:00Z",
      "expires_at": null,
      "source": "manual"
    }
  ]
}
```

**レスポンスフィールド詳細:**

| フィールド名 | 型 | 説明 |
| --- | --- | --- |
| id | integer | 視聴権ID |
| scope_type | string | `sku` / `item` / `shop` のいずれか |
| item_id / sku_id / shop_id | integer | 対象ID（scopeに応じてセット） |
| customer_id | integer | 対象会員ID |
| status | string | 視聴権の状態 |
| starts_at / expires_at | string | 開始・終了日時（ISO8601） |
| source | string | 付与理由 |
| notes | string | メモ |

#### 視聴権の手動付与

```
POST /filmaapi/customers/entitlements/{id}
```

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- | --- |
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |
| id | integer | ✓ | - | 対象会員ID |

**パラメータ（JSON Body）:**

| フィールド名 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| scope_type | string | ✓ | `sku` / `item` / `shop` |
| sku_id / item_id / shop_id | integer | scopeに応じて | 付与対象ID |
| starts_at | string | - | ISO8601形式の開始日時 |
| expires_at | string | - | ISO8601形式の終了日時 |
| status | string | - | 初期状態（デフォルト: `active`） |
| source | string | - | 付与理由（デフォルト: `manual`） |
| notes | string | - | メモ |

**認証:** APIキー認証または管理者JWT認証

**レスポンス例:**

```json
{
  "id": 790,
  "scope_type": "item",
  "item_id": 123,
  "sku_id": null,
  "shop_id": null,
  "customer_id": 456,
  "status": "active",
  "starts_at": "2025-11-12T00:00:00Z",
  "expires_at": null,
  "source": "manual",
  "notes": "テスト付与"
}
```

※ レスポンスは「視聴権の詳細取得」と同じフィールドを返却します。



### Entitlements API

#### 視聴プラン一覧検索

```
GET /filmaapi/entitlements/items
```

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- | --- |
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |
| q | string | - | - | 視聴プラン名またはIDでの検索文字列 |

**認証:** APIキー認証または管理者JWT認証

**レスポンス例:**

```json
{
  "records": [
    {
      "id": 123,
      "label": "夏のドキュメンタリー",
      "detail": "状態: enabled / SKU数: 2 / 更新: 2025/11/12 14:35"
    }
  ]
}
```

**レスポンスフィールド詳細:**

| フィールド名 | 型 | 説明 |
| --- | --- | --- |
| id | integer | 視聴プランID |
| label | string | 視聴プラン名 |
| detail | string | 状態・SKU数・更新日時を含む説明テキスト |

#### SKU一覧検索

```
GET /filmaapi/entitlements/skus
```

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- | --- |
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |
| item_id | integer | - | - | 絞り込み対象の視聴プランID |
| q | string | - | - | SKU名またはIDでの検索文字列 |

**認証:** APIキー認証または管理者JWT認証

**レスポンス例:**

```json
{
  "records": [
    {
      "id": 456,
      "label": "HD 1080p",
      "detail": "夏のドキュメンタリー / 1200 JPY / 状態: enabled"
    }
  ]
}
```

**レスポンスフィールド詳細:**

| フィールド名 | 型 | 説明 |
| --- | --- | --- |
| id | integer | SKU ID |
| label | string | SKU名 |
| detail | string | 対象視聴プラン名、価格、状態などを含む説明テキスト |

#### 視聴権の詳細取得

```
GET /filmaapi/entitlements/{id}
```

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- | --- |
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |
| id | integer | ✓ | - | 対象視聴権ID |

**認証:** APIキー認証または管理者JWT認証

**レスポンス例:**

```json
{
  "id": 790,
  "scope_type": "item",
  "item_id": 123,
  "status": "active",
  "starts_at": "2025-11-12T00:00:00Z",
  "expires_at": null,
  "source": "manual",
  "notes": "テスト付与"
}
```

**レスポンスフィールド詳細:**

| フィールド名 | 型 | 説明 |
| --- | --- | --- |
| id | integer | 視聴権ID |
| scope_type | string | `sku` / `item` / `shop` |
| item_id / sku_id / shop_id | integer | 対象ID（scopeに応じて） |
| customer_id | integer | 対象会員ID |
| status | string | 視聴権の状態 |
| starts_at / expires_at | string | 開始・終了日時（ISO8601） |
| source | string | 付与元 |
| notes | string | メモ |


#### 視聴権の更新

```
PUT /filmaapi/entitlements/{id}
```

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- | --- |
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |
| id | integer | ✓ | - | 視聴権ID |

**パラメータ（JSON Body）:**

| フィールド名 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| starts_at | string | - | 開始日時（省略時は変更なし） |
| expires_at | string | - | 終了日時 |
| status | string | - | `active` / `pending` / `revoked` など |
| source | string | - | 付与理由 |
| notes | string | - | メモ |

**認証:** APIキー認証または管理者JWT認証

**レスポンス例:**

```json
{
  "id": 790,
  "scope_type": "item",
  "item_id": 123,
  "sku_id": null,
  "shop_id": null,
  "customer_id": 456,
  "status": "active",
  "starts_at": "2025-11-12T00:00:00Z",
  "expires_at": "2025-12-31T23:59:59Z",
  "source": "manual",
  "notes": "メモ"
}
```

※ レスポンスは「視聴権の詳細取得」と同じフィールドを返却します。

#### 視聴権の剥奪

```
DELETE /filmaapi/entitlements/{id}
```

**パラメータ:**

| パラメータ名 | 型 | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- | --- |
| api_key | string | * | - | APIキー（JWT認証時は不要） |
| jwt | string | * | - | JWTトークン（APIキー認証時は不要） |
| id | integer | ✓ | - | 視聴権ID |

**認証:** APIキー認証または管理者JWT認証

**レスポンス例:**

```json
{
  "id": 790,
  "scope_type": "item",
  "item_id": 123,
  "sku_id": null,
  "shop_id": null,
  "customer_id": 456,
  "status": "revoked",
  "starts_at": "2025-11-12T00:00:00Z",
  "expires_at": null,
  "source": "manual",
  "notes": "オペレーター剥奪"
}
```

※ レスポンスは「視聴権の詳細取得」と同じフィールドを返却します。
