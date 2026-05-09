import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareerOS",
  description: "AI-powered job application command center",
  manifest: "/TheWhiteKnight/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CareerOS",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0A0A" },
  ],
  width: "device-width",
  initialScale: 1,
  userScalable: true,
};

// Runs before first paint to avoid theme flash
const setInitialTheme = `(function(){try{var t=localStorage.getItem('careeros-theme');if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <head>
        <link rel="apple-touch-icon" href="/TheWhiteKnight/icon-192.png" />
        <script dangerouslySetInnerHTML={{ __html: setInitialTheme }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
