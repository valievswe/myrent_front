# Agent Notes: myrent_front (Vue 3 + Tailwind 4)

This file is the working guide for future chats. It summarizes the frontend structure and the backend contract it talks to.

## Frontend Overview
- Stack: Vue 3 (SFC + `<script setup>`), Vite, Tailwind CSS 4, Pinia, Axios.
- Entry: `src/main.js` wires Pinia, router, dark mode, and auth guard.
- Routes: defined in `src/router/index.js`. Page titles come from `route.meta.title`.
- State: Pinia store in `src/stores`. `src/stores/main.js` is mostly template sample data.
- Styling: Tailwind 4 + project styles in `src/css`.

### Auth + HTTP Client
- HTTP client: `src/services/http.js` uses Axios.
- API base: `VITE_API_URL` or fallback to `${window.location.origin}/api`.
- Access token: stored in `localStorage` key `access_token`, injected as `Authorization: Bearer <token>`.
- Refresh flow: on 401 (non-`/auth/*`), call `/auth/refresh` using cookie; queued requests retry after refresh.
- Sign-in/out helpers: `src/services/auth.js` sets/clears the access token.

### Public Payments Client
- Separate client: `src/services/publicPayment.js` (no auth, `withCredentials: false`).
- Base URL: `VITE_PUBLIC_API_URL` or `VITE_API_URL` or `${window.location.origin}/api`.
- Prefix: `VITE_PUBLIC_PAY_PREFIX` or `/public/pay`.
- Public search can use `fields=min` to return minimal list payloads for faster auto-search.

### Routing Rules
- Public routes (no token required): `/pay`, `/pay/confirmation`, `/login` (see `route.meta.public`).
- Public detail page: `/pay/details` (no token required).
- All other routes require `access_token`; guard in `src/main.js` redirects to `/login` if missing.
- If adding a new public page, set `meta.public = true` in `src/router/index.js`.

### Services (API Layer)
Each file in `src/services` wraps backend endpoints:
- `auth.js`, `users.js`, `saleTypes.js`, `sections.js`, `owners.js`, `stores.js`, `stalls.js`,
  `attendances.js`, `contracts.js`, `transactions.js`, `statistics.js`, `reconciliation.js`.
- Pattern: accept params, normalize, call `http.<method>()`, return `data`.
- Prefer adding/using service functions instead of calling Axios directly in views.

## Backend Contract (NestJS + Prisma)
Backend summary is provided by the user; key points below for frontend alignment.

### Runtime + Auth
- Base API prefix: `/api`.
- Swagger: `/api/docs`.
- Auth: JWT access token in `Authorization: Bearer`, refresh token via httpOnly cookie.
- Access/refresh expiry set by `ACCESS_TIME`, `REFRESH_TIME`.

### Payments
- Providers: Click + Payme; manual/bank payments for contracts.
- Payme flows active only when `TENANT_ID=ipak_yuli`.
- Payment URLs:
  - Click: `https://my.click.uz/services/pay?...`
  - Payme: `https://checkout.paycom.uz/<base64>`

### Domain Entities (Prisma)
- `User` (roles: `SUPERADMIN`, `ADMIN`, `CHECKER`)
- `Owner` (unique `tin`)
- `Section` (pavilion, required assigned checker)
- `SaleType` (name + tax)
- `Stall` (daily fee)
- `Store` (monthly fee, unique `storeNumber`)
- `Contract` (Owner + Store, payment type, date window)
- `ContractPaymentPeriod` (per-month ledger)
- `Attendance` (per-stall-per-day)
- `Transaction` (attendance/contract payment)
- `ClickTransaction` (gateway tracking)

### Core Business Rules
- Store occupancy cannot overlap active contracts.
- Contract update blocked if current month already paid.
- Attendance is unique per stall+date and cannot be edited/deleted after paid.
- Contract payments can cover 1..12 months in one transaction.
- `PAID` transactions create `ContractPaymentPeriod` rows.

### API Surface (Prefix `/api`)
- Auth: `/auth/signin`, `/auth/refresh`, `/auth/me`, `/auth/signout`.
- CRUD: `/sale-types`, `/sections`, `/owners`, `/stores`, `/stalls`, `/users`.
- Contracts: `/contracts`, `/contracts/:id`, `/contracts/:id/history`, `/contracts/:id/refresh`,
  `/contracts/:id/payments`, `/contracts/:id/payments/manual`.
