-- Replace the example address and name in Supabase SQL Editor.
-- Do not commit actual addresses to a public repository.
insert into public.festival_google_allowlist(email,display_name)
values(lower('member@example.com'),'運営メンバー')
on conflict(email) do update set display_name=excluded.display_name,active=true;
