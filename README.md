# R2 Manager

Premium Cloudflare R2 Management Dashboard built with Next.js 15.

## Design
- **Glassmorphism**: Premium dark UI with blur effects.
- **Interactions**: Smooth hover states and transitions.
- **Iconography**: Lucide React icons.

## Setup

1. Configure your environment variables in `.env.local`:
   ```bash
   R2_ACCOUNT_ID=your_account_id
   R2_ACCESS_KEY_ID=your_access_key
   R2_SECRET_ACCESS_KEY=your_secret_key
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

## Features
- List Buckets
- List Files (with metadata)
- Upload Files (Drag and drop or button)
- Delete Files
- Search Buckets and Files

## Technologies
- Next.js 15 (App Router)
- AWS SDK v3
- Tailwind CSS (configured in globals.css manually)
