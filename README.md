# LU Completion Tracker

A dashboard for tracking your folks' Learning Unit (LU) completion — upload
roster exports, filter/sort by status or percentage, email reminders to
anyone who hasn't finished, and sign in with a real account.

## File structure

```
LU-4/
├── index.html          Page shell — loads libraries and scripts in order
├── css/
│   └── styles.css       All styling
└── js/
    ├── utils.js          Status logic, date/column parsing helpers (plain JS)
    ├── config.js         Supabase project credentials + client setup
    ├── AuthModal.js       Sign in / sign up modal component (JSX)
    ├── App.js             Main dashboard component — uploads, filters, table (JSX)
    └── main.js            Renders <App/> into the page
```

No build step or bundler is used — Babel transforms the JSX files
(`AuthModal.js`, `App.js`, `main.js`) directly in the browser. This keeps the
project easy to open and edit, at the cost of a slightly slower first load
than a bundled/compiled app would have.

## Running it

1. Open a terminal in the `LU-4` folder.
2. Install dependencies:

  ```bash
  npm install
  ```

3. Start the development server:

  ```bash
  npm run dev
  ```

4. Open http://localhost:8000 in your browser. Edits saved in VS Code will
  auto-refresh the browser.

## Uploading data

Click **Add file(s)** and upload one or more `.xlsx`/`.csv`/etc. exports with
columns for name, email, LU/subject, completion %, and a date (either a real
deadline or a "last updated" timestamp — both are supported and handled
differently). Column headers are auto-detected, so they don't need to match
exactly. Each uploaded file gets its own tab.

## Login (Supabase)

The **Sign in** button in the top-right uses [Supabase](https://supabase.com)
for real email/password accounts. Credentials live in `js/config.js`:

```js
const SUPABASE_URL = 'https://erwelgfyuhorkpfpzzee.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_...';
```

If you ever need to point this at a different Supabase project, swap those
two values in `js/config.js` for your own project's URL and
publishable/anon key from **Project Settings -> API**.

Notes:
- The Supabase library loads from `jsdelivr`. This works fine in a normal
  browser or via Live Server, but will be blocked if you preview this file
  inside a sandboxed environment that only allows scripts from `cdnjs`.
- If sign-up doesn't seem to work, check **Authentication -> Settings** in
  your Supabase dashboard — if "Confirm email" is turned on, new accounts
  need to click a confirmation link before they can sign in.

## Data storage

Uploaded rosters are saved via the browser's local storage-like API so they
persist between sessions on the same browser/device. This is not a shared
database — if you want everyone using this dashboard to see the same data,
that would need to be wired up to Supabase's database as a next step.
