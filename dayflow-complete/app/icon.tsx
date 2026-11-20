import { ImageResponse } from "next/og";

export function generateImageMetadata() {
  return [192, 512].map((pixels) => ({
    id: String(pixels),
    size: { width: pixels, height: pixels },
    contentType: "image/png" as const,
  }));
}

function DayflowIcon() {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "23%", background: "linear-gradient(145deg, #3fdcff 0%, #2585ff 48%, #584cf6 100%)" }}>
      <svg width="68%" height="68%" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <path d="M9 7.5c0-1.38 1.12-2.5 2.5-2.5H20c8.28 0 15 6.72 15 15S28.28 35 20 35h-8.5A2.5 2.5 0 0 1 9 32.5v-25Z" stroke="white" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M15 13.5h6.3a6.5 6.5 0 0 1 0 13H15m-2.5-6.5h13" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default async function Icon({ id }: { id?: string | Promise<string> }) {
  const pixels = Number(await id) || 512;
  const size = pixels === 192 ? 192 : 512;
  return new ImageResponse(<DayflowIcon />, { width: size, height: size });
}
