# Scene Composer MVP (Standalone)

This is a standalone, minimal version of the scene composer that runs fully in-browser.

## Why this exists

- Keeps the main app unchanged.
- Lets you deploy composition as a separate lightweight tool.
- Removes backend dependency for core compose workflow.

## Features

- Local room background upload
- Item add from URL or local files
- Drag placement on stage
- Item controls: scale, rotation, opacity, z-order, remove
- Export composite PNG
- Download layout JSON

## Server requirements

- No Python backend required for app logic
- No model inference service required
- Any static server is enough

## Run

```bash
cd standalone-compose
python3 -m http.server 8090
```

Open http://localhost:8090

## Deploy on GitHub Pages

This repository includes a GitHub Actions workflow that publishes the `standalone-compose/` folder to Pages.

Steps:
1. Push to the `main` branch.
2. In GitHub, open **Settings -> Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. The workflow `Deploy Standalone Compose to GitHub Pages` will deploy automatically.

Your site URL will be shown in the workflow run output once deployment completes.

## Notes

- If PNG export fails with URL-sourced images, use local file uploads for those assets.
- This MVP intentionally excludes backend uploads and image-id loading.
