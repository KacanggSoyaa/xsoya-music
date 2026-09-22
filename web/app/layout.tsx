import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import AutoHost from "./auto-host";
import Starfield from "./starfield";

const space = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata = {
  title: "xSoya Music",
  description: "Free music streaming from your Spotify playlists",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={space.variable}>
        <AutoHost />
        <Starfield />
        {children}
      </body>
    </html>
  );
}