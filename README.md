# Keelwatch

A free, public risk monitor and alert system for [Blend](https://docs.blend.capital) lending pools on Stellar.

Keelwatch reads public on-chain data and shows, for every Blend pool:

- **Pool dashboard:** supplied, borrowed, utilisation and interest rates per asset.
- **Oracle watch:** each pool's oracle price compared with independent prices (Reflector's exchanges feed and CoinGecko), flagging large gaps and stale prices.
- **Bad debt:** debt the pool has moved onto its backstop.
- **Stress view:** how much debt sits near liquidation, as totals only (no individual accounts).
- **Alerts:** Telegram and Discord messages when a pool crosses a threshold, with anti-spam rules.
- **History:** scheduled snapshots in Postgres, with trend charts.
- **Public API:** free JSON endpoints for other Stellar teams.

It only **watches and warns**. It never liquidates, trades or holds funds, and it has no keys that can move money.

If a number can't be read, the site shows **"unavailable"**. It never guesses.

---

## Run it in GitHub Codespaces (step by step)

You don't need to install anything on your computer.

### 1. Make an empty GitHub repository
1. Go to **github.com/new**.
2. **Repository name:** type `keelwatch`.
3. Choose **Public**.
4. Tick **Add a README file** (Codespaces needs at least one file to start).
5. Click **Create repository**.

### 2. Open a Codespace
1. On your new repo page, click the green **Code** button.
2. Click the **Codespaces** tab.
3. Click **Create codespace on main**. Wait until you see VS Code in your browser.

### 3. Add the project files
1. Drag `keelwatch.zip` from your computer into the **Explorer** panel on the left (the file list).
2. Click into the **Terminal** at the bottom. (No terminal? Menu ☰ → **Terminal** → **New Terminal**.)
3. Type this and press Enter:
   ```bash
   unzip -o keelwatch.zip && rm keelwatch.zip
   ```
   Type `y` and press Enter if it asks to replace `README.md`.

### 4. Install
```bash
npm install
```
This takes a minute or two.

### 5. Run the tests
```bash
npm test
```
You should see **39 passed**. These tests use mocked data. They do not touch the internet.

### 6. Check the live data sources
```bash
npm run check:live
```
This tries every real data source once and prints ✅ or ❌ for each. It's the first time the code talks to the real Stellar network, so read the results carefully. Database and alert checks will show ❌ until you set them up in steps 8–9; that's expected.

### 7. Start the website
```bash
npm run dev
```
A pop-up says **"Your application running on port 3000 is available"**. Click **Open in Browser**. (No pop-up? Click the **Ports** tab next to Terminal and click the 🌐 globe icon next to port 3000.)

Press `Ctrl + C` in the terminal to stop it.

### 8. Add the database (for history, stress view and alerts)
1. Go to **neon.tech** and sign up (free plan is fine).
2. Click **New Project**, give it any name, click **Create**.
3. On the project dashboard, click **Connect**, and copy the connection string (it starts with `postgresql://`).
4. In the Codespace terminal:
   ```bash
   cp .env.example .env.local
   openssl rand -hex 24
   ```
   The second command prints a random code. Copy it.
5. In the Explorer panel, open `.env.local`. Fill in:
   ```
   DATABASE_URL=postgresql://...your Neon string...
   CRON_SECRET=...the random code...
   ```
   Save with `Ctrl + S`.
6. Create the tables and take a first snapshot:
   ```bash
   npm run db:setup
   npm run snapshot
   ```

### 9. Set up alerts (optional)
**Telegram**
1. In Telegram, open **@BotFather**, send `/newbot`, follow the steps. Copy the **token** it gives you.
2. Create a **public channel** (for example `@keelwatch_alerts`). Open the channel → **Administrators** → **Add Admin** → add your bot.
3. In `.env.local`:
   ```
   TELEGRAM_BOT_TOKEN=123456:ABC...
   TELEGRAM_CHAT_ID=@keelwatch_alerts
   PUBLIC_TELEGRAM_URL=https://t.me/keelwatch_alerts
   ```

