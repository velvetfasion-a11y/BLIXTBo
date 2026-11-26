import { ImageResponse } from "next/og";

export const alt = "Blixtbo – lediga lägenheter i Stockholm. Bli först till kvarn.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#F3F0EA",
          color: "#1C1916",
        }}
      >
        <div
          style={{
            width: 280,
            height: "100%",
            background: "#146048",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 56,
          }}
        >
          <svg width="96" height="96" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="9" fill="#F3F0EA" />
            <path d="M17.6 6.2 9.4 17.4h6.3l-1.7 8.4 8.6-12.1h-6.5l1.5-7.5Z" fill="#146048" />
          </svg>
          <div style={{ display: "flex", color: "#F3F0EA", fontSize: 24, fontWeight: 600, lineHeight: 1.2, maxWidth: 168 }}>Bli först till kvarn</div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "64px 72px",
            flex: 1,
          }}
        >
          <div style={{ display: "flex", fontSize: 32, fontWeight: 600, letterSpacing: -0.6 }}>Blixtbo</div>
          <div
            style={{
              display: "flex",
              fontSize: 64,
              lineHeight: 1.05,
              letterSpacing: -1.8,
              marginTop: 28,
              maxWidth: 760,
            }}
          >
            Se alla lediga lägenheter på ett ställe
          </div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 28, color: "#5C564E" }}>Hyresrätt i Stockholm</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
