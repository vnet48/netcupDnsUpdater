import { STATUS_CODE, STATUS_TEXT } from "@std/http";
import { configure, getConsoleSink, getLogger } from "@logtape/logtape";
import { getRemoteAddress, updateNetcupDns } from "./utils.ts";

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
    info: Deno.ServeHandlerInfo,
  ): Promise<Response> {
    const url = new URL(req.url);
    const { hostname } = getRemoteAddress(info);

    logger.info`Request from ${hostname} to ${url.pathname}`;

    if (hostname !== config.allowedIp) {
      logger.error`Request from IP: ${hostname} not allowed`;
      return new Response("Not allowed", {
        status: STATUS_CODE.Forbidden,
        statusText: STATUS_TEXT[STATUS_CODE.Forbidden],
      });
    }

    if (url.pathname === "/update") {
      const newIp = url.searchParams.get("ip") || "";
      const domain = url.searchParams.get("domain") || "";

      if (newIp === "" || domain === "") {
        logger.error`Missing IP or domain`;
        return new Response("Missing IP or domain", {
          status: STATUS_CODE.BadRequest,
          statusText: STATUS_TEXT[STATUS_CODE.BadRequest],
        });
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
        return new Response("Failed to update DNS", {
          status: STATUS_CODE.InternalServerError,
          statusText: STATUS_TEXT[STATUS_CODE.InternalServerError],
        });
      }

      logger.info`Updating ${domain} to ${newIp}`;
      return new Response("Ok", {
        status: STATUS_CODE.OK,
        statusText: STATUS_TEXT[STATUS_CODE.OK],
      });
    }

    logger.error`Not found ${url.pathname}`;
    return new Response("Not found", { status: 404 });
  };
}

if (import.meta.main) {
  await import("@std/dotenv/load");

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

  Deno.serve(
    {
      port: parseInt(Deno.env.get("PORT") || "3000"),
      hostname: Deno.env.get("HOSTNAME") || "0.0.0.0",
    },
    createHandler({
      apiKey: Deno.env.get("NETCUP_API_KEY") || "",
      apiPassword: Deno.env.get("NETCUP_API_PASSWORD") || "",
      customerNumber: Deno.env.get("NETCUP_CUSTOMER_NUMBER") || "",
      allowedIp: Deno.env.get("ALLOWED_IP") || "",
    }),
  );
}
