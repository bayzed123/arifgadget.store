# 📦 নতুন ক্লায়েন্টের জন্য এই ওয়েবসাইট কীভাবে বানাবেন

**এই ডকুমেন্টটা কার জন্য:** এটা আপনার (ডেভেলপার/এজেন্সি) জন্য — এই একই কোডবেস দিয়ে একজন **নতুন ক্লায়েন্টের জন্য** নতুন একটা ই-কমার্স ওয়েবসাইট বানাতে চাইলে, ঠিক কোথায় কী বদলাতে হবে, কীভাবে ডিপ্লয় করতে হবে, আর ডেলিভারির আগে কী চেক করতে হবে — সব ধাপে ধাপে এখানে আছে।

> এই কোডবেসেই ইতিমধ্যে দুটো ডকুমেন্ট আছে, এই গাইডটা সেগুলোর পরিপূরক (duplicate নয়):
> - **`README.md`** — টেকনিক্যাল রেফারেন্স: আর্কিটেকচার, API, ডাটাবেজ ডিজাইন, লোকাল ডেভ কমান্ড
> - **`ADMIN_GUIDE.md`** — এটা **ক্লায়েন্টকে দেওয়ার জন্য** — dashboard কীভাবে ব্যবহার করবে (বাংলায় লেখা, non-technical)
> - **`WHITELABEL_SETUP_GUIDE.md`** (এই ফাইল) — শুধু **আপনার জন্য** — নতুন ক্লায়েন্টের জন্য এই কোড থেকে নতুন সাইট বানানোর প্রসেস

---

## সূচিপত্র

