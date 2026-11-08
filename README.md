# YouTube Video Summarizer (YVS)

A full-stack, production-ready application that transcribes and summarizes YouTube videos into structured overviews, key points, and takeaways using AI.

Built with **React (frontend)** and **Node.js/Express (backend)** unified into a single application that can run anywhere with zero mandatory external services.

---

## 🚀 Key Highlights & Capabilities

- ⚡ **Zero-Dependency Startup**: Boots instantly on any machine. Operates with in-memory caching if MongoDB or Redis are not present.
- 🎯 **Binary-Free Processing**: Extracts titles and transcripts via HTTP (YouTube oEmbed + timedtext captions). No local Python, `ffmpeg`, or `yt-dlp` installation strictly required.
- 🤖 **Google Gemini AI**: Uses `@google/genai` with `gemini-3.8-flash` for structured, high-accuracy summaries.
- 🐳 **Docker-Ready**: Multi-stage `Dockerfile` and `docker-compose.yml` for single-command deployment to any cloud provider or VPS.
- 🌐 **Single-Port Architecture**: Express handles `/api/*` and serves the compiled React SPA on a single port (`3000` or `$PORT`).

---

## 🏃 Quick Start

### Option 1: Run Locally (Node.js)

**Requirements**: Node.js ≥ 18

```bash
# 1. Clone the repository
git clone <repository-url>
cd youtube-video-summarizer

# 2. Install dependencies
npm install

# 3. Configure environment variables (optional, but recommended for Gemini)
cp .env.example .env
# Add your GEMINI_API_KEY in .env

# 4. Start in development mode (hot reloading)
npm run dev

# OR build and run in production mode
npm run build
npm start
```

Open your browser at **http://localhost:3000**.

---

### Option 2: Run with Docker Compose

**Requirements**: Docker & Docker Compose

```bash
# Start container with one command
docker compose up --build
```

Access the app at **http://localhost:3000**.

---

### Option 3: Standard Docker Container

```bash
# Build Docker image
docker build -t yvs-app .

# Run container
docker run -p 3000:3000 -e GEMINI_API_KEY=your_gemini_key yvs-app
```

---

## ☁️ Cloud Deployment Guides

### Deploy to Render
1. Create a **New Web Service** pointing to your repository.
2. Build Command: `npm install && npm run build`
3. Start Command: `npm start`
4. Set Environment Variables:
   - `GEMINI_API_KEY`: Your Google Gemini API key.
   - `NODE_ENV`: `production`

### Deploy to Google Cloud Run
1. Build and push the image or connect your Git repository.
2. Cloud Run automatically injects `PORT=8080` (the app dynamically adapts to `$PORT`).
3. Set the `GEMINI_API_KEY` secret in the Cloud Run configuration.

### Deploy to Railway / Fly.io / DigitalOcean App Platform
1. Select "Deploy from Dockerfile" or Node.js runtime.
2. Set `GEMINI_API_KEY` in your environment variables.
3. The server will automatically bind to `0.0.0.0` and the assigned `$PORT`.

---

## 📁 Project Structure

```
.
├── server.js               # Unified server entry point (Express + Vite)
├── package.json            # Root dependencies and scripts
├── vite.config.js          # Vite build configuration
├── Dockerfile              # Multi-stage production container build
├── docker-compose.yml      # Container orchestration
├── .env.example            # Environment variables template
│
├── yvs-frontend/           # React frontend
│   ├── src/
│   │   ├── App.jsx         # Summarizer UI with progress tracking
│   │   ├── App.css         # Styling
│   │   └── main.jsx        # React entry point
│   ├── index.html
│   └── vite.config.js
│
└── yvs-backend/            # Express backend modules
    └── src/
        ├── app.js          # Express app factory & CORS
        ├── routes/         # /api/summarize, /api/result, /api/health
        ├── controllers/    # Request handlers & in-process background worker
        ├── models/         # Video schema (with in-memory fallback)
        ├── services/       # Video title, transcription, & Gemini services
        └── utils/          # Text chunking, YouTube helpers, logger
```

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env`:

| Variable | Description | Default | Required? |
|---|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API key for AI summaries | - | Recommended |
| `PORT` | HTTP port to listen on | `3000` | Optional |
| `NODE_ENV` | Environment (`development` or `production`) | `development` | Optional |
| `MONGODB_URI` | MongoDB Atlas connection string | In-memory fallback | Optional |
| `OPENAI_API_KEY` | Optional OpenAI key for Whisper transcription | - | Optional |
| `TEMP_DIR` | Temporary directory for processing | OS temp folder | Optional |

---

## 📡 API Reference

### `POST /api/summarize`
Submit a YouTube URL for processing.

**Request**:
```json
{
  "youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

**Response (202 Accepted)**:
```json
{
  "success": true,
  "cached": false,
  "jobId": "job_1790421633936_wky3yq",
  "status": "processing",
  "message": "Video is being processed. Poll GET /result/:jobId for updates."
}
```

### `GET /api/result/:jobId`
Poll for processing status and final summary.

**Response (200 OK - Completed)**:
```json
{
  "success": true,
  "jobId": "job_1790421633936_wky3yq",
  "status": "completed",
  "videoId": "dQw4w9WgXcQ",
  "title": "Rick Astley - Never Gonna Give You Up",
  "summary": {
    "title": "...",
    "overview": "3 to 5 sentence summary...",
    "keyPoints": ["Point 1", "Point 2", "..."],
    "takeaways": ["Takeaway 1", "..."]
  }
}
```

### `GET /api/health`
Health check for load balancers and container orchestrators. Returns `200 OK`.

---

## 📄 License

MIT License. Open source and free to use.