**Discord**
1. In your Discord server: **Server Settings** → **Integrations** → **Webhooks** → **New Webhook**.
2. Pick the channel, click **Copy Webhook URL**.
3. In `.env.local`:
   ```
   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
   PUBLIC_DISCORD_URL=https://discord.gg/your-invite
   ```

Send a test message:
```bash
npm run check:live -- --send-test
```

### 10. Save your work to GitHub
```bash
git add .
git commit -m "Keelwatch first version"
git push
```
`.env.local` is **not** uploaded; `.gitignore` blocks it, so your secrets stay private.

---

## Deploy on Vercel

1. Go to **vercel.com**, sign in with GitHub.
2. Click **Add New…** → **Project**.
3. Find `keelwatch` and click **Import**.
4. Open **Environment Variables**. Add every line from your `.env.local` (name on the left, value on the right). At minimum: `DATABASE_URL` and `CRON_SECRET`.
5. Click **Deploy**. Wait for the confetti.
6. Copy your site address (like `https://keelwatch.vercel.app`). Go to **Settings** → **Environment Variables**, add `PUBLIC_SITE_URL` with that address, then **Deployments** → **⋯** on the latest → **Redeploy**.

### Turn on the 15-minute schedule
Vercel's free plan runs scheduled jobs only once a day (already set in `vercel.json`). For every 15 minutes, this repo includes a free GitHub Actions schedule:

1. On GitHub, open your repo → **Settings** → **Secrets and variables** → **Actions**.
2. Click **New repository secret**. Name `SITE_URL`, value your Vercel address. Click **Add secret**.
3. Add another: name `CRON_SECRET`, value the same code as in Vercel.
4. Go to the **Actions** tab → **Snapshot** → **Run workflow** to test it. A green tick means it worked.

Note: GitHub may delay scheduled runs by a few minutes, and pauses schedules in repos with no activity for 60 days.

If the job times out on Vercel, lower `MAX_POOLS` or set `SNAPSHOT_NETWORKS=mainnet`.

---

## Pages

| Page | What it shows |
| --- | --- |
| `/` | Summary and why this exists |
| `/pools` | All watched pools (switch Mainnet / Testnet at the top right) |
| `/pools/{id}` | One pool: reserves, oracle watch, bad debt, stress, history |
| `/stats` | Trend charts from stored snapshots |
| `/alerts` | How to join, rules, recent alerts |
| `/docs` | How every number is calculated |
| `/api-docs` | Public API |

## Public API

`/api/v1/pools`, `/api/v1/pools/{id}`, `/api/v1/oracle`, `/api/v1/stress`, `/api/v1/history?pool=…`, `/api/v1/alerts`, `/api/v1/status`. Add `?network=testnet` for testnet. Details on `/api-docs`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the site for development |
| `npm test` | Run automated tests (mocked data) |
| `npm run typecheck` | Check the TypeScript |
| `npm run build` | Production build |
| `npm run check:live` | Test real data sources |
| `npm run db:setup` | Create database tables |
| `npm run snapshot` | Run the scheduled job once by hand |

## Renaming the product
Change `name` in `lib/site.ts`. Everything in the app updates.

## How it's built
- Next.js 16 (App Router, TypeScript), deployable on Vercel.
- Blend data via the official `@blend-capital/blend-sdk` and `@stellar/stellar-sdk`.
- Neon Postgres via `@neondatabase/serverless`.
- No tracking, no cookies. Secrets live only in server environment variables.

## Data sources and contracts
- Blend contract addresses: [blend-capital/blend-utils](https://github.com/blend-capital/blend-utils).
- Reflector oracle feeds: [Stellar oracle providers](https://developers.stellar.org/docs/data/oracles/oracle-providers).
- Bad debt handling: [Blend docs](https://docs.blend.capital/tech-docs/core-contracts/lending-pool/bad-debt-management).

## License
MIT. See `LICENSE`. Not affiliated with Blend, Script3 or the Stellar Development Foundation. Not financial advice.
