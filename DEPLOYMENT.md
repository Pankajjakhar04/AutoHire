# AutoHire Deployment Guide

## Frontend Deployment (Vercel)

### Steps:
1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click "Add New" → "Project"
3. Select your `AutoHire` repository
4. Configure:
   - **Root Directory**: `frontend/`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
5. Add Environment Variable:
   - `VITE_API_URL`: Your Render backend URL (e.g., `https://autohire-backend.onrender.com`)
6. Click "Deploy"

**Frontend will be live at**: `https://your-app-name.vercel.app`

---

## Backend Deployment (Render)

### Prerequisites:
- MongoDB Atlas account (free tier available at [mongodb.com](https://mongodb.com))
- Google Cloud Storage credentials (if using GCS)
- Google Drive credentials (if using Drive)

### Steps:

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Add deployment configs"
   git push origin main
   ```

2. **Go to [render.com](https://render.com)**:
   - Sign in with GitHub account
   - Click "New +" → "Web Service"
   - Select `AutoHire` repository
   - Configure:
     - **Name**: `autohire-backend`
     - **Root Directory**: `backend/`
     - **Environment**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Plan**: Free (or Starter for production)

3. **Set Environment Variables** in Render Dashboard:
   
   Go to your service → "Environment" and add:
   
   | Variable | Value | Notes |
   |----------|-------|-------|
   | `NODE_ENV` | `production` | |
   | `MONGODB_URI` | Your MongoDB Atlas connection string | Get from MongoDB Atlas → Connect |
   | `CLIENT_URL` | Your Vercel frontend URL | e.g., `https://your-app.vercel.app` |
   | `JWT_ACCESS_SECRET` | Strong random string (32+ chars) | Generate one and keep it secret |
   | `JWT_REFRESH_SECRET` | Different strong random string | Different from access secret |
   | `ACCESS_TOKEN_TTL` | `15m` | Token expiry time |
   | `REFRESH_TOKEN_TTL` | `7d` | Refresh token expiry |
   | `GCP_BUCKET` | Your GCS bucket name | If using Google Cloud Storage |
   | `GCP_PROJECT_ID` | Your GCP project ID | If using Google Cloud Storage |
   | `GCP_CLIENT_EMAIL` | Service account email | If using Google Cloud Storage |
   | `GCP_PRIVATE_KEY` | Service account private key | If using Google Cloud Storage |
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email | If using Google Drive |
   | `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Service account private key | If using Google Drive |

4. **Deploy**:
   - Click "Create Web Service"
   - Render will automatically deploy from your GitHub repo
   - Monitor the deployment logs
   - Your backend will be live at: `https://autohire-backend.onrender.com`

### Important Notes:

- **Free tier on Render**: Services spin down after 15 minutes of inactivity. For production, upgrade to Starter plan.
- **MongoDB Atlas**: Use free tier cluster (M0). Add Render IP to Network Access whitelist.
- **Environment Variables**: Never commit `.env` files to GitHub. Use the Render dashboard for secrets.

---

## Post-Deployment

1. **Test Backend Health**:
   ```
   https://autohire-backend.onrender.com/api/health
   ```
   Should return: `{"status":"ok","service":"backend"}`

2. **Update Frontend API URL**:
   - If you haven't already, set `VITE_API_URL` in Vercel to your Render backend URL
   - Redeploy frontend if needed

3. **Test API Routes**:
   - Try login, job listing, resume upload, etc.

---

## Troubleshooting

### Backend won't start:
- Check Render logs for errors
- Verify all environment variables are set
- Ensure MongoDB URI is correct and Render IP is whitelisted

### CORS errors:
- Make sure `CLIENT_URL` environment variable is set to your Vercel frontend URL
- Check CORS configuration in `backend/src/server.js`

### MongoDB connection fails:
- Verify MongoDB Atlas connection string
- Add Render IP to MongoDB Network Access: Go to MongoDB Atlas → Network Access → Add IP Address → Allow Access from Anywhere (0.0.0.0)

### File uploads not working:
- Verify GCS credentials are correct
- Check bucket permissions
- Ensure service account has Storage Admin role
