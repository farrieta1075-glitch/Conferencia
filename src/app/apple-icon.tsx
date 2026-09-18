import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
            width: 128,
            height: 84,
            border: "10px solid #9A6B43",
            borderBottom: "none",
            borderTopLeftRadius: 128,
            borderTopRightRadius: 128,
          }}
        />
      </div>
    ),
    size,
  );
}
