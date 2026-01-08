This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Environment variables

Create a `.env.local` file in the project root and define the credentials used by the server-side features. For image uploads, configure Cloudflare R2 (S3 compatible API) and a public base URL (public bucket or custom domain):

```bash
CLOUDFLARE_R2_ACCOUNT_ID=your_account_id
CLOUDFLARE_R2_ACCESS_KEY_ID=your_r2_access_key_id
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
CLOUDFLARE_R2_BUCKET=your_bucket_name
# Ex: https://your-public-domain.example.com  (recomendado)
# ou https://<bucket>.r2.dev (se estiver usando bucket público via r2.dev)
CLOUDFLARE_R2_PUBLIC_BASE_URL=https://your-public-base-url
# Opcional (default: uploads)
# CLOUDFLARE_R2_KEY_PREFIX=uploads
```

After editing `.env.local`, restart the development server so the new variables are picked up.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Firestore indexes

The `/api/nc` route issues filtered queries on `checklistResponses` combining equality filters with a `createdAtTs` sort. Ensure the following composite indexes exist before deploying:

- `checklistResponses`: `machineId` (ASC) + `createdAtTs` (DESC)
- `checklistResponses`: `templateId` (ASC) + `createdAtTs` (DESC)
- `checklistResponses`: `operatorMatricula` (ASC) + `createdAtTs` (DESC)

These definitions are included in `firestore.indexes.json` for convenience.
