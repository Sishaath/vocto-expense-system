# Changelog — Vocto Expense System

All notable changes to this project are documented here.
Format: Version · Date · Commit · What changed · Why

---

## v2.1 · 2026-04-15 · `4ed968c`
### Fixed
- **MD Dashboard:** `approvedClaims` getter now applies search query (was silently ignoring it)
- **MD Dashboard:** "Total Paid" stat now shows current month only — was showing all-time total
- **MD Dashboard:** Notification read-mark now uses `claim_number` as entity ref — was using `claim.id`, causing notifications to never clear
- **MD Dashboard:** `approvePO` now catches and surfaces DB errors (was failing silently)
- **MD Dashboard:** Approve/Reject buttons disabled during processing — prevents accidental double-submissions
- **MD Dashboard:** Reject Advance Requisition replaced `prompt()` with a proper modal
- **Accounts Dashboard:** `bulkVerify` now counts per-claim successes and failures — reports partial failures instead of silent corruption
- **Accounts Dashboard:** `bulkReject` replaced browser `prompt()` with a proper reject modal
- **Accounts Dashboard:** Delete Recurring Template replaced `confirm()` with a proper confirm modal
- **Accounts Dashboard:** `paidClaims` table now respects the selected month filter (was showing all-time paid claims)
- **Employee Dashboard:** Search now matches category field in addition to title and voucher number
- **Employee Dashboard:** Hardcoded production API URL replaced with `environment.apiBaseUrl` — was breaking on staging
- **Employee Dashboard:** File viewer now correctly handles multi-file (JSON array) attachments
- **Submit Claim:** Validation error now lists exactly which fields are missing instead of generic message
- **Submit Claim:** Template pre-fill category default fixed (`Travel & Transport` → `Travel & Accommodation`)
- **All:** Hardcoded recipient emails (`yogeshwari@...`, `rrk@...`, etc.) replaced with dynamic `getUsersByRole()` lookup — notifications now route to whoever holds the role, not a fixed person

### Added
- `SupabaseService.getUsersByRole(role)` — queries active users by role for dynamic notification routing

---

## v2.0 · 2026-04-15 · `8215fbf`
### Changed
- **Admin Panel:** Complete UI redesign — light gray page background, white cards, colored top-border stat cards per role
- **Admin Panel:** Inline role dropdown per row replaced with "Change Role" modal — shows each role with a description, prevents accidental changes
- **Admin Panel:** Action buttons redesigned — `Change Role`, `Resend`, `Remove` with clear labels and hover states
- **Admin Panel:** Invite link panel redesigned as a compact green strip at bottom of invite card
- **Admin Panel:** `admin` role locked to `/admin` only — removed from `accountsGuard` and `mdGuard`, blocked from all employee routes via `authGuard`
- **Admin Panel:** `/admin` route now protected by `adminGuard` — non-admins can't navigate to it directly

### Fixed
- **Invite flow:** Email was sending `/set-password` without a token — switched from `/auth/v1/invite` to `/auth/v1/admin/generate_link` to get the actual Supabase invite token URL
- **Invite flow:** Invite link returned to frontend so admin can copy and share directly (WhatsApp, email, etc.)

### Added
- **Admin Panel:** "Pending Invite" badge for users who haven't accepted their invite yet (yellow badge, distinct from Active/Inactive)
- **Admin Panel:** Copy invite link button — after sending or resending an invite, admin gets a copyable link

---

## v1.9 · 2026-04-14 · `79039ca`
### Added
- Admin dashboard (`/admin`) — separate portal for admin role, no employee views
- User management: invite users by email, assign role (Employee / Accounts / MD / Admin)
- Invited users receive email with set-password link
- Role-based login redirect — admin → `/admin`, accounts → `/accounts`, MD → `/md`, employee → `/dashboard`
- Active/Inactive toggle per user — disable access without deleting account
- Last login date shown for each user
- Resend invite button for users who never set their password
- Delete user — removes from auth and role table with confirmation prompt
- User count stat cards by role (Total / Employee / Accounts / MD / Admin)
- `user_roles` table in Supabase drives all role checks (replaces hardcoded email arrays)
- New API endpoints: `/api/get-role`, `/api/invite-user`, `/api/admin-users` (all use service role key)
- Sidebar shows "User Management" link only for admin users

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
