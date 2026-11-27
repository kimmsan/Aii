import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "បកប្រែវីដេអូជាភាសាខ្មែរ | AI Video Translator",
  description:
    "អាប់ឡូកវីដេអូរបស់អ្នក ហើយទទួលបានអក្សរខ្មែរក្រោម (Subtitle) ភាសាខ្មែរដោយស្វ័យប្រវត្តិ ជាមួយ AI — ចម្លងសំឡេង បកប្រែ និងទាញយកឯកសារ SRT។",
  keywords: ["បកប្រែ", "វីដេអូ", "ខ្មែរ", "subtitle", "SRT", "AI", "translation", "Khmer"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="km" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;500;600;700;800&family=Noto+Serif+Khmer:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen flex flex-col`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
