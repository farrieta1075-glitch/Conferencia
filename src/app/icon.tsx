import { ImageResponse } from "next/og";

export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 36,
        }}
      >
        <div
          style={{
            width: 140,
            height: 90,
            border: "10px solid #9A6B43",
            borderBottom: "none",
            borderTopLeftRadius: 140,
            borderTopRightRadius: 140,
          }}
        />
      </div>
    ),
    size,
  );
}
