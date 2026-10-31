# Googleログインへの切り替え

この変更はGoogle接続設定が完了してから公開します。指定されたアカウントのみが備品を閲覧・更新できます。
SupabaseのAuthユーザー作成はGoogle初回ログイン時に自動で行われるため、管理者が利用者のパスワードを作る必要はありません。

## Google Cloud

Google Auth Platformで管理用プロジェクトを選び、アプリを設定します。

- アプリ名：文化祭 備品管理
- サポートメール・連絡先メール：管理者自身の連絡用アドレス
- 対象：管理するGoogle Cloud組織の外にも学校アカウントがある場合はExternal
- スコープ：openid、メール、基本プロフィールのみ
- OAuthクライアントの種類：ウェブアプリケーション
- クライアント名：文化祭 備品管理 Web
- 承認済みJavaScript生成元：`https://mars1star.github.io`
- 承認済みリダイレクトURI：`https://gdcnocxixkrqeqlkwwea.supabase.co/auth/v1/callback`

Googleの画面に表示されるテストユーザー・公開状態の要件に従って設定します。
Client IDとClient SecretはGoogleが発行します。学校のパスワードは使いません。
Client SecretはSupabaseのGoogleプロバイダー設定だけに入力し、チャット、GitHub、ZIPに保存しません。

## Supabase

1. Authentication → Sign In / Providers → Googleで発行されたClient ID・Client Secretを設定し、Googleを有効にします。
2. nonceチェックは無効化しません。「Allow users without an email」も無効のままにします。
3. このアプリのOAuthプロバイダーはGoogleだけを有効にします。認可処理はOAuthセッションとGoogleの確認済みidentityを照合します。
4. URL ConfigurationのSite URLとRedirect URLsに `https://mars1star.github.io/kanri/` を設定します。ワイルドカードは不要です。
5. 既存の保存先では `supabase/google-access.sql` を適用します。既存の数量や履歴は保持します。新規の保存先では先に `supabase/setup.sql` を実行します。
6. `supabase/allow-google-account.sql` の例のアドレスと表示名をSQL Editor内で置き換えて実行します。実際の許可アドレスを公開リポジトリに保存しないでください。
7. サイトを公開し、許可されたGoogleアカウントでログインを確認します。学校側でアプリが制限されている場合は学校の管理者による許可が必要です。

指定外のユーザーがGoogle認証自体に成功しても、備品データにはアクセスできません。
旧 `festival_members` の登録だけでは利用できなくなり、パスワード・OTPでのログインも備品操作では拒否されます。
許可を取り消す場合はSupabaseで `festival_google_allowlist.active` をfalseにします。次回のデータ取得・更新から拒否されます。

## 検証

`node --test tests/*.test.mjs` で従来の数量・移動処理に加え、未ログイン、指定外、未確認identity、パスワード認証、自己申告メタデータ、許可の取り消しを検証します。
SQLテストではGoogleの実際の画面遷移までは確認できません。公開前に実際のGoogleログインによる確認が別途必要です。

元の保存処理を修正した場合は `node scripts/google-migration.mjs` で移行SQLを更新します。

公式手順：https://supabase.com/docs/guides/auth/social-sign-in/auth-google
