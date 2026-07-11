/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: `next build` writes a self-contained site to `out/`, with a
  // real index.html at its root. This serves the root URL on any static host
  // (Vercel, Netlify, Cloudflare Pages, GitHub Pages, S3, nginx) — no SPA
  // rewrite or Node server required. Phase 4 can drop `output` when the app
  // needs server rendering.
  output: 'export',
  // No base path: the site is served from the domain root ("/"), not a subpath.
  // (A non-empty basePath here would re-introduce a root 404.)
  images: { unoptimized: true },
};

export default nextConfig;
