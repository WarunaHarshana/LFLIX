import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./components/ThemeProvider";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LFLIX - Your Personal Media Server",
  description: "Stream your local movies and TV shows with a Netflix-like experience. Powered by VLC and TMDB.",
  keywords: ["streaming", "movies", "tv shows", "local media", "vlc", "plex alternative"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var theme = localStorage.getItem('lflix-theme') || 'dark';
                var accent = localStorage.getItem('lflix-accent') || 'default';
                document.documentElement.setAttribute('data-theme', theme);
                document.documentElement.setAttribute('data-accent', accent);
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[var(--background)] transition-colors duration-300`}
        suppressHydrationWarning
      >
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
