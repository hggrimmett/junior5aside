import "./globals.css";
import { Inter, Montserrat } from "next/font/google";
import { cn } from "@/lib/utils";
import AppShell from "@/components/nav/AppShell";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["700", "800", "900"],
});

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Junior 5-a-Side",
  description: "Youth cricket tournament management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn(inter.variable, montserrat.variable)}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
