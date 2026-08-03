import type { Metadata } from "next";
import { Providers } from "@/app/providers";
import "katex/dist/katex.min.css";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "D-Friend",
  description: "Không gian dạy và học tập trung cho giáo viên và học sinh.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>
        <a className="skip-link" href="#main-content">
          Đi tới nội dung chính
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
