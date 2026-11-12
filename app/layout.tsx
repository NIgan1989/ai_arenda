import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./tokens.css";
import "./design-system.css";
import "./mobile-first.css";
import "./interface-release.css";
import "./glass.css";
import "./loader.css";
import "./native-feel.css";
import {WorkspaceProvider} from "../components/workspace-provider";
import {EntrySplash} from "../components/entry-splash";
import {AppLoader} from "../components/app-loader";
import {NativeFeel} from "../components/native-feel";

export const metadata: Metadata = {
  title: "AI Аренда — всё складывается",
  description: "Единый ассистент для аренды жилья, управления квартирами и работы по уборке.",
  manifest: '/manifest.webmanifest',
  appleWebApp: {capable:true,title:'AI Аренда',statusBarStyle:'default'},
  icons: {
    icon: "/brand-mark.png",
    shortcut: "/brand-mark.png",
    apple: '/brand-mark.png',
  },
};

// The page keeps its scale on phones: pinch and double tap do not zoom the interface, the map zooms itself.
export const viewport: Viewport = {width:"device-width",initialScale:1,maximumScale:1,userScalable:false};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" data-design="unified" data-interface="release">
      <body className="antialiased"><NativeFeel/><EntrySplash/><AppLoader/><WorkspaceProvider>{children}</WorkspaceProvider></body>
    </html>
  );
}
