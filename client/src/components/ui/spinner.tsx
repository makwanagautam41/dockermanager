import * as React from "react";

export function Spinner({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center h-4 w-4 ${className}`}
      style={style}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
        {Array.from({ length: 12 }).map((_, i) => (
          <rect
            key={i}
            x="11"
            y="2.5"
            width="2"
            height="6"
            rx="1"
            fill="currentColor"
            opacity="0.1"
            style={{
              transformOrigin: "12px 12px",
              transform: `rotate(${i * 30}deg)`,
              animation: `sk-fade 1.2s ${i * 0.1}s linear infinite`,
            }}
          />
        ))}
      </svg>
      <style>{`@keyframes sk-fade { 0%,100% { opacity: 0.1; } 5% { opacity: 1; } 30% { opacity: 0.1; } }`}</style>
    </span>
  );
}

export default Spinner;
