import "./globals.css";
import AutoHost from "./auto-host";
import Starfield from "./starfield";

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
      <body>
        <AutoHost />
        <Starfield />
        {children}
      </body>
    </html>
  );
}