# Deploy Frontend to Vercel

The root `vercel.json` configures Vercel to build and serve the frontend. No Root Directory change needed.

## Backend URL (required)

The frontend needs a **public** backend URL. Vercel cannot reach `localhost`.

| Phase | Backend URL | How |
|-------|-------------|-----|
| **Local dev** | `https://xxx.ngrok.io` | Use [ngrok](https://ngrok.com) to expose local backend |
| **Production** | `https://your-app.azurewebsites.net` | Your Azure backend URL |

## Manual steps (do these yourself)

### 1. Push to GitHub

```bash
git add .
git commit -m "Add Vercel deployment config"
git push origin main
```

### 2. Deploy on Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your repo: `Blockchain-Club-SRM/dashboard`
3. Click **Deploy** (first deploy may work but API calls will fail until step 4)

### 3. Add environment variable

1. In Vercel → your project → **Settings** → **Environment Variables**
2. Add:
   - **Name:** `VITE_API_URL`
   - **Value:** your backend URL (e.g. `https://abc123.ngrok.io` for local, or Azure URL later)
3. **Redeploy** (Deployments → ⋮ → Redeploy)

### 4. Backend CORS (when using Vercel frontend)

Add to your backend `.env`:

```
CORS_ORIGIN=https://your-app.vercel.app
```

Replace with your actual Vercel URL (e.g. `https://dashboard-xxx.vercel.app`).

### 5. Local backend + Vercel frontend (optional)

To use your local backend with the Vercel frontend:

1. Run `ngrok http 3000` in a terminal
2. Copy the ngrok URL (e.g. `https://abc123.ngrok-free.app`)
3. Set `VITE_API_URL` in Vercel to that URL
4. Add `CORS_ORIGIN=https://your-app.vercel.app` to your local `.env`
5. Restart your backend
6. Redeploy Vercel
