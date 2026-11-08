/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { resolve } from "node:path";
import { Config } from "@remotion/cli/config";

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setDefaultPremountInSeconds(2);

// The study's room lives in the site's src, so this bundle must not pick up the
// site's own copies of React and three from there.
const here = (path: string) => resolve(process.cwd(), path);
Config.overrideRspackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: {
      ...config.resolve?.alias,
      "@life": resolve(process.cwd(), "../../src/lib/life"),
      three: here("node_modules/three"),
      "@react-three/fiber": here("node_modules/@react-three/fiber"),
      "@react-three/drei": here("node_modules/@react-three/drei"),
      react: here("node_modules/react"),
      "react-dom": here("node_modules/react-dom"),
    },
  },
}));
