# Deployment checklist

The app builds cleanly (`npm run build`) and calculation tests pass (`npm test`).
GitHub CLI and Vercel CLI are installed locally, but **this machine is not logged in** to either service, so push/deploy must be finished by you:

## 1. GitHub

```powershell
gh auth login
gh repo create overhaul --public --source=. --remote=origin --push
```

(Or create a repo in the GitHub UI and `git remote add origin … && git push -u origin master`.)

## 2. Vercel

```powershell
npx vercel login
npx vercel --yes
npx vercel --prod --yes
```

In the Vercel project settings → Environment Variables, add:

| Name | Notes |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Prefer Supavisor pooler URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-safe |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** — never `NEXT_PUBLIC_` |

Without Supabase, the app still works: Open-Meteo is called directly and climate falls back to a documented latitude proxy if the API fails. Cache writes are skipped when env vars are missing.

## 3. Supabase SQL

Run `supabase/schema.sql` in the Supabase SQL editor (RLS enabled on all tables).
