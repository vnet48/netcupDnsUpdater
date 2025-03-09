import "@std/dotenv/load";
import { STATUS_CODE, STATUS_TEXT } from "@std/http";
import { configure, getConsoleSink, getLogger } from "@logtape/logtape";
import { getRemoteAddress, updateNetcupDns } from "./utils.ts";

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
const logger = getLogger(["netcup-dns-updater"]);

const netcup_api_key = Deno.env.get("NETCUP_API_KEY") || "";
const netcup_api_password = Deno.env.get("NETCUP_API_PASSWORD") || "";
const netcup_customernumber = Deno.env.get("NETCUP_CUSTOMER_NUMBER") || "";
const port = parseInt(Deno.env.get("PORT") || "3000");
const hostname = Deno.env.get("HOSTNAME") || "0.0.0.0";
const allowedIp = Deno.env.get("ALLOWED_IP") || "";

function handler(req: Request, info: Deno.ServeHandlerInfo) { // { hostname: "localhost", port: 8080 }
  const url = new URL(req.url);
  const { hostname } = getRemoteAddress(info);

  logger.info`Request from ${hostname} to ${url.pathname}`;

  if (hostname !== allowedIp) {
    logger.error`Request from IP: ${hostname} not allowed`;
    return new Response("Not allowed", {
      status: STATUS_CODE.Forbidden,
      statusText: STATUS_TEXT[STATUS_CODE.Forbidden],
    });
  }

  if (url.pathname === "/update") {
    // check if Requester ip is allowed (fritzbox ip)
    const newIp = url.searchParams.get("ip") || "";
    const domain = url.searchParams.get("domain") || "";

    if (newIp === "" || domain === "") {
      logger.error`Missing IP or domain`;
      return new Response("Missing IP or domain", {
        status: STATUS_CODE.BadRequest,
        statusText: STATUS_TEXT[STATUS_CODE.BadRequest],
      });
    }

    if (
      !updateNetcupDns(
        netcup_api_key,
        netcup_api_password,
        netcup_customernumber,
        domain,
        newIp,
      )
    ) {
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
}

Deno.serve({ port, hostname }, handler);
