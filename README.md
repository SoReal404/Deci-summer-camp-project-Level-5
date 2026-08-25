# Nexus

Local collaboration workspace for company-wide chat, tasks, team delivery, and a manual repository change log.

## Run it

Requires Node.js 18 or later.

```powershell
npm start
```

Open `http://localhost:3000`, then create the first local account. Data is stored locally in `data.json`, created automatically on first launch.

## Gemini AI explainer

To enable the real Gemini-powered explanation button, set a Gemini API key before starting:

```powershell
$env:GEMINI_API_KEY = "your-key"
npm start
```

Without a key, Nexus uses its built-in local explainer so the feature remains usable during development.
