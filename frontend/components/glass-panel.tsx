import type { ReactNode } from "react";

type GlowLevel = "medium" | "soft" | "none";

type GlassPanelProps = {
  title?: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  glowLevel?: GlowLevel;
};

const PANEL_TITLE = "rgba(199, 197, 208, 0.65)";

const TOP_GLOW_BY_LEVEL: Record<GlowLevel, string> = {
  medium:
    "linear-gradient(to right, transparent 10%, rgba(160,120,240,0.12) 30%, rgba(255,255,255,0.09) 50%, rgba(160,120,240,0.12) 70%, transparent 90%)",

  soft:
    "linear-gradient(to right, transparent 14%, rgba(160,120,240,0.07) 34%, rgba(255,255,255,0.045) 50%, rgba(160,120,240,0.07) 66%, transparent 86%)",

  none: "transparent",
};

const BORDER_BY_LEVEL: Record<GlowLevel, string> = {
  medium: "0.5px solid rgba(255, 255, 255, 0.11)",
  soft: "0.5px solid rgba(255, 255, 255, 0.085)",
  none: "0.5px solid rgba(255, 255, 255, 0.06)",
};

export function GlassPanel({
  title,
  action,
  children,
  className = "",
  bodyClassName = "",
  glowLevel = "medium",
}: GlassPanelProps) {
  return (
    <section
      className={`relative overflow-hidden rounded-[10px] ${className}`}
      style={{
        background: "rgba(120, 120, 155, 0.055)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: BORDER_BY_LEVEL[glowLevel],
        boxShadow:
          "0 8px 32px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.045)",
      }}
    >
      {/* top edge glow */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background: TOP_GLOW_BY_LEVEL[glowLevel],
        }}
      />

      {action && <div className="absolute right-3 top-3 z-10">{action}</div>}

      {title && (
        <h2
          className="m-0 px-4 pb-2 pt-4 text-center text-[12px] font-semibold italic tracking-[0.3px]"
          style={{ color: PANEL_TITLE }}
        >
          {title}
        </h2>
      )}

      <div className={`px-4 pb-4 ${title ? "" : "pt-4"} ${bodyClassName}`}>
        {children}
      </div>
    </section>
  );
}