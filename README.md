# Remedy — Pharmacy Management System

A modern, modular **retail/community pharmacy management system** (POS-driven, multi-branch ready) built as a licensable SaaS product. Every capability is a switchable module so each pharmacy runs exactly what it's licensed for.

> Part of the Banoyah Technologies product line. Modules are licensed centrally from the Control Center.

## Highlights

- **Point of Sale** — fast till with barcode scan, FEFO batch picking, cash/card/mobile/on-account payments, tax, receipts, and open-till cash-float discipline.
- **Inventory** — shared catalogue with batch & expiry (FEFO) tracking, expired-stock guard, write-offs/adjustments, drug-class categories (with public-health surveillance tags).
- **Purchasing** — suppliers, purchase orders, goods-received notes, reorder suggestions.
- **Customers** — profiles, on-account credit with limits, loyalty/spend tracking.
- **Market Pricing** — optional open-market FX pricing that protects margins, with a single-currency ledger for clean tax auditing.
- **Reports** — sales, gross margin (COGS), payment mix, top products, stock valuation & expiry exposure.
- **Finance** — till shifts, cash movements, expenses, day-close/reconciliation.
- **Prescriptions** & **Controlled-drugs register** — clinical records and a compliant dispensing register (prescriber + customer required).
- **Branches** — branch-aware stock and reporting with an oversight branch switcher.
- **White-label theming** — logo upload, custom name, system + custom colour themes (light/dark).
- **Security** — JWT auth, route-level RBAC, and a configurable **roles × permissions** matrix.

## Tech stack

- **Backend:** Node.js + Express + PostgreSQL (`pg`), JWT auth, SQL migrations run on boot.
- **Frontend:** React + Vite + Tailwind CSS (code-split, lazy-loaded routes).
- **Infra:** Docker (PostgreSQL), PM2 for process management.

## Getting started

```bash
# 1) Start PostgreSQL
docker compose up -d

# 2) Backend
cd backend
cp .env.example .env        # then edit secrets
npm install
npm start                   # runs migrations + seeds an admin on first boot

# 3) Frontend
cd ../frontend
npm install
npm run build               # the backend serves frontend/dist in production
# or: npm run dev           # Vite dev server (proxies /api -> backend)
```

The backend serves the built frontend, so the whole app runs on the backend port (default **5190**).

**Default login (first boot):** `admin@remedy.local` / `admin123` — change this immediately.

## Project layout

```
backend/         Express API, controllers, SQL migrations, lib (pricing, permissions, context)
frontend/        React + Vite + Tailwind SPA
docker-compose.yml   Local PostgreSQL
ecosystem.config.cjs PM2 config
```

## License

Proprietary © Banoyah Technologies. All rights reserved.
