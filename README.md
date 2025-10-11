# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/4772d5c1-9236-475a-9167-12b07fe95efb

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/4772d5c1-9236-475a-9167-12b07fe95efb) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/4772d5c1-9236-475a-9167-12b07fe95efb) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

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
