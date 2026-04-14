# Changelog — Vocto Expense System

All notable changes to this project are documented here.
Format: Version · Date · Commit · What changed · Why

---

## v1.8 · 2026-04-14 · `71dbcd7`
### Added
- Employee receives confirmation email after submitting a claim (#2)
- MD dashboard stats — pending count, approved this month total, all-time paid, top 5 spend categories (#1)
- Profile: employees can now update their display name (#6)
- Monthly expense report PDF — download per month from the payments table (#9)
- Vendor spend report PDF export from vendor directory (#10)
- Bulk verify/reject on accounts dashboard — select multiple pending claims and act at once (#11)
- Claim expiry warning — ⚠ Overdue badge on claims pending for more than 3 days (employee & accounts views) (#12)

---

## v1.7 · 2026-04-14 · `df2b91b`
### Security
- Added `.env` to `.gitignore` — prevents accidental secret commits
- Moved Supabase config to Angular environment files (out of source)
- Added `x-notify-secret` auth to `/api/notify` — only app can trigger emails
- Added `NOTIFY_SECRET` env var to Vercel production

### Added
- Email notification when employee edits a claim (accounts team notified)
- Print / PDF export button on claim detail modal (🖨)

---

## v1.6 · 2026-04-14 · `192e190`
### Added
- PO management (create, edit, view purchase orders)
- Vendor tracking with price history and ratings
- Budget management per category per month
- Recurring expense templates (monthly/quarterly/yearly)
- Advance requisition module
- Sales invoice module (export & DTA)
- Categories management
- Accounts and MD role-based dashboards
- Shared sidebar, notification bell
- GST lookup API (`/api/gst`)
- Email notifications for claim lifecycle (`/api/notify`) — submitted, verified, approved, paid, rejected
- Auth guards for employee, accounts, and MD roles
- Profile page

### Fixed
- **Security:** Employees were seeing all other employees' claims and POs. Now each employee only sees their own data (`getMyClaims` / `getMyPurchaseOrders` filtered by email)

---

## v1.5 · 2026-04-14 · `979f7d3`
### Fixed
- White border gaps on all pages caused by default html/body margin and padding

---

## v1.4 · 2026-04-14 · `669469b`
### Added
- Rejection reason modal on accounts and MD dashboards — reviewers can now enter a reason when rejecting a claim

---

## v1.3 · 2026-04-14 · `0e0b575`
### Fixed
- Component stylesheet budget raised to support mobile media queries (build was failing due to size limit)

---

## v1.2 · 2026-04-14 · `7c39934`
### Added
- Full mobile responsiveness across all views

---

## v1.1 · 2026-04-14 · `a6eaa6d`
### Added
- Toast notifications for all actions
- Drag & drop multi-file upload on claim submission
- Search, filter, and sort on claims list
- CSV export of claims
- Month-over-month spending comparison analytics

---

## v1.0 · 2026-04-14 · `4c044cf`
### Added
- Monthly filter for claims
- Rejected claims quick view
- Edit claim (only allowed when status is PENDING)

---

## v0.5 · 2026-04-14 · `135a86e`
### Changed
- Switched storage to public URLs — claim-documents bucket is now public

---

## v0.4 · 2026-04-14 · `013be8e`
### Added
- Claim detail modal with full timeline, comments section, and document viewer

---

## v0.3 · 2026-04-14 · `d5cf255`
### Fixed
- File attachment upload and viewing — surfaced upload errors, added unique filenames, switched to signed URLs

---

## v0.2 · 2026-04-14 · `a230765`
### Added
- Document preview in submit claim form after file selection

---

## v0.1 · 2026-04-14 · `56b4bfa`
### Added
- Initial release: Vocto Expense System
- Employee login, claim submission, status tracking
- Accounts dashboard for verification
- MD dashboard for approval
- Supabase auth and database integration