- Attendances: `/attendances`, `/attendances/:id`, `/attendances/:id/history`,
  `/attendances/:id/refresh`, `/attendances/:id/pay`.
- Transactions: `/transactions` with filters.
- Public: `/public/pay/contracts`, `/public/pay/contracts/:id`, `/public/pay/contracts/:id/pay`,
  `/public/pay/stalls/:id`.
- Stats/Reconciliation: `/statistics/*` and `/statistics/reconciliation/*`.
- Webhooks: `/click/prepare`, `/click/complete`; Payme gateway `/payme`.

## Frontend Implementation Tips
- Use service modules for API calls to keep auth/refresh handling centralized.
- For routes requiring no auth, set `meta.public = true`.
- When adding new API endpoints, mirror the backend shape in `src/services/<resource>.js`.
- Prefer `VITE_API_URL` for local dev; fallback is `window.location.origin + /api`.

## Views + Data Flows (Routed Screens)
- `/login` (`src/views/LoginView.vue`): calls `signIn({ email, password })`, stores access token, redirects to `/dashboard` on success.
- `/dashboard` (`src/views/HomeView.vue`): loads counts via `listStores`, `listStalls`, `listOwners`, `listContracts` (active + archived).
- `/sale-types` (`src/views/SaleTypesView.vue`): `listSaleTypes` with search/pagination; create/update/delete sale types.
- `/sections` (`src/views/SectionsView.vue`): `listSections` + `listUsers({ role: 'CHECKER' })`; requires `assigneeId` on create/edit.
- `/owners` (`src/views/OwnersView.vue`): `listOwners` with search/pagination; create/update/delete owners; displays active store numbers from contract date windows.
- `/stores` (`src/views/StoresView.vue`): `listStores({ withContracts: true, onlyFree: false })` with query-sync; CRUD; CSV export; uses `listSections` for labels.
- `/stalls` (`src/views/StallsView.vue`): `listStalls` with query-sync; CRUD; uses `listSaleTypes` + `listSections`; inline attendance preview via `listAttendances`.
- `/stalls/:id` (`src/views/StallDetailView.vue`): `getStall` + `getStallHistory({ days })`; shows payment summary and daily attendance list.
- `/contracts` (`src/views/ContractsView.vue`): `listContracts` with filters; client-side search across owners/stores; CRUD; `refreshContract`; `getContractHistory`; `manualContractPayment`; payment URL + QR generation; XLSX export.
- `/contracts/:id` (`src/views/ContractDetailView.vue`): `getContract`, `listContractPayments`, `refreshContract`; manual payment modal posts to `/payments/manual`.
- `/attendances` (`src/views/AttendancesView.vue`): `listAttendances` + CRUD; `getAttendancePayUrl` for payment/QR; bulk daily workflow using `dateFrom/dateTo` and mass create/delete.
- `/transactions` (`src/views/TransactionsView.vue`): `listTransactions` with filters; XLSX export; debt summaries built using `listContracts` + `listAttendances`.
- `/statistics` (`src/views/StatisticsView.vue`): statistics endpoints + `listAttendances`/`listContracts` for charts and debt summaries.
- `/reconciliation` (`src/views/ReconciliationView.vue`): `getLedger`, `getMonthlyRollup`, `getContractsMonthlyStatus`; XLSX export via `xlsx`.
- `/map` (`src/views/MapView.vue`): loads sections/stores/stalls/contracts; `listAttendances` by day; create/delete attendance; update stall; payment URL on attendance; filters persisted in `localStorage`.
- `/users` (`src/views/UsersView.vue`): `listUsers` with search/role filters; create/update/delete users.
- `/pay` (`src/views/PublicPayView.vue`): public auto-search for contracts or stalls; uses `fields=min` for list results; routes to detail page.
- `/pay/details` (`src/views/PublicPayDetailView.vue`): reads `contractId` or `stall` from query, fetches `getPublicContract`/`getPublicStall`, and initiates payment.
- `/pay/confirmation` (`src/views/PublicPayConfirmationView.vue`): reads `contractId` or `stall` from query and fetches `getPublicContract`/`getPublicStall` for status-only confirmation.

## API Mapping (Frontend Service Contracts)
Request/response shapes below reflect current usage in `src/services` and the views.

