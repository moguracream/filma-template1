# 認証

すべてのAPIエンドポイントは認証が必要です。Filma APIはハイブリッド認証システムを採用しており、以下の認証方法をサポートしています。

### ハイブリッド認証システム

Filma APIは2つの認証方法を併用できます：

1. **APIキー認証** - APIキーベース認証（クエリパラメータまたはX-Api-Keyヘッダー）
2. **JWT認証** - JWTトークンベース認証（Bearer Token、Cookie、クエリパラメータ）

### 認証方法の優先順位

複数の認証情報が提供された場合、以下の優先順位で認証を試行します：

1. **APIキー認証（X-Api-Key header）**: `X-Api-Key: <api_key>`
2. **APIキー認証（query parameter）**: `?api_key=<api_key>`
3. **JWT認証（query parameter）**: `?jwt=<jwt_token>` （APIキーがない場合のみ）
4. **JWT認証（Authorization header）**: `Authorization: Bearer <jwt_token>` （APIキーがない場合のみ）
5. **JWT認証（Cookie）**: `filmajwt` Cookie （APIキーがない場合のみ）

**注意**: ブラウザのCookieに古いJWTトークンが残っていても、APIキーがあれば無視されます。期限切れJWTトークンによる認証エラーを防止するための仕様です。

**認証フロー**:

- APIキーが提供された場合：APIキー認証のみを試行（JWTトークンは無視）
- APIキーがない場合：JWT認証を試行（パラメータ → Authorization ヘッダー → Cookie の順）

### APIキー認証

APIキー認証では、以下の2つの方法でAPIキーを送信できます：

#### 1. X-Api-Keyヘッダー（推奨）

```bash
curl -H "X-Api-Key: your_api_key_here" \
  "https://filma.biz/filmaapi/storage"
```

#### 2. クエリパラメータ

```bash
curl "https://filma.biz/filmaapi/storage?api_key=your_api_key_here"
```

### JWT認証

JWTトークンベースの認証システムです。以下の3つの方法でJWTトークンを送信できます：

#### 1. Authorization ヘッダー（推奨）

```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9..." \
  "https://filma.biz/filmaapi/storage"
```

#### 2. Cookie（自動管理）

```bash
curl -H "Cookie: filmajwt=eyJhbGciOiJIUzI1NiJ9..." \
  "https://filma.biz/filmaapi/storage"
```

#### 3. クエリパラメータ（利便性のため）

```bash
curl "https://filma.biz/filmaapi/storage?jwt=eyJhbGciOiJIUzI1NiJ9..."
```

**注意**: パラメータでのJWT送信はURLに記録される可能性があるため、セキュリティの観点からAuthorizationヘッダーまたはCookieの使用を推奨します。

### JWTトークンの発行方法

#### APIキー認証でJWTトークン発行

既存のAPIキーを使用してJWTトークンを発行できます：

##### X-Api-Keyヘッダーを使用（推奨）

```bash
curl -X POST "https://filma.biz/filmaapi/token" \
  -H "X-Api-Key: your_api_key" \
  -H "Content-Type: application/json"
```

##### クエリパラメータを使用

```bash
curl -X POST "https://filma.biz/filmaapi/token?api_key=your_api_key" \
  -H "Content-Type: application/json"
```

**レスポンス例:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoxLCJvcmdhbml6YXRpb25faWQiOjEsImV4cCI6MTcwNDAwNzIwMCwiaWF0IjoxNzAzOTIwODAwfQ.signature",
  "token_type": "Bearer",
  "expires_in": 86400,
  "expires_at": 1704007200,
  "user_id": 1,
  "organization_id": 1,
  "api_type": "readonly"
}
```

### 権限レベル

- **readonly**: 読み取り専用権限
- **fullaccess**: 読み取り・書き込み権限

### 公開状態による制限

ファイルには公開状態（published）が設定されており、APIキーの権限に応じてアクセス制限が適用されます。

#### アクセス制御ルール

| 権限 | デフォルト | show_all=true指定時 |
|---|---|---|
| readonly | 公開ファイルのみ | 公開ファイルのみ（パラメータ無視） |
| fullaccess | 公開ファイルのみ | 全ファイル（公開・非公開問わず） |

**show_allパラメータ:**

- `show_all=true`: fullaccess権限の場合のみ、非公開ファイルも含めて全てのファイルにアクセス可能
- 未指定またはfalse: 権限に関係なく公開ファイルのみアクセス可能

### ドメインアクセス制限

#### 認証方法別のドメインアクセス制限

1. **APIキー認証**
   - ユーザーの`api_access_domains`に基づいてドメインチェック
   - 設定されていない場合はFilma APIホストのみ許可
   - RefererまたはOriginヘッダーで制御

2. **JWT認証（Cookie・Bearer共通）**
   - **ドメインアクセス制限は適用されません**
   - どのドメインからでもアクセス可能
   - セキュリティはJWTトークン自体の有効性で担保

#### ドメイン制限の確認方法（APIキー認証のみ）

RefererまたはOriginヘッダーで制御されます：

```bash
# APIキー認証：許可されたドメインからのアクセス（成功）
curl -H "Referer: https://example.com/video.html" \
     "https://filma.biz/filmaapi/player/12345?api_key=YOUR_API_KEY"

# APIキー認証：許可されていないドメインからのアクセス（403エラー）
curl -H "Referer: https://unauthorized.com/video.html" \
     "https://filma.biz/filmaapi/player/12345?api_key=YOUR_API_KEY"

# JWT認証：どのドメインからでもアクセス可能
curl -H "Referer: https://any-domain.com/video.html" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     "https://filma.biz/filmaapi/player/12345"
```

### JWTセキュリティ特徴

- **組織分離**: 組織ごとに異なるシークレットキー
- **自動期限切れ**: デフォルト1時間で無効化
- **ドメイン制限なし**: どのドメインからでもアクセス可能（セキュリティはトークン有効性で担保）
- **トークンリフレッシュ**: 有効なトークンから新しいトークンを発行可能
- **Cookie自動設定**: HTTPS環境でのJWTトークン発行時にCookieが自動設定される
- **CSRF保護**: SameSite=Lax設定により、外部サイトからのPOSTリクエストを自動的に保護

