import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#111214",
          border: "8px solid #3a3c46",
          borderRadius: 40,
          boxSizing: "border-box",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            background: "#1c1d20",
            border: "5px solid #3a3c46",
            borderRadius: 22,
            display: "flex",
            height: 94,
            justifyContent: "center",
            width: 112,
          }}
        >
          <div
            style={{
              borderBottom: "22px solid transparent",
              borderLeft: "34px solid #e9e9fb",
              borderTop: "22px solid transparent",
              height: 0,
              marginLeft: 7,
              width: 0,
            }}
          />
        </div>
        <div
          style={{
            background: "#9a9df3",
            borderRadius: 99,
            height: 10,
            position: "absolute",
            right: 31,
            top: 30,
            width: 10,
          }}
        />
      </div>
    ),
    size,
  );
}
