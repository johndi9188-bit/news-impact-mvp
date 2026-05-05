import { withCloudflare } from "@opennextjs/aws/helpers/withCloudflare.js";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

export default withCloudflare({
  default: {
    placement: "regional",
    runtime: "node",
    override: {
      incrementalCache: r2IncrementalCache,
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
