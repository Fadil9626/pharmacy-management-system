# Changelog

All notable changes to **Remedy** are documented here.
This project follows [Keep a Changelog](https://keepachangelog.com) and [Semantic Versioning](https://semver.org).

## [1.0.0] — 2026-06-14

First complete release. A modular, POS-driven retail pharmacy management system
with Control-Center–licensable modules.

### Point of Sale
- Fast till with barcode scan / search and Enter-to-add.
- FEFO batch picking; expired stock is never sellable.
- Cash / card / mobile / on-account payments; cash tendered → change.
- Configurable sales tax/VAT and per-sale discounts.
- Printable receipts (logo, header/footer, FX rate when applicable).
- Open-till discipline: cashier must open a till with a cash float before selling (when Finance is on).

### Inventory
- Shared product catalogue with batch & expiry (FEFO) tracking.
- Stock write-offs / adjustments with reasons (expired, damaged, lost, recall, correction).
- Drug-class **categories** with public-health **surveillance tags**.
- Configurable near-expiry window and default reorder level.

### Purchasing
- Suppliers, purchase orders, goods-received notes, reorder suggestions.

### Customers
- Profiles, on-account credit with limits, loyalty points & spend tracking.
- Take account payments; full per-customer history.

### Market Pricing (module)
- Optional open-market FX pricing to protect margins during currency swings.
- Single-currency ledger: every sale stamps the FX rate, amounts stay in the ledger currency.

### Reports & Dashboard
- Revenue, gross profit (COGS), margin, payment mix, top products.
- Stock valuation and expiry exposure.
- Advanced dashboard: KPIs, 14-day sales trend, alerts, recent sales.

### Finance (module)
- Till shifts (open/close), cash movements, expenses, day-close reconciliation.

### Prescriptions & Controlled Drugs (modules)
- Clinical dispensing records.
- Compliant controlled-drug register; dispensing requires a customer and prescriber license.

### Branches (module)
- Branch-aware stock and reporting; oversight branch switcher; writes scoped to the active branch.

### Customisation
- White-label: logo upload, custom pharmacy name.
- Theme studio: system theme presets + custom colours (primary/secondary/sidebar/top-bar) with live preview, light/dark mode.
- Settings hub: business profile, currency, tax, loyalty, inventory rules, receipts, module status.

### Security & Architecture
- JWT auth; default admin seeded on first boot.
- Route-level **RBAC** and a configurable **roles × permissions** matrix.
- Code-split, lazy-loaded frontend routes.
- SQL migrations run automatically on boot.
- Control Center integration: remote module licensing, plan pricing sync.

[1.0.0]: https://github.com/Fadil9626/pharmacy-management-system/releases/tag/v1.0.0
