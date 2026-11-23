import type { MetadataRoute } from "next";

// "Add to Home Screen" on Android and iPhone opens Finny as its own app, with its icon and name.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Finny",
    short_name: "Finny",
    description: "Your money, in one place.",
    start_url: "/",
    display: "standalone",
    background_color: "#fdf8fb",
    theme_color: "#fdf8fb",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
