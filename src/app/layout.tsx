import type { Metadata, Viewport } from "next";
import "@fontsource-variable/nunito";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finny",
  description: "Your money, in one place.",
  robots: { index: false, follow: false }, // personal data: never indexed
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: [{ media: "(prefers-color-scheme: light)", color: "#fdf8fb" }, { media: "(prefers-color-scheme: dark)", color: "#1b1622" }] };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
