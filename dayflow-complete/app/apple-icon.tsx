import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 42, background: "linear-gradient(145deg, #3fdcff 0%, #2585ff 48%, #584cf6 100%)", boxShadow: "inset 0 2px 0 #ffffff66" }}>
      <svg width="132" height="132" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <path d="M9 7.5c0-1.38 1.12-2.5 2.5-2.5H20c8.28 0 15 6.72 15 15S28.28 35 20 35h-8.5A2.5 2.5 0 0 1 9 32.5v-25Z" stroke="white" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M15 13.5h6.3a6.5 6.5 0 0 1 0 13H15m-2.5-6.5h13" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>,
    { ...size },
  );
}
