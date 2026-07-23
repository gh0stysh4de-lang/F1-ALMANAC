"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { AlmanacHeader } from "@/components/almanac-header";
import { GlassPanel } from "@/components/glass-panel";

const VERSION = "1.0";
const RELEASE_DATE = "23.07.26";

const TEXT_PRIMARY = "rgba(232, 230, 240, 0.90)";
const TEXT_SECONDARY = "rgba(199, 197, 208, 0.55)";
const TEXT_MUTED = "rgba(199, 197, 208, 0.40)";
const PURPLE = "rgba(160, 120, 240, 0.9)";

function GithubIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={PURPLE}
      className="shrink-0"
      aria-hidden="true"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function TelegramIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={PURPLE}
      className="shrink-0"
      aria-hidden="true"
    >
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function LinkedinMark({ size }: { size: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-[4px] text-center font-bold leading-none"
      style={{
        width: size,
        height: size,
        color: PURPLE,
        border: `1.5px solid ${PURPLE}`,
        fontSize: size * 0.6,
      }}
      aria-hidden="true"
    >
      in
    </div>
  );
}

const LINKS = [
  {
    label: "Email",
    href: "mailto:gh0sty.sh4de@gmail.com",
    display: "gh0sty.sh4de@gmail.com",
    renderIcon: (size: number) => (
      <Mail
        size={size}
        style={{ color: PURPLE }}
        className="shrink-0"
        aria-hidden="true"
      />
    ),
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/dmytro-r-49b305252?utm_source=share_via&utm_content=profile&utm_medium=member_ios",
    display: "linkedin.com/in/dmytro-r",
    renderIcon: (size: number) => <LinkedinMark size={size} />,
  },
  {
    label: "Telegram",
    href: "https://t.me/slyceworld",
    display: "@slyceworld",
    renderIcon: (size: number) => <TelegramIcon size={size} />,
  },
  {
    label: "GitHub",
    href: "https://github.com/gh0stysh4de-lang",
    display: "github.com/gh0stysh4de-lang",
    renderIcon: (size: number) => <GithubIcon size={size} />,
  },
] as const;

export default function CreditsPage() {
  const [contentVisible, setContentVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setContentVisible(true));
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      <div className="relative z-10 flex min-h-screen w-full items-start justify-center px-4 py-6 sm:px-6 lg:px-8">
        <div
          className="relative flex h-[894px] w-full max-w-[1400px] flex-col overflow-hidden rounded-[12px]"
          style={{
            background: "rgba(180, 180, 210, 0.02)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "0.5px solid rgba(255, 255, 255, 0.12)",
            boxShadow:
              "0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
          }}
        >
          <div className="relative z-[200] shrink-0">
            <AlmanacHeader variant="credits" />
          </div>

          <div className="relative z-0 flex min-h-0 flex-1 flex-col items-center justify-center p-4 sm:p-5">
            <div
              className="flex w-full justify-center motion-reduce:transform-none motion-reduce:transition-none"
              style={{
                opacity: contentVisible ? 1 : 0,
                transform: contentVisible ? "translateY(0)" : "translateY(4px)",
                filter: contentVisible ? "blur(0)" : "blur(2px)",
                transition:
                  "opacity 200ms ease, transform 200ms ease, filter 200ms ease",
              }}
            >
            <GlassPanel
              glowLevel="medium"
              className="flex w-full max-w-[470px] flex-col"
              bodyClassName="!flex !flex-col !items-center !gap-4 !px-10 !pt-11 !pb-7"
            >
              <div
                className="h-[156px] w-[156px] shrink-0 overflow-hidden rounded-full border"
                style={{
                  borderColor: "rgba(160,120,240,0.38)",
                  boxShadow: "0 0 28px rgba(160,120,240,0.10)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/credits-photo.jpg"
                  alt="Dmytro Ryzhevskyi"
                  className="h-full w-full object-cover"
                />
              </div>

              <div className="flex flex-col items-center gap-1.5 text-center">
                <span
                  className="text-[22px] font-bold leading-none"
                  style={{ color: TEXT_PRIMARY }}
                >
                  Dmytro Ryzhevskyi
                </span>

                <span
                  className="text-[13px]"
                  style={{ color: TEXT_SECONDARY }}
                >
                  Analytics &amp; Data Lead · Creator of F1 Almanac
                </span>

              </div>

              <div className="mt-2 flex w-full flex-col gap-2.5">
                {LINKS.map(({ label, href, display, renderIcon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/[0.045]"
                    style={{ background: "rgba(255,255,255,0.025)" }}
                  >
                    {renderIcon(17)}

                    <span className="min-w-0 flex-1">
                      <span
                        className="block text-[10px] italic leading-tight"
                        style={{ color: TEXT_MUTED }}
                      >
                        {label}
                      </span>

                      <span
                        className="block truncate text-[13px] font-medium leading-tight transition-colors group-hover:text-white"
                        style={{ color: TEXT_PRIMARY }}
                      >
                        {display}
                      </span>
                    </span>
                  </a>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <span
                  className="rounded-md px-2 py-0.5 text-[11px] font-medium tabular-nums"
                  style={{
                    color: TEXT_MUTED,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  v{VERSION}
                </span>

                <span
                  className="rounded-md px-2 py-0.5 text-[11px] font-medium tabular-nums"
                  style={{
                    color: TEXT_MUTED,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {RELEASE_DATE}
                </span>
              </div>
            </GlassPanel>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}