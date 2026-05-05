import type { NextConfig } from "next";

/**
 * 开发模式下 Next 会校验部分 /_next 资源来源。仅信任 localhost 时，用
 * http://127.0.0.1:3001 或手机访问 http://网段IP:3001 会被拦，表现为一直「刷新中」
 * 或 HMR/字体 403。见：https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
 */
const extraDevHosts =
  process.env.NEXT_DEV_ALLOWED_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", ...extraDevHosts],
};

export default nextConfig;
