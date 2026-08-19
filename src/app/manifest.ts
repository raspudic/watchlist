import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Later",
    short_name: "Later",
    description: "A calm home for what you want to watch and what you loved.",
    start_url: "/watchlist",
    display: "standalone",
    background_color: "#111214",
    theme_color: "#111214",
    categories: ["entertainment", "lifestyle"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
