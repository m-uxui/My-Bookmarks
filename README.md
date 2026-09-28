# My Bookmarks

Static site + Supabase backend (so every device sees the same bookmarks, no login needed).

## 1. Supabase (5 min)

1. Sign up at https://supabase.com → **New project**.
2. Open **SQL Editor** → paste the contents of `schema.sql` → **Run**.
3. Open **Project Settings → API** → copy the **Project URL** and the **anon public** key.
4. Paste them into `config.js`:
   ```js
   window.SUPABASE_URL = 'https://xxxx.supabase.co';
   window.SUPABASE_ANON_KEY = 'eyJ...';
   ```

## 2. GitHub

```bash
git remote add origin <your-empty-repo-url>
git push -u origin main
```

## 3. Vercel

1. Sign up at https://vercel.com (GitHub login is fine).
2. **Add New → Project** → import this repo.
3. Leave all build settings blank (it's a static site, no framework/build step) → **Deploy**.
4. You'll get a `your-project.vercel.app` URL immediately. Add a custom/shorter domain later from the project's **Settings → Domains** if you want one, or run it through a link shortener.

## Notes

- Data lives in Supabase's `categories` / `bookmarks` tables and updates live across every open tab (Supabase Realtime).
- The anon key is safe to expose in client code — it's meant to be public. Row Level Security policies in `schema.sql` are what actually govern access; by default anyone with the URL can read/write (fine for a private link you don't share widely — tighten later with Supabase Auth if needed).
- Favicons load directly from Google's favicon service (`s2/favicons`) — no special setup needed, unlike the Claude-artifact version this was ported from.
