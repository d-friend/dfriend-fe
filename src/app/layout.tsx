import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/app/providers";
import "katex/dist/katex.min.css";
import "@/app/globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "D-Friend",
  description: "Không gian dạy và học tập trung cho giáo viên và học sinh.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body>
        <a className="skip-link" href="#main-content">
          Đi tới nội dung chính
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
