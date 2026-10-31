# モノの居場所：GitHub Pages + Supabase版

文化祭の備品数と移動履歴を、運営メンバーのスマホ・パソコンで共有するシステムです。
画面はGitHub Pages、ログインと保存先はSupabaseを使います。

## 現在の状態

公開サイト: https://mars1star.github.io/kanri/

Supabase「管理システム」（`gdcnocxixkrqeqlkwwea`）への接続情報は設定済みで、保存用テーブル・更新関数も作成済みです。
このプロジェクトでは `supabase/setup.sql` を再実行する必要はありません。利用者はAuthenticationと `festival_members` の両方に登録します。
新しいプロジェクトに複製する場合は、以下の初期設定を行い、`config.js` の接続情報を変更してください。
表示中のSites版とは別のシステムです。元のデータを上書きしたり、自動移行したりしません。

## 最初の設定

詳しい手順は `SETUP.html` を開いてください。

1. 自分のSupabaseアカウントで、このシステム専用のプロジェクトを作ります。
2. SQL Editorに `supabase/setup.sql` の全文を貼り付け、一度実行します。
3. Authentication > Usersで利用者を作成し、`supabase/add-member.sql` でメンバーに登録します。
4. Project URLとブラウザー公開用Publishable keyを `config.js` に設定します。
5. 新しいGitHubリポジトリにこのフォルダーの中身をアップロードします。ZIPファイル自体はアップロードしません。
6. Settings > PagesでDeploy from a branch、main、/(root)を選び、公開します。

## ファイル

- `index.html`: トップページ
- `assets/style.css`: 見た目
- `assets/app.js`: ビルド済みJavaScript。公開に必要です。
- `assets/app.js.LEGAL.txt`: 同梱ライブラリーのライセンス表記
- `config.js`: Supabaseの公開接続情報
- `src/`: 編集用のReact / TypeScriptソース
- `supabase/setup.sql`: データベースと更新処理、アクセス制限
- `supabase/add-member.sql`: 利用者登録用のひな形
- `tests/`: ローカルPostgreSQLでの保存処理・権限テスト

## 使い方

ログイン後、場所・備品を追加し、「個数を設定」で初期個数を入力します。
備品を運んだ人が「移動を記録する」で移動元・移動先・個数を登録します。
5秒ごとに最新の情報を読み込みます。インターネット接続が必要です。
現在の一覧はCSV出力できます。履歴は保存し続け、画面には最新100件を表示します。

## 利用者とデータの保護

ページ自体は一般公開しても、数量・履歴はログインした登録メンバーにしか返りません。
`festival_members` に登録された有効な利用者は、全員が閲覧・移動・数量修正・備品追加を行えます。
メンバー管理はSupabase管理者のみが行います。利用者が自分でメンバーになれる機能はありません。
無効化はSQL Editorで `update public.festival_members set active=false where user_id='対象UUID';` を実行します。
担当者の入力名とログインアカウントIDをともに記録します。入力名は本人確認そのものではありません。

`config.js` に設定するPublishable key（または旧anon key）は公開用です。
Secret key / service_role / データベースパスワードは、ファイルやGitHubに入れないでください。
テーブルはRLSを有効にし、ブラウザーからの直接操作を禁止しています。
メンバー確認付きデータベース関数のみ公開し、個数更新と履歴を1つのトランザクションで保存します。
同時更新はリビジョンで検出、再送はリクエストIDで二重反映を防ぎます。

## 編集と検証

Node.js 22以降を使い、`npm ci` → `npm run check` → `npm test` → `npm run build`。
`src/` を編集したら必ずビルドし、更新された `assets/app.js` もGitHubに反映してください。
`node scripts/preview.mjs` で http://127.0.0.1:5174/ を開けます。
SQLテストはPGlite（ローカルPostgreSQL）で実行し、本番Supabaseのデータは変更しません。
本番プロジェクトへの接続確認と実ユーザーでのログイン確認は、接続設定後に行ってください。

## ZIPの保存

ZIPを右クリックして「すべて展開」すると、このフォルダーを保存できます。
完成済みの `index.html` と `assets/` が含まれているため、GitHub Pagesへの公開時にビルド環境は不要です。
`node_modules`、ログイン情報、開発用データベースは含めません。
