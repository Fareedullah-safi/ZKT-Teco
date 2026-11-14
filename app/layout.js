import {Inter} from "next/font/google";
import "./globals.css";

const inter = Inter({subsets: ["latin"]});

export const metadata = {
  title: "BioID – Fingerprint Identity System",
  description: "Biometric customer identification powered by ZKTeco ZK9500",
};

export default function RootLayout({children}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
