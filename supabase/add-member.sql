-- 先にAuthentication > Usersでユーザーを作成してください。
-- メールアドレスと表示名を実際の値へ変更してSQL Editorで実行します。
insert into public.festival_members (user_id,display_name)
select id,'運営メンバーの名前' from auth.users where lower(email)=lower('member@example.com')
on conflict(user_id) do update set display_name=excluded.display_name,active=true;
-- 0 rowsの場合はそのメールのユーザーがまだ作成されていません。
