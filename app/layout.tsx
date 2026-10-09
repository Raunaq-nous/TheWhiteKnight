import type { Metadata, Viewport } from "next";
import "./globals.css";
import DataProvider from "./DataProvider";
import ToastHost from "./toast-host";

export const metadata: Metadata = {
  title: "CareerOS",
  description: "The operating system for your next career move.",
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
    { media: "(prefers-color-scheme: light)", color: "#070809" },
    { media: "(prefers-color-scheme: dark)", color: "#070809" },
  ],
  width: "device-width",
  initialScale: 1,
  userScalable: true,
};

// Runs before first paint to avoid theme flash
// Black is the default; light is an explicit choice that persists.
const setInitialTheme = `(function(){try{var t=localStorage.getItem('careeros-theme');if(t!=='light'&&t!=='dark'){t='dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/TheWhiteKnight/icon-192.png" />
        <script dangerouslySetInnerHTML={{ __html: setInitialTheme }} />
      </head>
      <body>
        <DataProvider>{children}</DataProvider>
        <ToastHost />
      </body>
    </html>
  );
}
