# Welcome to your ShortsDownloader project

## Project info

## How can I edit this code?

You can edit this project locally or directly on GitHub. The only requirement for local development is Node.js and npm.

Quick start (local):

```sh
# Clone the repository
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# Install dependencies
npm install

# Start dev server
npm run dev
```

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?
You can deploy the frontend as a static site (GitHub Pages, Vercel, or Render Static) and deploy the backend as a Docker web service (Render, Fly, Cloud Run, etc.). See the Deployment sections below for options and example manifests included in this repo.

## Can I connect a custom domain?
Yes. Most hosts (Render, Fly, Vercel, GitHub Pages) support adding a custom domain and provide instructions for DNS records and TLS.

## Deployment (GitHub Actions + Fly.io + GitHub Pages)

This repo includes a CI workflow that builds the backend Docker image, pushes it to GitHub Container Registry (GHCR), deploys the backend to Fly.io, then builds the frontend and publishes it to GitHub Pages.

Required GitHub repository secrets:
- `FLY_API_TOKEN` - Fly.io API token
- `FLY_APP_NAME` - Fly app name (the Fly app's subdomain will be `<FLY_APP_NAME>.fly.dev`)

Quick steps:
1. Create a Fly app locally:
	- Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
	- `flyctl apps create <your-app-name>`
2. In GitHub repository settings, add `FLY_API_TOKEN` and `FLY_APP_NAME` to Secrets.
3. Push to `main`. The action will build and deploy the backend to Fly and publish the frontend to GitHub Pages.

After deployment, your frontend will be available on GitHub Pages and the frontend will call the backend at `https://<FLY_APP_NAME>.fly.dev`.

## Deployment with Render (one-provider option)

If you prefer Render, this repo includes a `render.yaml` manifest that defines two services:
- `shorts-backend` (Docker web service using `backend/Dockerfile`)
- `shorts-frontend` (static site that builds `dist`)

Steps:
1. Create a Render account and connect your GitHub repository.
2. Import the `render.yaml` or create two services (backend: Docker, frontend: Static) and point them to this repo/branch.
3. For the backend service, add environment variables (`CONTACT_TO_EMAIL`, SMTP_* values) under Service → Environment.
4. Deploy. Render will build the backend image and the frontend static site and provide public URLs. Use the backend URL as the `VITE_BACKEND_URL` environment variable in the frontend service.

