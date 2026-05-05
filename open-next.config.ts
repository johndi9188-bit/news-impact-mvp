import { withCloudflare } from "@opennextjs/aws/helpers/withCloudflare.js";

const base = withCloudflare({
  default: {
    placement: "regional",
    runtime: "node",
    override: {
      wrapper: "cloudflare-node",
      converter: "edge",
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "dummy",
    },
  },
  functions: {
    newsEdgeRoute: {
      placement: "global",
      routes: "app/api/news/route",
      patterns: "/api/news",
    },
    analyzeEdgeRoute: {
      placement: "global",
      routes: "app/api/analyze/route",
      patterns: "/api/analyze",
    },
  },
});

export default {
  ...base,
  edgeExternals: ["node:crypto"],
  middleware: {
    ...base.middleware,
    override: {
      ...base.middleware.override,
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "dummy",
    },
  },
};
