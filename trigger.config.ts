import { defineConfig } from "@trigger.dev/sdk/v3";
import { playwright } from "@trigger.dev/build/extensions/playwright";
import { esbuildPlugin } from "@trigger.dev/build";

export default defineConfig({
  project: "proj_spunycnifzfqcfwhimbb",
  runtime: "node",
  logLevel: "log",
  maxDuration: 300, // 5 min default, overridden per-task
  dirs: ["src/trigger"],
  build: {
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
