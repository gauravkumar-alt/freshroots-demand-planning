# Freshroots Demand Planning Assistant

Weekly demand-planning decision assistant for Raghav Kulkarni. It follows the weekly planning map:

Raghav uploads weekly data → rubric + data cleaning → Gemini trends and highlights → recommended order quantity → Raghav approves or rejects → threshold check → PO on Zoho. A kill switch emails you when more than 50% of a week's recommendations are rejected.

## Run

```bash
npm install
npm run dev      # http://localhost:3400, the Freshroots sample files load automatically
npm test         # business-logic tests, including the 8 cases from the brief
```

## Storage: Supabase

Decisions, the audit log, uploaded files, retired rubric notes and quarter outcomes are saved in Supabase, so everyone sees the same state.

1. Run `supabase/schema.sql` once in the project's SQL editor (creates `fr_*` tables; the audit table is append-only).
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (server-side only; never exposed to the browser).

Without them the server keeps everything in memory and the app shows a "not saved" banner.

## Integrations

Copy `.env.example` to `.env.local`. Each integration runs as a labelled simulation until its keys are set.

| Step | Env vars | Without them |
|---|---|---|
| Gemini trends + highlights | `GEMINI_API_KEY`, `GEMINI_MODEL` | Rule-generated highlights |
| PO on Zoho | `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` (Inventory scopes), `ZOHO_DC`, `ZOHO_ORG_ID`, `ZOHO_VENDOR_ID` | Simulated PO numbers (`SIM-PO-…`) |
| Kill-switch email | `RESEND_API_KEY`, `KILL_SWITCH_EMAIL` | The email is prepared and logged, not sent |

## Layout

- `src/business`: rules, calculations, validation, decisions, kill switch, highlight validation. No React.
- `src/data`: the Freshroots sample files (15 SKUs, 4 distributors, weeks 27–42 of 2026), used until real files are uploaded.
- `src/lib/server`: Supabase storage, the decision → kill-switch check → Zoho PO workflow, Gemini, Zoho and email.
- `src/components`, `src/app`: UI and API routes.
- `src/state/store.tsx`: client state, loaded from the server. The audit log is the source of truth for decisions, POs and kill-switch events.
