# Freshroots Demand Planning Assistant

Weekly demand-planning decision assistant for Raghav Kulkarni. It follows the weekly planning map:

Raghav uploads weekly data → rubric + data cleaning → Gemini trends and highlights → recommended order quantity → Raghav approves or rejects → threshold check → PO on Zoho. A kill switch emails you when more than 50% of a week's recommendations are rejected.

## Run

```bash
npm install
npm run dev      # http://localhost:3400, demo data loads automatically
npm test         # business-logic tests, including the 8 cases from the brief
```

## Integrations (all optional)

Copy `.env.example` to `.env.local`. Each integration runs as a labelled simulation until its keys are set.

| Step | Env vars | Without them |
|---|---|---|
| Gemini trends + highlights | `GEMINI_API_KEY`, `GEMINI_MODEL` | Rule-generated highlights |
| PO on Zoho | `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` (Inventory scopes), `ZOHO_DC`, `ZOHO_ORG_ID`, `ZOHO_VENDOR_ID` | Simulated PO numbers (`SIM-PO-…`) |
| Kill-switch email | `RESEND_API_KEY`, `KILL_SWITCH_EMAIL` | The email is prepared and logged, not sent |

## Layout

- `src/business`: rules, calculations, validation, decisions, kill switch, highlight validation. No React.
- `src/data`: demo SAP and Zoho exports (60 SKUs, 24 distributors, 26 weeks) plus three weeks of decision history.
- `src/components`, `src/app`: UI. `src/app/api`: Gemini, Zoho and email routes.
- `src/state/store.tsx`: app state. The audit log is the source of truth for decisions, POs and kill-switch events.
