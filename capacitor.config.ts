import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.dinotusk.aval",
  appName: "Aval",
  webDir: "native/www",
  server: {
    url: "https://lovable-version.vercel.app",
    cleartext: false,
  },
};

export default config;