### Auth (`src/services/auth.js`)
- `POST /auth/signin` payload `{ email, password }` -> response `{ accessToken, ... }`
- `GET /auth/me` -> response `User`
- `POST /auth/signout` -> response ignored

### Users (`src/services/users.js`)
- `GET /users` params `{ search?, role?, page, limit }` -> response `{ data: User[], pagination }` or raw array (normalized)
- `POST /users` payload `{ email, password, firstName?, lastName?, role }` -> `User`
- `PUT /users/:id` payload `{ email?, password?, firstName?, lastName?, role? }` -> `User`
- `DELETE /users/:id` -> response ignored

### Sale Types (`src/services/saleTypes.js`)
- `GET /sale-types` params `{ search?, page, limit }` -> array or `{ data, pagination }` (normalized)
- `POST /sale-types` payload `{ name, description?, tax }` -> `SaleType`
- `PUT /sale-types/:id` payload `{ name?, description?, tax? }` -> `SaleType`
- `DELETE /sale-types/:id` -> response ignored

### Sections (`src/services/sections.js`)
- `GET /sections` -> `Section[]`
- `POST /sections` payload `{ name, description?, assigneeId }` -> `Section`
- `PATCH /sections/:id` payload `{ name?, description?, assigneeId }` -> `Section`
- `DELETE /sections/:id` -> response ignored

### Owners (`src/services/owners.js`)
- `GET /owners` params `{ search?, page, limit }` -> `{ data: Owner[], pagination }`
- `POST /owners` payload `{ fullName, tin, phoneNumber?, address? }` -> `Owner`
- `PATCH /owners/:id` payload `{ fullName?, tin?, phoneNumber?, address? }` -> `Owner`
- `DELETE /owners/:id` -> response ignored

### Stores (`src/services/stores.js`)
- `GET /stores` params `{ search?, page, limit, onlyFree?, withContracts?, asOf? }` -> `{ data: Store[], pagination|total }`
- `POST /stores` payload `{ storeNumber, area?, description?, sectionId? }` -> `Store`
- `PATCH /stores/:id` payload `{ storeNumber?, area?, description?, sectionId? }` -> `Store`
- `DELETE /stores/:id` -> response ignored

### Stalls (`src/services/stalls.js`)
- `GET /stalls` params `{ search?, page, limit }` -> `{ data: Stall[], pagination|total }`
- `POST /stalls` payload `{ area, saleTypeId, sectionId, stallNumber, description? }` -> `Stall`
- `PATCH /stalls/:id` payload `{ area?, saleTypeId?, sectionId?, stallNumber?, description? }` -> `Stall`
- `DELETE /stalls/:id` -> response ignored
- `GET /stalls/:id` -> `Stall` (includes `Section` and `SaleType` in detail view)
- `GET /stalls/:id/history` params `{ days? }` -> `{ items: Attendance[], summary }`

### Attendances (`src/services/attendances.js`)
- `GET /attendances` params `{ page, limit, stallId?, dateFrom?, dateTo? }` -> `{ data: Attendance[], total|pagination }`
- `POST /attendances` payload `{ date, stallId }` -> `Attendance`
- `PUT /attendances/:id` payload `{ date, stallId }` -> `Attendance`
- `DELETE /attendances/:id` -> response ignored
- `GET /attendances/:id/pay?type=click|payme` -> `{ url, provider? }`
- `GET /attendances/:id/refresh` -> `Attendance`
- `GET /attendances/:id/history` params `{ days? }` -> `{ items: Attendance[], summary }`

### Contracts (`src/services/contracts.js`)
- `GET /contracts` params `{ page, limit, isActive?, paid?, paymentType? }` -> `{ data: Contract[], pagination|total }`
- `POST /contracts` payload `{ ownerId, storeId, shopMonthlyFee?, certificateNumber?, issueDate?, expiryDate?, isActive, paymentType }` -> `Contract`
- `PUT /contracts/:id` payload `{ ownerId?, storeId?, shopMonthlyFee?, certificateNumber?, issueDate?, expiryDate?, isActive?, paymentType? }` -> `Contract`
- `DELETE /contracts/:id` -> response ignored (soft delete on backend)
- `GET /contracts/:id` -> `Contract` (includes `owner`, `store`, `transactions`, `paymentSnapshot?`)
- `GET /contracts/:id/refresh` -> `Contract` (updated snapshot/transactions)
- `GET /contracts/:id/history` params `{ limit? }` -> `{ transactions, total, owner, store, summary }`
- `GET /contracts/:id/payments` -> `{ items: ContractPaymentPeriod[], snapshot }`
- `POST /contracts/:id/payments/manual` payload `{ transferNumber, transferDate?, months?, startMonth?, amount?, notes? }` -> `{ items, snapshot }`

