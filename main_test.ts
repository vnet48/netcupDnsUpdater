import { assertEquals } from "@std/assert";
import { createHandler } from "./main.ts";
import {
  apiResponse,
  quietConsoleErrors,
  stubNetcupApi,
} from "./test_helpers.ts";

const BASE_CONFIG = {
  apiKey: "api-key",
  apiPassword: "api-password",
  customerNumber: "123",
  allowedIp: "192.0.2.10",
};

function connInfo(remoteIp: string): Deno.ServeHandlerInfo {
  return {
    remoteAddr: { transport: "tcp", hostname: remoteIp, port: 4711 },
    completed: Promise.resolve(),
  };
}

function updateUrl(ip = "198.51.100.7", domain = "example.com"): Request {
  return new Request(
    `http://localhost:3000/update?ip=${ip}&domain=${domain}`,
  );
}

/** Handler with an updateDns spy that resolves to the given result. */
function handlerWithSpy(result: boolean) {
  const calls: string[][] = [];
  const handler = createHandler({
    ...BASE_CONFIG,
    updateDns: (apiKey, apiPassword, customerNumber, domain, newIp) => {
      calls.push([apiKey, apiPassword, customerNumber, domain, newIp]);
      return Promise.resolve(result);
    },
  });
  return { handler, calls };
}

Deno.test("handler - returns 200 and forwards credentials on a successful update", async () => {
  const { handler, calls } = handlerWithSpy(true);

  const response = await handler(updateUrl(), connInfo("192.0.2.10"));

  assertEquals(response.status, 200);
  assertEquals(await response.text(), "Ok");
  assertEquals(calls, [
    ["api-key", "api-password", "123", "example.com", "198.51.100.7"],
  ]);
});

Deno.test("handler - returns 500 when the DNS update fails", async () => {
  // Regression: updateNetcupDns used to be called without `await`, so a
  // pending (always truthy) Promise made every failure answer 200 "Ok".
  const { handler, calls } = handlerWithSpy(false);

  const response = await handler(updateUrl(), connInfo("192.0.2.10"));

  assertEquals(response.status, 500);
  assertEquals(await response.text(), "Failed to update DNS");
  assertEquals(calls.length, 1);
});

Deno.test("handler - rejects requests from non-allowlisted IPs with 403", async () => {
  const { handler, calls } = handlerWithSpy(true);

  const response = await handler(updateUrl(), connInfo("192.0.2.11"));

  assertEquals(response.status, 403);
  assertEquals(await response.text(), "Not allowed");
  assertEquals(calls.length, 0);
});

Deno.test("handler - rejects everything when ALLOWED_IP is empty", async () => {
  // Without ALLOWED_IP every var defaults to "" and nothing is allowed.
  const { calls } = handlerWithSpy(true);
  const denyAll = createHandler({ ...BASE_CONFIG, allowedIp: "" });

  const response = await denyAll(updateUrl(), connInfo("192.0.2.10"));

  assertEquals(response.status, 403);
  assertEquals(calls.length, 0);
});

Deno.test("handler - allowlist check takes precedence over routing", async () => {
  const { handler } = handlerWithSpy(true);

  const response = await handler(
    new Request("http://localhost:3000/nope"),
    connInfo("192.0.2.11"),
  );

  assertEquals(response.status, 403);
});

Deno.test("handler - returns 400 when the ip param is missing", async () => {
  const { handler, calls } = handlerWithSpy(true);

  const response = await handler(
    new Request("http://localhost:3000/update?domain=example.com"),
    connInfo("192.0.2.10"),
  );

  assertEquals(response.status, 400);
  assertEquals(await response.text(), "Missing IP or domain");
  assertEquals(calls.length, 0);
});

Deno.test("handler - returns 400 when the domain param is missing", async () => {
  const { handler, calls } = handlerWithSpy(true);

  const response = await handler(
    new Request("http://localhost:3000/update?ip=198.51.100.7"),
    connInfo("192.0.2.10"),
  );

  assertEquals(response.status, 400);
  assertEquals(calls.length, 0);
});

Deno.test("handler - returns 400 for empty param values", async () => {
  const { handler, calls } = handlerWithSpy(true);

  const response = await handler(
    new Request("http://localhost:3000/update?ip=&domain=example.com"),
    connInfo("192.0.2.10"),
  );

  assertEquals(response.status, 400);
  assertEquals(calls.length, 0);
});

Deno.test("handler - returns 404 for unknown paths from allowed IPs", async () => {
  const { handler, calls } = handlerWithSpy(true);

  const response = await handler(
    new Request("http://localhost:3000/update/"),
    connInfo("192.0.2.10"),
  );

  assertEquals(response.status, 404);
  assertEquals(await response.text(), "Not found");
  assertEquals(calls.length, 0);
});

Deno.test("handler - uses the real update flow by default", async () => {
  using _errors = quietConsoleErrors();
  // Without an injected updateDns the handler goes through utils + NetCup
  // API down to fetch. Make the login fail (HTTP 200 + statuscode 4000,
  // the way NetCup reports errors) and expect 500, not 200.
  using api = stubNetcupApi(() => apiResponse(4000, ""));
  const handler = createHandler(BASE_CONFIG);

  const response = await handler(updateUrl(), connInfo("192.0.2.10"));

  assertEquals(response.status, 500);
  assertEquals(await response.text(), "Failed to update DNS");
  assertEquals(api.calls.map((call) => call.action), ["login"]);
});
