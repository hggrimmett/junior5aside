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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
