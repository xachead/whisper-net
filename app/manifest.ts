import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'WhisperNet - Secure Secret Share',
    short_name: 'WhisperNet',
    description: 'Encrypt, share, and self-destruct sensitive data with military grade AES-256-GCM cryptography.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0f18',
    theme_color: '#0a0f18',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
