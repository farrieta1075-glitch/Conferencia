import { ImageResponse } from "next/og";
import { readEventLogoDataUrl } from "@/lib/appIcon";

function DefaultMark({ size }: { size: number }) {
  const width = Math.round(size * 0.73);
  const height = Math.round(size * 0.47);
  const border = Math.max(8, Math.round(size * 0.055));
  return (
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
          width,
          height,
          border: `${border}px solid #9A6B43`,
          borderBottom: "none",
          borderTopLeftRadius: width,
          borderTopRightRadius: width,
        }}
      />
    </div>
  );
}

export async function renderAppIcon(size: number) {
  const src = await readEventLogoDataUrl();
  return new ImageResponse(
    src ? (
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
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    ) : (
      <DefaultMark size={size} />
    ),
    { width: size, height: size },
  );
}
