import type { UserConfig } from "unlighthouse/config";

const config: UserConfig = {
  ci: {
    budget: {
      accessibility: 90,
      "best-practices": 90,
      performance: 80,
      seo: 80,
    },
    buildStatic: true,
    reporter: "jsonExpanded",
  },
  outputPath: ".unlighthouse",
  scanner: {
    crawler: false,
    device: "desktop",
    robotsTxt: false,
    samples: 1,
    sitemap: false,
    skipJavascript: false,
  },
  urls: ["/"],
};

export default config;
