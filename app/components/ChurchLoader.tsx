"use client";

import React from "react";

export default function ChurchLoader({
    text = "جاري التحميل...",
    size = 120,
}: {
    text?: string;
    size?: number;
}) {
    return (
        <div style={s.wrap} dir="rtl" aria-label="Loading">
            <div style={{ ...s.svgWrap, width: size, height: size }}>
                <svg viewBox="0 0 120 120" width={size} height={size} style={s.svg as any}>
                    {/* glow */}
                    <defs>
                        <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
                            <feGaussianBlur stdDeviation="2.2" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>

                        <linearGradient id="shineGrad" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0" stopColor="rgba(255,255,255,0)" />
                            <stop offset="0.5" stopColor="rgba(255,255,255,0.55)" />
                            <stop offset="1" stopColor="rgba(255,255,255,0)" />
                        </linearGradient>
                    </defs>

                    {/* ground shadow */}
                    <ellipse cx="60" cy="104" rx="34" ry="7" style={styles.shadow} />

                    {/* church body (pulse) */}
                    <g style={styles.pulse}>
                        {/* building */}
                        <rect x="30" y="52" width="60" height="48" rx="8" style={styles.body} />
                        {/* roof */}
                        <path d="M30 56 L60 34 L90 56 Z" style={styles.roof} />

                        {/* door */}
                        <path d="M54 100 V76 Q60 68 66 76 V100 Z" style={styles.door} />

                        {/* window */}
                        <circle cx="60" cy="62" r="6.5" style={styles.window} />
                    </g>

                    {/* bell tower (wiggle) */}
                    <g style={styles.wiggle}>
                        <rect x="52" y="18" width="16" height="22" rx="4" style={styles.tower} />
                        {/* cross */}
                        <rect x="59" y="8" width="2" height="10" style={styles.cross} />
                        <rect x="56" y="12" width="8" height="2" style={styles.cross} />
                        {/* bell */}
                        <path d="M56 38 Q60 32 64 38 V42 H56 Z" style={styles.bell} />
                    </g>

                    {/* shine sweep */}
                    <rect x="-40" y="20" width="30" height="90" fill="url(#shineGrad)" style={styles.shine} />
                </svg>
            </div>

            <div style={s.text}>{text}</div>

            {/* CSS داخل component */}
            <style>{css}</style>
        </div>
    );
}

const PRIMARY = "#152755";

const s: Record<string, React.CSSProperties> = {
    wrap: {
        margin: "90px 20px 20px 20px",
        display: "grid",
        placeItems: "center",
    },
    svgWrap: {
        display: "grid",
        placeItems: "center",
    },
    svg: {
        overflow: "visible",
    },
    text: {
        fontFamily: "cairo",
        fontWeight: 900,
        color: PRIMARY,
        opacity: 0.9,
    },
};

const styles: Record<string, React.CSSProperties> = {
    shadow: {
        fill: "rgba(21, 39, 85, 0.18)",
        transformOrigin: "60px 104px",
        animation: "shadow 1.2s ease-in-out infinite",
    },
    pulse: {
        transformOrigin: "60px 70px",
        animation: "pulse 1.2s ease-in-out infinite",
        filter: "url(#softGlow)",
    },
    wiggle: {
        transformOrigin: "60px 28px",
        animation: "wiggle 0.9s ease-in-out infinite",
    },
    body: {
        fill: "white",
        stroke: "rgba(21, 39, 85, 0.25)",
        strokeWidth: 2,
    },
    roof: {
        fill: PRIMARY,
        opacity: 0.95,
    },
    tower: {
        fill: "white",
        stroke: "rgba(21, 39, 85, 0.25)",
        strokeWidth: 2,
    },
    cross: {
        fill: PRIMARY,
    },
    bell: {
        fill: "#fbbf24", // ذهبي
        stroke: "rgba(0,0,0,0.12)",
        strokeWidth: 1,
    },
    door: {
        fill: PRIMARY,
        opacity: 0.92,
    },
    window: {
        fill: "rgba(21, 39, 85, 0.12)",
        stroke: "rgba(21, 39, 85, 0.35)",
        strokeWidth: 1.5,
    },
    shine: {
        transform: "translateX(0px)",
        animation: "shine 1.4s ease-in-out infinite",
        opacity: 0.8,
    },
};

const css = `
@keyframes pulse {
  0%, 100% { transform: translateY(0px) scale(1); }
  50%      { transform: translateY(-2px) scale(1.02); }
}

@keyframes wiggle {
  0%, 100% { transform: rotate(0deg); }
  25%      { transform: rotate(6deg); }
  75%      { transform: rotate(-6deg); }
}

@keyframes shadow {
  0%, 100% { transform: scaleX(1); opacity: 0.18; }
  50%      { transform: scaleX(0.92); opacity: 0.12; }
}

@keyframes shine {
  0%   { transform: translateX(-20px) skewX(-12deg); }
  60%  { transform: translateX(170px) skewX(-12deg); }
  100% { transform: translateX(170px) skewX(-12deg); }
}
`;