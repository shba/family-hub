import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "מרכז המשפחה",
  description: "לוח בקרה משפחתי - לוחות זמנים, ארוחות, מטלות וקניות",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans text-slate-100 antialiased">{children}</body>
    </html>
  );
}
