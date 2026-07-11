import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Forrest RSOS — Risk & Safety Operating System',
  description:
    'The system of record for carrier vetting at Forrest Logistics — one auditable place to check a carrier and record why a load was cleared.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