### Transactions (`src/services/transactions.js`)
- `GET /transactions` params `{ search?, page, limit, status?, paymentMethod?, source?, dateFrom?, dateTo?, contractId?, attendanceId? }` -> `{ data: Transaction[], pagination|total }`
- `POST /transactions` payload `{ ... }` -> `Transaction`
- `PUT /transactions/:id` payload `{ status?, ... }` -> `Transaction`
- `DELETE /transactions/:id` -> response ignored

### Statistics (`src/services/statistics.js`)
- `GET /statistics/daily` params `{ type? }` -> `{ count, revenue }`
- `GET /statistics/monthly` params `{ type? }` -> `{ count, revenue }`
- `GET /statistics/monthly/:year/:month` params `{ type? }` -> `{ month, count, revenue, stall, store }`
- `GET /statistics/monthly/:year/:month/details` params `{ type? }` -> `{ totals, stall, store, methods }`
- `GET /statistics/current` params `{ type? }` -> `{ revenue }`
- `GET /statistics/totals` params `{ from?, to?, type?, method?, status?, groupBy? }` -> `{ count, revenue }`
- `GET /statistics/series` params `{ groupBy, from?, to?, type?, method?, status? }` -> `{ labels, series: [{ key, data }] }`
- `GET /statistics/series/monthly` params `{ months?, type? }` -> `{ labels, series }`

### Reconciliation (`src/services/reconciliation.js`)
- `GET /statistics/reconciliation/ledger` params `{ year, month, type?, method?, status?, page?, limit? }` -> `{ rows, pagination, from?, to? }`
- `GET /statistics/reconciliation/monthly` params `{ months?, type?, method? }` -> `{ labels, series }`
- `GET /statistics/reconciliation/contracts/monthly-status` params `{ year, month }` -> `{ paid: [], unpaid: [], totals }`
- `GET /statistics/reconciliation/contracts` params `{ ... }` -> `{ ... }` (not used in UI)
- `GET /statistics/reconciliation/stalls/monthly-status` params `{ ... }` -> `{ rows, totals }`

### Public Payments (`src/services/publicPayment.js`)
- `GET /public/pay/contracts` params `{ storeNumber?, tin?, fields? }` -> list of contract entries (normalized in `utils/publicPayments`); `fields=min` returns minimal list items.
- `GET /public/pay/contracts/:id` -> contract entry detail.
- `POST /public/pay/contracts/:id/pay` -> `{ paymentUrl|url|click_payment_url }`
- `GET /public/pay/stalls/:id` params `{ date?, fields? }` -> stall attendance/payment payload (normalized in `utils/publicPayments`); `fields=min` returns minimal list items.

## Data Shapes Used in UI
The UI relies on these fields (non-exhaustive) when rendering:
- `User`: `id`, `email`, `firstName`, `lastName`, `role`.
- `Owner`: `id`, `fullName`, `tin`, `phoneNumber`, `address`, `contracts[]`.
- `Section`: `id`, `name`, `description`, `assignedCheckerId`, `assignedChecker { firstName, lastName }`.
- `SaleType`: `id`, `name`, `description`, `tax`.
- `Store`: `id`, `storeNumber`, `area`, `description`, `sectionId`, `isOccupied`, `payme_payment_url`, `click_payment_url`, `contracts[]`.
- `Stall`: `id`, `stallNumber`, `area`, `description`, `saleTypeId`, `sectionId`, `dailyFee`, `SaleType`, `Section`.
- `Contract`: `id`, `ownerId`, `storeId`, `shopMonthlyFee`, `certificateNumber`, `issueDate`, `expiryDate`, `isActive`, `paymentType`, `owner`, `store`, `transactions[]`, `paymentSnapshot`.
- `Attendance`: `id`, `stallId`, `date`, `amount`, `status`, `transaction`, `Stall`.
- `Transaction`: `id`, `transactionId`, `amount`, `status`, `paymentMethod`, `createdAt`, `contract`, `attendance`.

## Open TODOs / Template Artifacts
- `src/stores/main.js` still contains template sample data (clients/history).
  Update or remove if you no longer need demo data.
