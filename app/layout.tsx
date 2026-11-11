import type { Metadata } from "next";
import "./globals.css";
import "./design-system.css";
import "./mobile-first.css";
import {WorkspaceProvider} from "../components/workspace-provider";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" data-design="unified">
      <body className="antialiased"><WorkspaceProvider>{children}</WorkspaceProvider></body>
    </html>
  );
}
