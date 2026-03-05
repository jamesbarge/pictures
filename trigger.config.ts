import { defineConfig } from "@trigger.dev/sdk/v3";
import { playwright } from "@trigger.dev/build/extensions/playwright";
import { esbuildPlugin } from "@trigger.dev/build";

export default defineConfig({
  project: "proj_spunycnifzfqcfwhimbb",
  runtime: "node",
  logLevel: "log",
  maxDuration: 600, // 10 min default — allows queue wait + execution time
  dirs: ["src/trigger"],
  build: {
    external: [
      "playwright",
      "playwright-core",
      "chromium-bidi",
      "puppeteer-extra",
      "puppeteer-extra-plugin",
      "puppeteer-extra-plugin-stealth",
      "clone-deep",
      "merge-deep",
    ],
    extensions: [
      playwright({ browsers: ["chromium"] }),
      esbuildPlugin(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("@esbuild-plugins/tsconfig-paths").TsconfigPathsPlugin({
          tsconfig: "./tsconfig.json",
        }),
        { target: "deploy" }
      ),
    ],
  },
});
