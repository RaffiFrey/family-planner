import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Family Planer',
    short_name: 'Family Planer',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1d5ef1',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
