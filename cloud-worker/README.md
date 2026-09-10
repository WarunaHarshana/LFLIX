---
title: LFLIX Cloud Worker
emoji: 🎬
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
---

# ☁️ LFLIX 24/7 Headless Cloud Worker

Automated server-to-server downloader for Google Drive. Downloads direct video links and torrents at **1 Gbps datacenter speeds** directly into your Google Drive, using **0 bytes of local disk** and **0 bytes of upload bandwidth** on your PC.

---

## 🚀 Option 1: Render.com (100% Free & No Credit Card Required)

Render provides free Docker container hosting with 750 free hours/month and no credit card required.

### Step 1: Sign up at Render
1. Go to [render.com](https://render.com) and create a free account (no credit card needed).

### Step 2: Deploy Web Service
1. Click **New +** ➔ **Web Service**.
2. Connect your GitHub repository containing the `cloud-worker` folder.
3. Configure:
   - **Name**: `lflix-worker`
   - **Language/Runtime**: `Docker`
   - **Instance Type**: **Free** ($0/mo)
4. Under **Environment Variables**, add:
   - `RCLONE_CONFIG_BASE64`: *(Click "📋 Copy Rclone Secret" in LFLIX Settings and paste here)*
   - `LFLIX_API_KEY`: *(Optional secret token of your choice)*
5. Click **Create Web Service**.

### Step 3: Connect to LFLIX
Copy your Render URL (e.g., `https://lflix-worker.onrender.com`), paste it into LFLIX **Settings** ➔ **Worker URL**, and click **Test Connection**!

---

## 🚀 Option 2: Hugging Face Spaces (Requires Pro for Docker)

If you have a Hugging Face PRO subscription:
1. Create a Space at [huggingface.co/new-space](https://huggingface.co/new-space) (SDK: **Docker**, Blank).
2. Upload `Dockerfile`, `main.py`, `requirements.txt`, and `README.md`.
3. In Space **Settings** ➔ **Variables and secrets**, add `RCLONE_CONFIG_BASE64` (copied from LFLIX Settings).
4. Copy your direct Space URL and paste into LFLIX Settings.

---

## 🚀 Option 3: Run on Any VPS or Local Docker

```bash
docker build -t lflix-worker .
docker run -d -p 7860:7860 \
  -e RCLONE_CONFIG_BASE64="<YOUR_BASE64_RCLONE_SECRET>" \
  -e LFLIX_API_KEY="<YOUR_TOKEN>" \
  lflix-worker
```
