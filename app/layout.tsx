import type { Metadata, Viewport } from "next";
import { SITE_URL } from "@/lib/site";
import { fullName, getBranding } from "@/lib/branding";
import { Noto_Sans_KR, Gowun_Batang } from "next/font/google";
import "./globals.css";

const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

const gowunBatang = Gowun_Batang({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  const name = fullName(b);
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: name, template: `%s · ${b.name}` },
    description: b.tagline,
    applicationName: b.name,
    keywords: ["농협", "축협", "AI 콘텐츠", "뉴스레터 제작", "카드뉴스 제작", "홍보영상 제작", "뮤직비디오", "한글 문서", "Claude", "Kling"],
    openGraph: { type: "website", locale: "ko_KR", siteName: name, title: name, description: b.tagline, url: "/" },
    twitter: { card: "summary_large_image", title: name, description: b.tagline },
    robots: { index: true, follow: true },
    formatDetection: { telephone: false, email: false, address: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#0b6b3a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${notoSansKr.variable} ${gowunBatang.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">{children}</body>
    </html>
  );
}
