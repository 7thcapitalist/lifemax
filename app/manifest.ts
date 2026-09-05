import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LifeMax",
    short_name: "LifeMax",
    description: "Play your life. Build your character.",
    start_url: "/",
    display: "standalone",
    background_color: "#080b10",
    theme_color: "#080b10",
  };
}
