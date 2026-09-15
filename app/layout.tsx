import type { Metadata, Viewport } from "next";
import {
  UnifrakturMaguntia,
  Libre_Caslon_Display,
  Libre_Caslon_Text,
  Libre_Franklin,
} from "next/font/google";
import "./globals.css";
import PaperTexture from "@/components/PaperTexture";
import ServiceWorker from "@/components/ServiceWorker";
import { AccountProvider } from "@/components/Account";
import { PreferencesProvider } from "@/components/Preferences";
import Onboarding from "@/components/Onboarding";

/** Nameplate. Blackletter, as on the Times, the Telegraph and the Tribune. */
const mast = UnifrakturMaguntia({
  variable: "--font-mast",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

/** Display cut of Caslon, for headlines set large. */
const head = Libre_Caslon_Display({
  variable: "--font-head",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

/** Text cut of the same family, for body copy and smaller headlines. */
const body = Libre_Caslon_Text({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

/** Franklin Gothic revival — the American newspaper sans, for furniture. */
const label = Libre_Franklin({
  variable: "--font-label",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "The AI Daily — Two Cents Edition",
  description:
    "One edition a day. Everything that mattered in artificial intelligence, deduplicated and set in type.",
  applicationName: "The AI Daily",
  manifest: "/manifest.webmanifest",
  // iOS ignores the web manifest and reads these instead.
  appleWebApp: {
    capable: true,
    title: "AI Daily",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  // Matches the ink, so the status bar reads as part of the masthead.
  themeColor: "#2b1f12",
  // Lets the paper run under the notch rather than being letterboxed by it.
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

const themeInit = `
try {
  if (localStorage.getItem('edition') === 'night') {
    document.documentElement.classList.add('night');
  }
} catch (e) {}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${mast.variable} ${head.variable} ${body.variable} ${label.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full">
        <PaperTexture />
        {/* Account first: preferences need to know who is signed in before
            they can decide whether to sync. */}
        <AccountProvider>
          <PreferencesProvider>
            {children}
            <Onboarding />
          </PreferencesProvider>
        </AccountProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
