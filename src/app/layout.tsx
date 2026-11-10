import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/lib/session";

export const metadata: Metadata = {
  title: "Accounts Management System",
  description: "Accounting for multiple organizations",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