1. [এক নজরে — এটা কীভাবে কাজ করে](#1-এক-নজরে--এটা-কীভাবে-কাজ-করে)
2. [প্যাকেজে কী কী আছে](#2-প্যাকেজে-কী-কী-আছে)
3. [⚠️ MUST-CHANGE — প্রতিটা নতুন ক্লায়েন্টের জন্য যা অবশ্যই বদলাতে হবে](#3-️-must-change--প্রতিটা-নতুন-ক্লায়েন্টের-জন্য-যা-অবশ্যই-বদলাতে-হবে)
4. [ধাপে ধাপে সেটআপ (A–Z)](#4-ধাপে-ধাপে-সেটআপ-az)
5. [ডেমো প্রোডাক্ট/কন্টেন্ট রিপ্লেস করা](#5-ডেমো-প্রোডাক্টকন্টেন্ট-রিপ্লেস-করা)
6. [অপশনাল ফিচার — কী কী আছে, কীভাবে চালু করবেন](#6-অপশনাল-ফিচার--কী-কী-আছে-কীভাবে-চালু-করবেন)
7. [কাস্টম ডোমেইন যুক্ত করা](#7-কাস্টম-ডোমেইন-যুক্ত-করা)
8. [লোকালি রান করে টেস্ট করা](#8-লোকালি-রান-করে-টেস্ট-করা)
9. [ডেলিভারির আগে ভেরিফিকেশন চেকলিস্ট](#9-ডেলিভারির-আগে-ভেরিফিকেশন-চেকলিস্ট)
10. [প্রজেক্ট স্ট্রাকচার রেফারেন্স](#10-প্রজেক্ট-স্ট্রাকচার-রেফারেন্স)
11. [সাধারণ সমস্যা ও সমাধান](#11-সাধারণ-সমস্যা-ও-সমাধান)

---

## 1. এক নজরে — এটা কীভাবে কাজ করে

```
┌─────────────────────┐        ┌──────────────────────────────┐
│   web/  (Storefront   │  API   │   worker/  (Backend API)      │
│   + Admin Dashboard)  │ ─────▶ │   Cloudflare Worker (Hono)    │
│   React + Vite         │       │   D1 (SQL database)           │
│   → GitHub Pages       │       │   R2 (product images)         │
└─────────────────────┘        │   KV (cache)                  │
                                 └──────────────────────────────┘
```

- **`worker/`** — সম্পূর্ণ ব্যাকএন্ড। একটা Cloudflare Worker (সার্ভারলেস, কোনো ভারী হোস্টিং লাগে না), যেখানে API routes, ডাটাবেজ স্কিমা (migrations), আর সব বিজনেস লজিক আছে।
- **`web/`** — সম্পূর্ণ ফ্রন্টএন্ড। একটাই React app — কাস্টমার-facing স্টোরফ্রন্ট আর এডমিন ড্যাশবোর্ড দুটোই এখানে, রুট দিয়ে আলাদা (`/` = shop, `/admin` = dashboard)। GitHub Pages-এ স্ট্যাটিক ফাইল হিসেবে হোস্ট হয়।
- **`.github/workflows/`** — Deploy স্বয়ংক্রিয় করে। `main` ব্রাঞ্চে push করলেই backend + frontend দুটোই deploy হয়ে যায়।
- **`scripts/`** — ডিপ্লয়ের সাপোর্টিং স্ক্রিপ্ট (Cloudflare resource তৈরি, secrets বসানো, sitemap generate ইত্যাদি) — এগুলো নিজে থেকে হাতে চালানোর দরকার হয় না, deploy workflow-ই এগুলো চালায়।

**খরচ:** Cloudflare Workers/D1/R2/KV এর ফ্রি টায়ারেই এটা চলে (ছোট-মাঝারি শপের জন্য যথেষ্ট)। GitHub Pages সবসময় ফ্রি। মানে প্রতি ক্লায়েন্টের জন্য হোস্টিং খরচ কার্যত ০।

---

## 2. প্যাকেজে কী কী আছে

```
├── README.md                    ← টেকনিক্যাল রেফারেন্স (architecture, API)
├── ADMIN_GUIDE.md                ← ক্লায়েন্টকে দেওয়ার ড্যাশবোর্ড গাইড
├── WHITELABEL_SETUP_GUIDE.md     ← এই ফাইল
├── MIGRATION.md                  ← রেফারেন্স উদাহরণ: এক Cloudflare অ্যাকাউন্ট থেকে
│                                    আরেকটায় সাইট সরানোর কেস-স্টাডি
├── package.json                  ← root workspace (worker + web একসাথে চালায়)
├── CNAME                         ← বর্তমানে "arifgadget.store" — নতুন ডোমেইনের
│                                    জন্য বদলাতে হবে (ধাপ ৭ দেখুন)
├── .github/workflows/
│   ├── deploy.yml                ← main-এ push করলে backend+frontend deploy
│   ├── ci.yml                    ← (যদি থাকে) PR/branch-এ typecheck+build চালায়
│   ├── cf-doctor.yml             ← Cloudflare টোকেন সমস্যা ডায়াগনোজ করার
│   │                                ম্যানুয়াল ট্রিগার বাটন
│   ├── restore-d1.yml            ← ডাটাবেজ ব্যাকআপ থেকে রিস্টোর করার বাটন
│   └── dev-report-trigger.yml    ← সাপ্তাহিক AI রিপোর্ট ম্যানুয়ালি চালানোর বাটন
├── scripts/                      ← deploy-সাপোর্টিং Node স্ক্রিপ্ট (bootstrap,
│                                    secrets provision, sitemap generate...)
├── worker/                       ← ব্যাকএন্ড (Cloudflare Worker)
│   ├── src/
│   │   ├── index.ts              ← এন্ট্রি পয়েন্ট, cron scheduler
│   │   ├── types.ts              ← Env interface — প্রতিটা secret/var এখানে
│   │   ├── routes/                ← API endpoints (catalog, orders, admin...)
│   │   └── lib/                   ← বিজনেস লজিক (pricing, auth, Gemini AI,
│   │                                 Google integrations, courier...)
│   ├── migrations/                ← ডাটাবেজ স্কিমা + ডেমো ডেটা (নিচে ধাপ ৫ দেখুন)
│   ├── wrangler.toml               ← Worker কনফিগ (নাম, cron, env vars)
│   └── package.json
└── web/                          ← ফ্রন্টএন্ড (React)
    ├── src/
    │   ├── pages/                 ← স্টোরফ্রন্ট পেজ + pages/admin/ (dashboard)
    │   ├── components/             ← reusable UI (Logo, ChatLauncher...)
    │   ├── lib/                    ← API client, analytics, format helpers
    │   └── styles.css              ← পুরো সাইটের থিম/রং (CSS variables)
    ├── public/brand/                ← লোগো SVG ফাইল
    ├── index.html                   ← টাইটেল, meta tags, GTM/GA4 আইডি
    └── package.json
```

---

## 3. ⚠️ MUST-CHANGE — প্রতিটা নতুন ক্লায়েন্টের জন্য যা অবশ্যই বদলাতে হবে

এই সেকশনটা সবচেয়ে গুরুত্বপূর্ণ। নিচের প্রতিটা জিনিস **আসল "Arif Gadgets" ওয়েবসাইটের নিজস্ব ডেটা/আইডেন্টিটি** — এগুলো না বদলালে নতুন ক্লায়েন্টের সাইট হয় ভুল ব্র্যান্ডিং দেখাবে, নয়তো (সবচেয়ে খারাপ ক্ষেত্রে) **আসল মালিকের প্রাইভেট Google অ্যাকাউন্টে ডেটা পাঠাবে**।

### 🔴 ক্রিটিক্যাল — প্রাইভেসি/ডেটা লিক ঝুঁকি (অবশ্যই বদলান বা মুছুন)

| # | কোথায় | কী আছে | কী করতে হবে |
|---|---|---|---|
| 1 | `web/index.html` | `GTM-MGQ6S4HX` (Google Tag Manager) ও `G-0NMRBW4SEG` (Google Analytics) — **আসল মালিকের আসল অ্যাকাউন্ট আইডি**, দুই জায়গায় (script tag + gtag config) | নতুন ক্লায়েন্টের নিজস্ব GTM/GA4 আইডি বসান, অথবা সম্পূর্ণ স্ক্রিপ্ট ব্লক দুটো মুছে ফেলুন যদি এখনই দরকার না হয় |
| 2 | `worker/src/lib/googleTagManager.ts` লাইন ২৫ | `GTM_PUBLIC_ID = 'GTM-MGQ6S4HX'` | একই আইডি দিয়ে বদলান #1-এর সাথে মিলিয়ে |
| 3 | `web/src/lib/analytics.ts` লাইন ১৬ | `GA_MEASUREMENT_ID = 'G-0NMRBW4SEG'` | একই আইডি দিয়ে বদলান #1-এর সাথে মিলিয়ে |
| 4 | `worker/migrations/0021_dev_report_destinations.sql` | আসল মালিকের **প্রাইভেট Google Doc/Sheet ID** — সাপ্তাহিক AI রিপোর্ট এখানে লেখে | এই মাইগ্রেশনটা **প্রথম ডিপ্লয়ের আগেই মুছে ফেলুন অথবা খালি করে দিন** (নতুন ক্লায়েন্টের জন্য নতুন Google Doc/Sheet বানিয়ে তার ID বসান, অথবা এই ফিচারটা স্কিপ করুন — এটা অপশনাল) |

> কেন এগুলো এতটা জরুরি: #1–#3 বদলানো না হলে নতুন ক্লায়েন্টের ওয়েবসাইটের সব ভিজিটর ট্র্যাফিক **মূল Arif Gadgets মালিকের Analytics অ্যাকাউন্টে** গিয়ে জমা হবে — নতুন ক্লায়েন্ট নিজের ডেটা দেখতেই পাবে না, আর পুরনো মালিকের অ্যাকাউন্টে অপরিচিত ওয়েবসাইটের ডেটা মিশে যাবে। #4 না বদলালে নতুন সাইটের সাপ্তাহিক AI রিপোর্ট সরাসরি পুরনো মালিকের ব্যক্তিগত Google Doc-এ গিয়ে লেখা শুরু করবে।

### 🟡 ব্র্যান্ডিং — বদলান যেন সাইটে সঠিক নাম/লোগো দেখায়

| # | কোথায় | কী আছে | কী করতে হবে |
|---|---|---|---|
| 5 | `worker/wrangler.toml` লাইন ৪৪ | `STORE_NAME = "Arif Gadgets"` | নতুন ক্লায়েন্টের শপের নাম বসান — এই একটা ভ্যারিয়েবল বদলালেই backend-এর সব জায়গায় (ইমেইল, ইনভয়েস, চ্যাটবট, রিপোর্ট) নতুন নাম চলে যায় |
| 6 | `web/index.html` | `<title>`, `<meta name="description">`, `og:title`, `og:description` | নতুন শপের নাম ও বর্ণনা দিয়ে বদলান |
| 7 | `web/src/components/Logo.tsx` | SVG-তে হার্ডকোড করা `"ARIF"`, `"GADGETS"`, `"PREMIUM TECH MARKETPLACE"` টেক্সট, এবং দুই জায়গায় `aria-label="Arif Gadgets"` | নতুন নাম/ট্যাগলাইন বসান, অথবা সম্পূর্ণ নতুন লোগো ডিজাইন করে এই কম্পোনেন্ট রিপ্লেস করুন |
| 8 | `web/public/brand/logo.svg`, `logo-mark.svg`, `banner.svg` | আসল Arif Gadgets লোগো আর্টওয়ার্ক | নতুন ক্লায়েন্টের লোগো দিয়ে রিপ্লেস করুন (একই ফাইল নাম রাখলে কোডে আর কিছু বদলাতে হবে না) |
| 9 | `package.json` (root) | `"name": "arif-gadgets"`, `description` | নতুন প্রজেক্টের নাম (শুধু organizational, ফাংশনালিটিতে প্রভাব নেই) |
| 10 | `CNAME` | `arifgadget.store` | নতুন ক্লায়েন্টের ডোমেইন (বিস্তারিত ধাপ ৭-এ) |

### 🟢 D1/Worker রিসোর্স নাম — কনসিস্টেন্ট রাখুন (অপশনাল কিন্তু ভালো অভ্যাস)

নিচের **৪টা জায়গায়** একই D1 ডাটাবেজ নাম (`arif-gadgets`) ব্যবহার হয় — বদলাতে চাইলে **সবগুলো একসাথে, একই বানানে** বদলাতে হবে, নাহলে migration চালানোর সময় error দেবে ("database not found"):

1. `worker/wrangler.toml` → `[[d1_databases]]` ব্লকের `database_name`
2. `worker/package.json` → `migrate:local` ও `migrate:remote` স্ক্রিপ্টে `wrangler d1 migrations apply arif-gadgets ...`
3. `.github/workflows/deploy.yml` → "Apply D1 migrations" স্টেপে একই কমান্ড
4. `worker/wrangler.toml` → `name` (Worker-এর নাম, `arif-gadgets-api`) এবং `[[r2_buckets]]` এর `bucket_name` (`arif-gadgets-media`) — এগুলো বদলানো optional, কিন্তু ব্র্যান্ডিং-এর সাথে মিলিয়ে রাখলে Cloudflare dashboard-এ গুলিয়ে ফেলার সম্ভাবনা কম থাকে

> **টিপ:** যদি সময় বাঁচাতে চান, D1/Worker/R2-এর নাম নাও বদলাতে পারেন — Cloudflare-এ প্রতিটা ক্লায়েন্টের জন্য **আলাদা Cloudflare অ্যাকাউন্ট** ব্যবহার করলে নাম একই থাকলেও কোনো কনফ্লিক্ট হয় না। শুধু 🔴 আর 🟡 সেকশনের আইটেমগুলো বদলানো **বাধ্যতামূলক**।

---

## 4. ধাপে ধাপে সেটআপ (A–Z)

### ধাপ ১ — প্রয়োজনীয় জিনিস

- একটা GitHub অ্যাকাউন্ট (নতুন ক্লায়েন্টের জন্য নতুন রিপো বানানোর জন্য)
- একটা Cloudflare অ্যাকাউন্ট (ফ্রি টায়ার যথেষ্ট) — নতুন ক্লায়েন্টের জন্য আলাদা অ্যাকাউন্ট রাখাই সবচেয়ে নিরাপদ ও পরিষ্কার
- Node.js 20+ (লোকাল টেস্টের জন্য, ধাপ ৮ দেখুন)

### ধাপ ২ — নতুন GitHub রিপো বানিয়ে কোড আপলোড

1. GitHub-এ একটা নতুন, খালি রিপোজিটরি বানান (যেমন `client-name-store`)
2. এই zip ফাইলের সব কনটেন্ট সেই রিপোতে push করুন:
   ```bash
   cd client-name-store
   git init
   git remote add origin https://github.com/<your-username>/client-name-store.git
   git add -A
   git commit -m "Initial commit — cloned from Arif Gadgets template"
   git branch -M main
   git push -u origin main
   ```

### ধাপ ৩ — ৩ নং সেকশনের MUST-CHANGE তালিকা অনুযায়ী বদলান

উপরের **৩ নং সেকশন** ধরে ধরে সব 🔴 ও 🟡 আইটেম বদলান, তারপর কমিট করুন:
```bash
git add -A
git commit -m "Rebrand for <client name>"
git push
```

### ধাপ ৪ — Cloudflare API টোকেন বানান

Cloudflare Dashboard → **My Profile → API Tokens → Create Token** → এই পারমিশনগুলো দিন:
- Workers Scripts: Edit
- D1: Edit
- Workers R2 Storage: Edit
- Workers KV Storage: Edit

আর আপনার **Account ID** কপি করে রাখুন (Cloudflare dashboard-এর ডান পাশে যেকোনো পেজে থাকে)।

### ধাপ ৫ — GitHub Secrets ও Variables সেট করুন

রিপোর **Settings → Secrets and variables → Actions**-এ যান।

**Secrets ট্যাব** (গোপন রাখা তথ্য):

| Secret | আবশ্যক? | কী |
|---|---|---|
| `CLOUD_FLARE_API` | ✅ হ্যাঁ | ধাপ ৪-এর API টোকেন |
| `CLOUD_FLARE_ACCOUNT_ID` | ✅ হ্যাঁ | ধাপ ৪-এর Account ID |
| `ADMIN_PASSWORD` | সুপারিশকৃত | মালিকের প্রথম পাসওয়ার্ড, ১০+ ক্যারেক্টার |
| `ADMIN_EMAIL` | না | শুধু যোগাযোগের ইমেইল |
| `JWT_SECRET` | না | না দিলে প্রথম ডিপ্লয়ে নিজে থেকে তৈরি হয়ে যাবে |

**Variables ট্যাব** (গোপন নয়):

| Variable | কী |
|---|---|
| `ADMIN_USERNAME` | ড্যাশবোর্ড লগইন নাম, যেমন `clientshop` |
| `ADMIN_NAME` | মালিকের নাম |
| `CUSTOM_DOMAIN` | (যদি নিজের ডোমেইন থাকে) — ধাপ ৭ দেখুন |
| `API_DOMAIN` বা `WORKERS_SUBDOMAIN` | API-এর ঠিকানা — কমপক্ষে একটা লাগবে (README.md-এ পুরো ব্যাখ্যা আছে) |

> এই টেবিলটা `README.md`-এর "First-time setup" সেকশনে আরও বিস্তারিতভাবে ব্যাখ্যা করা আছে — কনফিউশন হলে ওখানে দেখুন।

### ধাপ ৬ — GitHub Pages চালু করুন

রিপোর **Settings → Pages → Build and deployment → Source: GitHub Actions** সিলেক্ট করুন।

### ধাপ ৭ — প্রথম ডিপ্লয় রান করুন

`main` ব্রাঞ্চে push করলেই অটোমেটিক চলবে, অথবা **Actions ট্যাব → Deploy → Run workflow** থেকে ম্যানুয়ালি চালাতে পারেন। প্রথম রানে এটা নিজে থেকে যা করবে:

1. Cloudflare-এ D1 ডাটাবেজ, R2 বাকেট, KV নেমস্পেস তৈরি করবে
2. সব migration (স্কিমা + সিড ডেটা) চালাবে
3. Worker deploy করবে
4. এডমিন (মালিক) অ্যাকাউন্ট তৈরি করবে (`ADMIN_USERNAME`/`ADMIN_PASSWORD` থেকে)
5. স্টোরফ্রন্ট বিল্ড করে GitHub Pages-এ পাবলিশ করবে

৫–১০ মিনিট সময় লাগে। শেষে Actions-এর লগে সাইটের লিংক দেখতে পাবেন।

### ধাপ ৮ — প্রথমবার ড্যাশবোর্ডে লগইন

`https://<your-site>/admin` এ যান, `ADMIN_USERNAME`/`ADMIN_PASSWORD` দিয়ে লগইন করুন। (যদি এগুলো সেট না করে থাকেন, প্রথমবার লগইন স্ক্রিনেই "Create owner account" অপশন আসবে।)

---

## 5. ডেমো প্রোডাক্ট/কন্টেন্ট রিপ্লেস করা

`worker/migrations/` ফোল্ডারের কিছু ফাইলে **আসল Arif Gadgets-এর ডেমো ডেটা** আছে (প্রোডাক্ট, ক্যাটাগরি, পলিসি পেজ) — এগুলো স্কিমা তৈরির পাশাপাশি sample content হিসেবে ঢোকানো হয়েছিল। প্রধানত: `0001_init.sql`, `0002_seed.sql`, `0003_username_and_stock.sql`, `0007_seed_pages.sql`।

**দুইভাবে সামলাতে পারেন:**

- **সহজ পথ (সুপারিশকৃত):** ডিপ্লয়ের পর, ড্যাশবোর্ড থেকেই ডেমো প্রোডাক্টগুলো Archive/Delete করুন আর নতুন ক্লায়েন্টের আসল প্রোডাক্ট যোগ করুন (Products পেজ থেকে)। Policy পেজগুলো (Return/Refund/Warranty ইত্যাদি) Content পেজ থেকে এডিট করুন। কোনো migration ফাইল ছোঁয়ার দরকার নেই।
- **পরিষ্কার পথ:** প্রথম ডিপ্লয়ের **আগেই** migration ফাইলগুলো থেকে ডেমো `INSERT` স্টেটমেন্টগুলো মুছে দিন (schema/`CREATE TABLE` অংশটুকু রেখে দিন — ওটাই আসল সিস্টেম)। এতে নতুন সাইট একদম খালি ক্যাটালগ নিয়ে শুরু হবে।

> **ক্যাটাগরি:** `0001_init.sql`-এ কিছু বেসিক ক্যাটাগরি (mobile accessories, wearables, audio...) সিড করা আছে — বেশিরভাগ গ্যাজেট শপের জন্যই এগুলো কাজে লাগবে, না লাগলে ড্যাশবোর্ড থেকেই এডিট/ডিলিট করা যায়।

---

## 6. অপশনাল ফিচার — কী কী আছে, কীভাবে চালু করবেন

এই প্ল্যাটফর্মে যা যা আছে তার সবই **কাজ করে অপশনাল কী/সিক্রেট না দিলেও** — শুধু সেই একটা ফিচার "not connected" দেখাবে, বাকি পুরো সাইট স্বাভাবিকভাবে চলবে। নতুন ক্লায়েন্টের জন্য কোনটা লাগবে সেটা বেছে নিয়ে চালু করুন:

| ফিচার | কী লাগবে | Secret নাম |
|---|---|---|
| কুরিয়ার (Steadfast) | Steadfast merchant API key/secret | `STEADFAST_API_KEY`, `STEADFAST_SECRET_KEY` |
| Google Analytics/Search Console/Sheets sync | Google Cloud Service Account JSON | `GOOGLE_SERVICE_ACCOUNT_JSON` |
| কাস্টমার সাপোর্ট AI চ্যাটবট | Gemini API key | `SUPPORT_GEMINI_API_KEY` |
| এডমিন AI অ্যাসিস্ট্যান্ট | Gemini API key | `ADMIN_GEMINI_API_KEY` |
| দৈনিক সাইট Health Check | Gemini API key | `ALERT_GEMINI_API_KEY` |
| সাপ্তাহিক AI বিজনেস রিপোর্ট | Gemini API key + Google Doc/Sheet ID | `DEVLOPER_REPORT_GEMENI` (⚠️ বানান exactly এটাই, বদলাবেন না) + `worker/migrations/0021...` এডিট করে নতুন Doc/Sheet ID (৩ নং সেকশন দেখুন) |

Gemini API key ফ্রিতে পাওয়া যায় [Google AI Studio](https://aistudio.google.com/) থেকে — প্রতিটা ফিচারের জন্য আলাদা key ব্যবহার করাই সবচেয়ে নিরাপদ (একটার সমস্যা আরেকটাকে প্রভাবিত করে না)।

সব সিক্রেট GitHub Secrets-এ বসিয়ে re-deploy করলেই সেই ফিচার চালু হয়ে যাবে — কোনো কোড বদলাতে হয় না।

---

## 7. কাস্টম ডোমেইন যুক্ত করা

ক্লায়েন্টের নিজের ডোমেইন (যেমন `clientshop.com`) থাকলে:

1. GitHub Variable `CUSTOM_DOMAIN` = `clientshop.com` সেট করুন (স্টোরফ্রন্টের জন্য)
2. `CNAME` ফাইলের কনটেন্ট বদলে `clientshop.com` করুন
3. API-এর জন্য: GitHub Variable `API_DOMAIN` = `api.clientshop.com` সেট করুন — তবে এই ডোমেইনের DNS অবশ্যই সেই একই Cloudflare অ্যাকাউন্টে zone হিসেবে যোগ করা থাকতে হবে
4. ডোমেইনের নেমসার্ভার Cloudflare-এ পয়েন্ট করুন (Cloudflare dashboard-এ ধাপে ধাপে নির্দেশনা দেওয়া থাকে)
5. re-deploy করুন

ডোমেইন না থাকলে সমস্যা নেই — সাইট এমনিতেই `<repo>.github.io/<repo-name>` আর `*.workers.dev`-এ লাইভ থাকবে, পরে ডোমেইন যোগ করা যায় যেকোনো সময়।

---

## 8. লোকালি রান করে টেস্ট করা

ডেলিভারির আগে নিজের কম্পিউটারে চালিয়ে দেখে নিন:

```bash
npm install                 # রুট থেকে — worker + web দুটোরই ডিপেন্ডেন্সি ইনস্টল হবে

# টার্মিনাল ১ — Backend
cd worker
npx wrangler d1 migrations apply arif-gadgets --local   # (D1 নাম বদলে থাকলে সেই নাম দিন)
npm run dev                 # http://127.0.0.1:8787

# টার্মিনাল ২ — Frontend
cd web
npm run dev                 # http://127.0.0.1:5173
```

`http://127.0.0.1:5173` খুলুন — স্টোরফ্রন্ট দেখা উচিত। `/admin`-এ গিয়ে "Create owner account" দিয়ে একটা টেস্ট লগইন বানিয়ে ড্যাশবোর্ড ঘুরে দেখুন।

---

## 9. ডেলিভারির আগে ভেরিফিকেশন চেকলিস্ট

- [ ] `npm run typecheck` — কোনো এরর ছাড়া পাস করে (রুট থেকে চালান)
- [ ] `npm run build --workspace web` — সফলভাবে বিল্ড হয়
- [ ] ৩ নং সেকশনের **সব 🔴 আইটেম** বদলানো হয়েছে (Analytics ID, GTM ID, dev-report Doc/Sheet ID)
- [ ] ৩ নং সেকশনের **সব 🟡 আইটেম** বদলানো হয়েছে (নাম, লোগো, ট্যাগলাইন)
- [ ] প্রোডাকশনে ডিপ্লয় করে `/health` এন্ডপয়েন্ট চেক করা হয়েছে (`{"ok":true,...}` আসছে)
- [ ] স্টোরফ্রন্টে গিয়ে সঠিক নাম/লোগো/রং দেখা যাচ্ছে
- [ ] `/admin`-এ লগইন করে ড্যাশবোর্ড ওপেন হচ্ছে
- [ ] টেস্ট প্রোডাক্ট যোগ করে, টেস্ট অর্ডার বসিয়ে পুরো ফ্লো একবার চালিয়ে দেখা হয়েছে
- [ ] ডেমো প্রোডাক্ট/পলিসি পেজ রিপ্লেস/মুছা হয়েছে (৫ নং সেকশন)
- [ ] ক্লায়েন্টকে `ADMIN_GUIDE.md` (বা তার থেকে বানানো একটা PDF) হ্যান্ডওভার করার জন্য প্রস্তুত

---

## 10. প্রজেক্ট স্ট্রাকচার রেফারেন্স

এই গাইডের ২ নং সেকশনে ফোল্ডার ম্যাপ আছে। প্রতিটা ফোল্ডার/ফাইলের ভেতরের বিস্তারিত ব্যাখ্যার জন্য `README.md`-এর **"API"** ও **"Layout"** সেকশন দেখুন — প্রতিটা route আর প্রতিটা লাইব্রেরি ফাইল কী করে তার তালিকা ওখানে আছে।

---

## 11. সাধারণ সমস্যা ও সমাধান

| সমস্যা | কারণ | সমাধান |
|---|---|---|
| Deploy workflow-এ "database not found" | D1 নাম ৩ নং সেকশনের ৪টা জায়গায় মিলছে না | তিনটা জায়গার নাম হুবহু এক রাখুন |
| API URL resolve হচ্ছে না, storefront বিল্ড fail | `API_DOMAIN`/`WORKERS_SUBDOMAIN`/`API_BASE_URL` — একটাও সেট নেই | যেকোনো একটা GitHub Variable সেট করুন |
| "Can't infer zone from route" | `API_DOMAIN` দেওয়া হয়েছে কিন্তু সেই ডোমেইন Cloudflare-এ zone হিসেবে যোগ করা নেই | ডোমেইন Cloudflare-এ যোগ করুন, বা `API_DOMAIN` বাদ দিয়ে `WORKERS_SUBDOMAIN` ব্যবহার করুন |
| Actions-এ `Cloud Flare` টোকেন পারমিশন এরর | টোকেনে D1/R2/KV/Workers Scripts এডিট পারমিশন নেই | `.github/workflows/cf-doctor.yml` ম্যানুয়ালি রান করুন — এটা ঠিক কোন পারমিশন মিসিং সেটা বলে দেয় |
| স্টোরফ্রন্টে পুরনো ক্লায়েন্টের নাম/লোগো দেখাচ্ছে | ৩ নং সেকশনের কোনো আইটেম বাদ পড়েছে | পুরো MUST-CHANGE তালিকা আবার চেক করুন |
| AI ফিচার "not configured" দেখাচ্ছে | সংশ্লিষ্ট Gemini key সেট করা হয়নি | ৬ নং সেকশন দেখুন |

---

**প্রশ্ন থাকলে বা কাস্টম কিছু লাগলে:**
Sayad Md Bayezid Hosan · Connect with Bayezid
📱 WhatsApp: 01519601517 · ✉️ support@sayadbayezid.com · 🔗 sayadbayezid.com
