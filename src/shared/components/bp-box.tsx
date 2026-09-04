import { cn } from "@/lib/utils";

function Mark({ position, delay }: { position: "tl" | "tr" | "br" | "bl"; delay: string }) {
  const rotationClass = {
    tl: "rotate-0",
    tr: "rotate-90",
    br: "rotate-180",
    bl: "-rotate-90",
  }[position];

  const positionStyles = {
    tl: { top: "-1px", left: "-1px" },
    tr: { top: "-1px", right: "-1px" },
    br: { bottom: "-1px", right: "-1px" },
    bl: { bottom: "-1px", left: "-1px" },
  }[position];

  return (
    <div
      className="absolute pointer-events-none z-20 animate-in fade-in zoom-in-50"
      style={{
        ...positionStyles,
        animationDelay: delay,
        animationDuration: "300ms",
        animationFillMode: "both",
        animationTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
      }}
    >
      <svg
        aria-hidden
        viewBox="0 0 10 10"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn("w-[10px] h-[10px] text-foreground transition-transform duration-200 ease-out", rotationClass)}
      >
        <path
          d="M 0 10 V 0 H 10"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>
    </div>
  );
}

interface BpBoxProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  noMarks?: boolean;
}

export function BpBox({ children, className, style, noMarks = false }: BpBoxProps) {
  return (
    <div className={cn("group/bp relative border border-border/60 bg-card card-shadow", className)} style={style}>
      {!noMarks && (
        <>
          <Mark position="tl" delay="0ms" />
          <Mark position="tr" delay="50ms" />
          <Mark position="br" delay="100ms" />
          <Mark position="bl" delay="150ms" />
        </>
      )}
      {children}
    </div>
  );
}

export function WithMarks({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("group/bp relative", className)}>
      <Mark position="tl" delay="0ms" />
      <Mark position="tr" delay="50ms" />
      <Mark position="br" delay="100ms" />
      <Mark position="bl" delay="150ms" />
      {children}
    </div>
  );
}
