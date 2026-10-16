import type { NextConfig } from 'next'

// Cabeçalhos fixos de segurança (o CSP com nonce é montado por requisição em src/proxy.ts).
const seguranca = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true,
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  async headers() {
    return [{ source: '/:path*', headers: seguranca }]
  },
}

export default nextConfig
