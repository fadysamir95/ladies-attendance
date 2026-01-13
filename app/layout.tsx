import type { Metadata } from "next";
import Header from "./components/Header";
import { Cairo } from "next/font/google";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic"],
  weight: ["400", "600", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "اجتماع السيدات",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" className={cairo.className}>
      <body style={{ margin: 0, background: "#f6f7fb", fontFamily: "cairo" }}>
        <Header />
        <main style={{ padding: 16 }}>{children}</main>
      </body>
    </html>
  );
}
