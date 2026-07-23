import type { Metadata } from "next";
import { Exo_2 } from "next/font/google";
import "./globals.css";
import { AiChat } from "@/components/ai-chat";
import { CosmicBackground } from "@/components/cosmic-background";

const exo2 = Exo_2({
  variable: "--font-exo2",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "F1 Almanac",
  description: "Formula 1 Encyclopedia — 1950–2026",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${exo2.variable} bg-[#07081a]`}>
      <body
        className="font-sans antialiased"
        style={{
          // Was duplicated byte-for-byte inline on every page's own <main> —
          // moved here for the same reason CosmicBackground was: one shared
          // copy instead of five identical ones. This also fixes a real bug
          // that moving CosmicBackground alone introduced: with
          // CosmicBackground as a sibling BEFORE each page's <main> (rather
          // than nested inside it, as it used to be), a later sibling's own
          // opaque background paints OVER an earlier one — so each page's
          // opaque gradient was hiding the shared starfield behind it
          // entirely. Keeping this one gradient here, painted before
          // CosmicBackground and before any page content, restores the
          // original stacking: opaque base, then the animated parallax
          // layer, then whatever page is active.
          background: [
            "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(22,18,45,1), transparent)",
            "radial-gradient(ellipse 60% 40% at 80% 20%, rgba(30,15,50,0.6), transparent)",
            "radial-gradient(ellipse 50% 50% at 15% 80%, rgba(20,12,40,0.5), transparent)",
            "radial-gradient(ellipse 40% 30% at 70% 70%, rgba(10,8,30,0.8), transparent)",
            "radial-gradient(circle at 50% 50%, rgba(12,10,28,1), rgba(5,5,15,1))",
          ].join(", "),
        }}
      >
        {/* Mounted once here, not per-page: each page used to render its own
            <CosmicBackground/>, so navigating between them unmounted the old
            one and mounted a fresh one — resetting the mouse-parallax offset
            to {0,0} every time, which looked like the starfield "jumping" on
            every page switch. One instance here persists across client-side
            navigation, so the parallax just continues from wherever it
            already was. */}
        <CosmicBackground />
        {children}
        <AiChat />
      </body>
    </html>
  );
}
