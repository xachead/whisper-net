import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'WhisperNet | Secure Secret Share',
  description: 'Encrypt, share, and self-destruct sensitive data using military-grade AES-256-GCM encryption.',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%2322d3ee" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12l5.25 5 2.625-3 2.625 3 2.625-3 2.625 3 5.25-5"/></svg>',
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'WhisperNet',
  },
  openGraph: {
    title: 'WhisperNet | Secure Secret Share',
    description: 'Encrypt, share, and self-destruct sensitive data using military-grade AES-256-GCM encryption.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WhisperNet | Secure Secret Share',
    description: 'Encrypt, share, and self-destruct sensitive data.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0a0f18] text-gray-200 min-h-screen font-sans selection:bg-cyan-500/30" suppressHydrationWarning>{children}</body>
    </html>
  );
}

