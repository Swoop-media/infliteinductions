// @ts-nocheck
// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import NavigationProgress from "@/components/NavigationProgress";
import LoadingSpinner from "@/components/LoadingSpinner";

export const metadata: Metadata = {
  title: "INFLITE Induction & Training",
  description: "Company LMS for inductions, training, and authorisations.",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <Suspense fallback={<LoadingSpinner fullScreen={true} message="Loading application..." />}>
          {children}
        </Suspense>
      </body>
    </html>
  );
}
