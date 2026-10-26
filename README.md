# Cloud Web Dashboard for ESP32 & STM32 (EMQX MQTT Bridge)

This server bridges your retro web dashboard to your college EMQX MQTT Broker (`54.38.215.217:1883`).

---

## Free 1-Click Hosting Options

### Option A: Deploy on Render.com (Recommended)
1. Push this folder to a GitHub repository.
2. Go to [https://render.com](https://render.com) and create a free account.
3. Click **New +** -> **Web Service**.
4. Connect your GitHub repository.
5. Set:
   * **Runtime:** `Node`
   * **Build Command:** `npm install`
   * **Start Command:** `node server.js`
   * **Instance Type:** `Free`
6. Click **Deploy Web Service**.
7. You will get a permanent public link: `https://your-app-name.onrender.com`!

### Option B: Deploy on Glitch.com (Instant - No Git Required)
1. Go to [https://glitch.com](https://glitch.com).
2. Click **New Project** -> **Import from folder** or upload `server.js`, `package.json`, and `public/index.html`.
3. It starts immediately with an instant link like `https://your-project.glitch.me`!
