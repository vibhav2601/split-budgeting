# Budget Reconciler

 If you love splitwise and credit card optimization but still want to know how much you're spending this is for you. 

 Split budgeting consolidates expenses across different accounts, venmo and splitwise and recommends merging expenses. This webapp uses local SQLite so it deduped and persists charges and budgets across sessions.

 Eg: 
 Credit card charge TACO BELL 5/1/25 67.8$

 Splitwise/venmo 68$ split among three people, split budgeting will consolidate and recommend you merging transactions and count only (67.8/3) when the dinner was split between 3 people.

## Features

- Import credit card & Venmo from CSV
- Import a single transaction from a screenshot
- Sync Splitwise expenses through the Splitwise API
- Reconcile Splitwise expenses against credit card or Venmo transactions
- Get AI category suggestions for uncategorized transactions
- Review monthly spend, recent transactions, and source data from the UI
- Store everything locally in SQLite so it persists across sessions,

## Install

### 1. Install dependencies

- Run `npm install`

### 2. Create your env file

- Run `cp .env.local.example .env.local`

### 3. Add your keys

- Set `OPENAI_API_KEY` for AI features
- Set `SPLITWISE_API_KEY` if you want Splitwise sync
- Optionally set `OPENAI_MODEL`
- Optionally set `BUDGET_DB_PATH`

### 4. Start the app

- Run `npm run dev`
- Open `http://localhost:3000`
