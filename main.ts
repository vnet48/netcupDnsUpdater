import { configure, getConsoleSink, getLogger } from "@logtape/logtape";
import type { ConnInfo } from "./utils";
import { getRemoteAddress, updateNetcupDns } from "./utils";

export interface UpdaterConfig {
  apiKey: string;
  apiPassword: string;
  customerNumber: string;
  allowedIp: string;
  /** Overridable for tests; defaults to the real NetCup update flow. */
  updateDns?: typeof updateNetcupDns;
}

export function createHandler(config: UpdaterConfig) {
  const updateDns = config.updateDns ?? updateNetcupDns;
  const logger = getLogger(["netcup-dns-updater"]);

  return async function handler(
    req: Request,
    server: ConnInfo,
  ): Promise<Response> {
    const url = new URL(req.url);
    const { address: hostname } = getRemoteAddress(server, req);

    logger.info`Request from ${hostname} to ${url.pathname}`;

    if (hostname !== config.allowedIp) {
      logger.error`Request from IP: ${hostname} not allowed`;
      return new Response("Not allowed", { status: 403 });
    }

    if (url.pathname === "/update") {
      const newIp = url.searchParams.get("ip") || "";
      const domain = url.searchParams.get("domain") || "";

      if (newIp === "" || domain === "") {
        logger.error`Missing IP or domain`;
        return new Response("Missing IP or domain", { status: 400 });
      }

      const updated = await updateDns(
        config.apiKey,
        config.apiPassword,
        config.customerNumber,
        domain,
        newIp,
      );

      if (!updated) {
        logger.error`Failed to update ${domain} to ${newIp}`;
        return new Response("Failed to update DNS", { status: 500 });
      }

      logger.info`Updating ${domain} to ${newIp}`;
      return new Response("Ok", { status: 200 });
    }

    logger.error`Not found ${url.pathname}`;
    return new Response("Not found", { status: 404 });
  };
}

if (import.meta.main) {
  await configure({
    sinks: { console: getConsoleSink() },
    loggers: [
      {
        category: ["logtape", "meta"],
        lowestLevel: "warning",
        sinks: ["console"],
      },
      {
        category: "netcup-dns-updater",
        lowestLevel: "debug",
        sinks: ["console"],
      },
    ],
  });

  Bun.serve({
    port: parseInt(Bun.env.PORT || "3000", 10),
    hostname: Bun.env.BIND_HOST || "0.0.0.0",
    fetch: createHandler({
      apiKey: Bun.env.NETCUP_API_KEY || "",
      apiPassword: Bun.env.NETCUP_API_PASSWORD || "",
      customerNumber: Bun.env.NETCUP_CUSTOMER_NUMBER || "",
      allowedIp: Bun.env.ALLOWED_IP || "",
    }),
  });
}
