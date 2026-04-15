# Interior Designer AI

**Interior design room generation using private AI inference.**  
Capture a room photo (UVC camera or file upload), optionally fine-tune a diffusion model on your own style images, then generate a redesigned version — all running locally on your own machine.

---

## Project structure

```
interior-designer/
├── backend/
│   ├── main.py                  # FastAPI entry point (CORS, router mounts)
│   ├── config.py                # Settings loaded from .env
│   ├── requirements.txt         → top-level requirements.txt
│   ├── uploads/                 # Uploaded & generated images (gitignored)
│   ├── model_weights/           # Fine-tuned LoRA weights (gitignored)
│   ├── routers/
│   │   ├── images.py            # POST /api/images/upload, GET, DELETE
│   │   ├── training.py          # POST /api/training/start, GET status
│   │   └── inference.py         # POST /api/inference/generate
│   ├── services/
│   │   ├── google_drive.py      # Google Drive v3 upload / download
│   │   └── model_service.py     # Diffusion pipeline wrapper + fine-tune
│   └── models/
│       └── interior_model.py    # Model metadata dataclass & registry
├── frontend/
│   ├── index.html               # Single-page app shell
│   ├── css/style.css
│   └── js/
│       ├── app.js               # Navigation & view logic
│       ├── api.js               # Fetch wrapper for all backend calls
│       ├── camera.js            # WebRTC UVC camera capture
│       ├── google_drive.js      # Google Drive Picker integration
│       └── scene_composer.js    # Drag/drop room scene composer for training images
├── requirements.txt
├── .gitignore
└── README.md
```

---

## Quick start

### 1 — Clone & create a virtual environment

```bash
git clone <repo-url> interior-designer
cd interior-designer
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
```

If `python3 -m venv` fails on Debian/Ubuntu, install prerequisites first:

```bash
sudo apt update
sudo apt install -y python3-pip python3-venv
```

### 2 — Install Python dependencies

```bash
pip install -r requirements.txt
```

> **GPU inference** — `requirements.txt` installs the CPU build of PyTorch by default.  
> For CUDA, replace with:
> ```bash
> pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
> ```

### 3 — Configure environment variables

Copy the example and fill in your values:

```bash
cp backend/.env.example backend/.env   # created below
```

`backend/.env`:

```ini
# Required for Google Drive integration
GOOGLE_CREDENTIALS_FILE=credentials.json
GOOGLE_TOKEN_FILE=token.json
GOOGLE_DRIVE_FOLDER_ID=          # optional: root folder ID

# Inference settings
MODEL_ID=runwayml/stable-diffusion-v1-5
DEVICE=cpu                        # or cuda / mps
INFERENCE_STEPS=20
GUIDANCE_SCALE=7.5

# CORS — origins allowed to call the API
CORS_ORIGINS=http://localhost:8080,http://127.0.0.1:8080
```

### 4 — (Optional) Set up Google Drive

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Enable **Google Drive API** and **Google Picker API**.
2. Create **OAuth 2.0 Client ID** credentials (Desktop app).  
   Download `credentials.json` and place it in the `backend/` directory.
3. Add your OAuth Client ID, API Key, and Project Number to `frontend/index.html` (or serve them from the backend):

```html
<script>
  window.APP_CONFIG = {
    apiBase:         'http://localhost:8000/api',
    googleClientId:  'YOUR_CLIENT_ID.apps.googleusercontent.com',
    googleApiKey:    'YOUR_API_KEY',
    googleAppId:     'YOUR_PROJECT_NUMBER',
  };
</script>
```

### 5 — Run the backend

```bash
cd backend
python3 -m uvicorn main:app --reload --port 8000
```

The API docs are at <http://localhost:8000/api/docs>.

### 6 — Serve the frontend

Any static file server works. The simplest:

```bash
cd frontend
python -m http.server 8080
```

Open <http://localhost:8080> in your browser.

---

## API overview

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/images/upload` | Upload a room image (JPEG/PNG/WebP ≤ 20 MB) |
| `GET`  | `/api/images/` | List uploaded images |
| `GET`  | `/api/images/{id}` | Download an image |
| `DELETE` | `/api/images/{id}` | Delete an image |
| `POST` | `/api/inference/generate` | Generate a redesigned room image |
| `GET`  | `/api/inference/result/{id}` | Retrieve a generated result |
| `POST` | `/api/training/start` | Start a fine-tuning job |
| `GET`  | `/api/training/{job_id}` | Poll job status |
| `GET`  | `/api/training/` | List all jobs |

---

## How it works

1. **Capture** — take a photo with your UVC/webcam via WebRTC, or upload/import from Google Drive.
2. **Compose** — build synthetic training examples by placing item images over a room background in the new Compose view.
3. **Generate** — the backend runs a Stable Diffusion img2img pipeline (optionally with ControlNet) on the source image, conditioned on a style prompt.
4. **Fine-tune** (optional) — train a LoRA adapter on your own room images to lock in a specific style/aesthetic.
5. **Export** — download the result or save it back to Google Drive.

---

## Compose workflow (new)

Use this flow when you want to "pull" attractive furniture/decor and place it into room scenes for model training.

1. Open the **Compose** tab.
2. Set a room background:
  - upload a local room image, or
  - paste an existing `image_id` and click **Load**.
3. Add item images:
  - paste product/image URLs and click **Add URL**, or
  - upload one or more local item images.
  - optionally keep **Auto-remove near-white background** enabled to strip white product-photo backdrops.
4. Drag items directly on the scene canvas.
5. Refine the selected item using **Scale**, **Rotation**, and **Opacity**.
6. If needed, run **Remove White Bg (Selected)** for manual cleanup and adjust the threshold slider.
7. Export outputs:
  - **Export PNG** downloads the composite image,
  - **Upload As Training Image** sends it to `/api/images/upload`,
  - **Download Layout JSON** saves placement metadata for reproducibility.

Notes:
- Browser security may block PNG export for some third-party URLs that do not allow cross-origin access. If that happens, download/upload those images locally first, then add them via file upload.
- The scene composer is intentionally simple and runs fully in-browser (no extra backend endpoints required).

---

## Standalone composer MVP

If you want the composer as an independent lightweight app, use the standalone version in `standalone-compose/`.

What it includes:
- Room background upload (local file)
- Item add from URL or local files
- Drag/scale/rotate/opacity/z-order editing
- Export PNG + download layout JSON

What it excludes (to minimize server requirements):
- No backend upload endpoint usage
- No image-id loading from `/api/images/{id}`
- No inference/training dependencies

Run it with any static server:

```bash
cd standalone-compose
python3 -m http.server 8090
```

Open <http://localhost:8090>.

---

## Development notes

- The ML pipeline (`services/model_service.py`) lazy-loads on first inference, so the server starts fast even without GPU/model weights.
- Fine-tuning (`routers/training.py`) runs in a FastAPI `BackgroundTask`; replace the simulated loop in `model_service.fine_tune()` with your actual DreamBooth / LoRA training code.
- All secrets (credentials, tokens) are excluded from git via `.gitignore`.

