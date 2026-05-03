import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import TopBar from "@/components/nav/TopBar";
import BottomNav from "@/components/nav/BottomNav";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Junior 5-a-Side Cricket",
  description: "Youth cricket tournament management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>
        <TopBar />
        <main className="pb-20 md:pb-0">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
