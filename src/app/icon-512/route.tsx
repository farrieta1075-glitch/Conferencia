import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0B132B",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 360,
            height: 230,
            border: "28px solid #9A6B43",
            borderBottom: "none",
            borderTopLeftRadius: 360,
            borderTopRightRadius: 360,
          }}
        />
      </div>
    ),
    { width: 512, height: 512 },
  );
}
