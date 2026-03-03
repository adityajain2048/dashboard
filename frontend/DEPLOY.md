# Deploy Frontend to Vercel

## Backend URL (required)

The frontend needs a **public** backend URL. Vercel cannot reach `localhost`.

| Phase | Backend URL | How |
|-------|-------------|-----|
| **Local dev** | `https://xxx.ngrok.io` | Use [ngrok](https://ngrok.com) to expose local backend |
| **Production** | `https://your-app.azurewebsites.net` | Your Azure backend URL |

## Vercel setup

### 1. Import project

1. Go to [vercel.com/new](https://vercel.com/new) and import your Git repo
2. Set **Root Directory** to `frontend`
3. Deploy (will fail to fetch data until `VITE_API_URL` is set)

### 2. Environment variable

In Vercel → Project → Settings → Environment Variables:

| Variable       | Value                                      |
|----------------|--------------------------------------------|
| `VITE_API_URL` | Your backend URL (ngrok or Azure)          |

Redeploy after adding the variable.

### 3. Backend CORS

On your backend (local or Azure), set:

```
CORS_ORIGIN=https://your-app.vercel.app
```

Use your actual Vercel URL. For multiple origins, use commas: `https://a.vercel.app,https://b.vercel.app`
