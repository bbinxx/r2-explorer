# R2 Manager

Premium Cloudflare R2 Management Dashboard built with Next.js 15.

## Design
- **Glassmorphism**: Premium dark UI with blur effects.
- **Interactions**: Smooth hover states and transitions.
- **Iconography**: Lucide React icons.
- **Components**: Sonner Toast, Custom Drag & Drop.

## Setup

1. Configure your environment variables in `.env.local`:
   ```bash
   R2_ACCOUNT_ID=your_account_id
   R2_ACCESS_KEY_ID=your_access_key
   R2_SECRET_ACCESS_KEY=your_secret_key
   R2_BUCKET_NAME=your_bucket_name
   NEXT_PUBLIC_R2_DOMAIN=pub-xxx.r2.dev
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

## Configuration for R2
Ensure your R2 bucket has **CORS** allowed for your local and production domains if you plan to do client-side operations (though most are proxied via server actions here).
For the Preview to work, you MUST set `NEXT_PUBLIC_R2_DOMAIN`.

## Deployment (Netlify)
This project uses **Server Actions**, so it requires the **Netlify Next.js Runtime**.
1. Push to GitHub.
2. Connect to Netlify.
3. Ensure the **Essential Next.js** plugin is installed (auto-detected usually).
4. **Environment Variables**: You MUST add your `R2_...` variables in the Netlify Dashboard > Site Settings > Environment Variables.

## Features
- List Buckets & Folders
- File Operations: Upload, Delete, Copy, Move
- Clipboard: Copy/Cut/Paste files across folders
- Preview Sidebar with Public URL support
- Drag & Drop Uploads and Moves
