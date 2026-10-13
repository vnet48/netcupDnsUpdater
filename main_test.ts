import { expect, test } from "bun:test";
import { createHandler } from "./main";
import { apiResponse, quietConsoleErrors, stubNetcupApi } from "./test_helpers";
import type { ConnInfo } from "./utils";

const BASE_CONFIG = {
  apiKey: "api-key",
  apiPassword: "api-password",
  customerNumber: "123",
  allowedIp: "192.0.2.10",
};

function connInfo(remoteIp: string): ConnInfo {
  return {
    requestIP: () => ({ address: remoteIp, family: "IPv4", port: 4711 }),
  };
}

function updateUrl(ip = "198.51.100.7", domain = "example.com"): Request {
  return new Request(`http://localhost:3000/update?ip=${ip}&domain=${domain}`);
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

test("handler - returns 200 and forwards credentials on a successful update", async () => {
  const { handler, calls } = handlerWithSpy(true);

  const response = await handler(updateUrl(), connInfo("192.0.2.10"));

  expect(response.status).toBe(200);
  expect(await response.text()).toBe("Ok");
  expect(calls).toEqual([
    ["api-key", "api-password", "123", "example.com", "198.51.100.7"],
  ]);
});

test("handler - returns 500 when the DNS update fails", async () => {
  // Regression: updateNetcupDns used to be called without `await`, so a
  // pending (always truthy) Promise made every failure answer 200 "Ok".
  const { handler, calls } = handlerWithSpy(false);

  const response = await handler(updateUrl(), connInfo("192.0.2.10"));

  expect(response.status).toBe(500);
  expect(await response.text()).toBe("Failed to update DNS");
  expect(calls.length).toBe(1);
});

test("handler - rejects requests from non-allowlisted IPs with 403", async () => {
  const { handler, calls } = handlerWithSpy(true);

  const response = await handler(updateUrl(), connInfo("192.0.2.11"));

  expect(response.status).toBe(403);
  expect(await response.text()).toBe("Not allowed");
  expect(calls.length).toBe(0);
});

test("handler - rejects everything when ALLOWED_IP is empty", async () => {
  // Without ALLOWED_IP every var defaults to "" and nothing is allowed.
  const { calls } = handlerWithSpy(true);
  const denyAll = createHandler({ ...BASE_CONFIG, allowedIp: "" });

  const response = await denyAll(updateUrl(), connInfo("192.0.2.10"));

  expect(response.status).toBe(403);
  expect(calls.length).toBe(0);
});

test("handler - allowlist check takes precedence over routing", async () => {
  const { handler } = handlerWithSpy(true);

  const response = await handler(
    new Request("http://localhost:3000/nope"),
    connInfo("192.0.2.11"),
  );

  expect(response.status).toBe(403);
});

test("handler - returns 400 when the ip param is missing", async () => {
  const { handler, calls } = handlerWithSpy(true);

  const response = await handler(
    new Request("http://localhost:3000/update?domain=example.com"),
    connInfo("192.0.2.10"),
  );

  expect(response.status).toBe(400);
  expect(await response.text()).toBe("Missing IP or domain");
  expect(calls.length).toBe(0);
});

test("handler - returns 400 when the domain param is missing", async () => {
  const { handler, calls } = handlerWithSpy(true);

  const response = await handler(
    new Request("http://localhost:3000/update?ip=198.51.100.7"),
    connInfo("192.0.2.10"),
  );

  expect(response.status).toBe(400);
  expect(calls.length).toBe(0);
});

test("handler - returns 400 for empty param values", async () => {
  const { handler, calls } = handlerWithSpy(true);

  const response = await handler(
    new Request("http://localhost:3000/update?ip=&domain=example.com"),
    connInfo("192.0.2.10"),
  );

  expect(response.status).toBe(400);
  expect(calls.length).toBe(0);
});

test("handler - returns 404 for unknown paths from allowed IPs", async () => {
  const { handler, calls } = handlerWithSpy(true);

  const response = await handler(
    new Request("http://localhost:3000/update/"),
    connInfo("192.0.2.10"),
  );

  expect(response.status).toBe(404);
  expect(await response.text()).toBe("Not found");
  expect(calls.length).toBe(0);
});

test("handler - uses the real update flow by default", async () => {
  using _errors = quietConsoleErrors();
  // Without an injected updateDns the handler goes through utils + NetCup
  // API down to fetch. Make the login fail (HTTP 200 + statuscode 4000,
  // the way NetCup reports errors) and expect 500, not 200.
  using api = stubNetcupApi(() => apiResponse(4000, ""));
  const handler = createHandler(BASE_CONFIG);

  const response = await handler(updateUrl(), connInfo("192.0.2.10"));

  expect(response.status).toBe(500);
  expect(await response.text()).toBe("Failed to update DNS");
  expect(api.calls.map((call) => call.action)).toEqual(["login"]);
});
