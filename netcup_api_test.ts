import { assertEquals } from "@std/assert";
import { infoDnsRecord, login, logout, updateDnsRecord } from "./netcup_api.ts";
import type { Dnsrecord } from "./interfaces.ts";
import {
  apiResponse,
  NETCUP_ENDPOINT,
  quietConsoleErrors,
  stubFetchRejects,
  stubNetcupApi,
} from "./test_helpers.ts";

Deno.test("login - returns the API session id on success", async () => {
  using api = stubNetcupApi(
    () => apiResponse(2000, { apisessionid: "session-abc" }),
  );

  const sessionId = await login("123", "api-key", "api-password");

  assertEquals(sessionId, "session-abc");
  assertEquals(api.calls.length, 1);
  assertEquals(api.calls[0].url, NETCUP_ENDPOINT);
  assertEquals(api.calls[0].method, "POST");
  assertEquals(api.calls[0].headers["Content-Type"], "application/json");
  assertEquals(api.calls[0].action, "login");
  assertEquals(api.calls[0].param, {
    apikey: "api-key",
    apipassword: "api-password",
    customernumber: "123",
  });
});

Deno.test("login - returns null when HTTP status is not 200", async () => {
  using _errors = quietConsoleErrors();
  using _api = stubNetcupApi(() => apiResponse(2000, {}, 500));

  assertEquals(await login("123", "api-key", "api-password"), null);
});

Deno.test("login - returns null when NetCup statuscode is not 2000", async () => {
  using _errors = quietConsoleErrors();
  // NetCup answers HTTP 200 even on many failures — the statuscode decides.
  using _api = stubNetcupApi(() => apiResponse(4000, ""));

  assertEquals(await login("123", "api-key", "api-password"), null);
});

Deno.test("login - returns null when the network call fails", async () => {
  using _errors = quietConsoleErrors();
  using _fetch = stubFetchRejects();

  assertEquals(await login("123", "api-key", "api-password"), null);
});

Deno.test("logout - returns true on success and sends session params", async () => {
  using api = stubNetcupApi(() => apiResponse(2000, ""));

  assertEquals(await logout("123", "api-key", "session-abc"), true);
  assertEquals(api.calls.length, 1);
  assertEquals(api.calls[0].action, "logout");
  assertEquals(api.calls[0].param, {
    customernumber: "123",
    apikey: "api-key",
    apisessionid: "session-abc",
  });
});

Deno.test("logout - returns false when statuscode is not 2000", async () => {
  using _errors = quietConsoleErrors();
  using _api = stubNetcupApi(() => apiResponse(4004, ""));

  assertEquals(await logout("123", "api-key", "session-abc"), false);
});

Deno.test("logout - returns false when the response body is not JSON", async () => {
  using _errors = quietConsoleErrors();
  using _api = stubNetcupApi(
    () => new Response("Internal Server Error", { status: 500 }),
  );

  assertEquals(await logout("123", "api-key", "session-abc"), false);
});

Deno.test("logout - returns false when the network call fails", async () => {
  using _errors = quietConsoleErrors();
  using _fetch = stubFetchRejects();

  assertEquals(await logout("123", "api-key", "session-abc"), false);
});

Deno.test("infoDnsRecord - returns the DNS records on success", async () => {
  const records: Dnsrecord[] = [
    { id: "111", hostname: "@", type: "A", destination: "192.0.2.1" },
  ];
  using api = stubNetcupApi(
    () => apiResponse(2000, { dnsrecords: records }),
  );

  const result = await infoDnsRecord(
    "123",
    "api-key",
    "session-abc",
    "example.com",
  );

  assertEquals(result, records);
  assertEquals(api.calls[0].action, "infoDnsRecords");
  assertEquals(api.calls[0].param, {
    domainname: "example.com",
    customernumber: "123",
    apikey: "api-key",
    apisessionid: "session-abc",
  });
});

Deno.test("infoDnsRecord - returns null when HTTP status is not 200", async () => {
  using _errors = quietConsoleErrors();
  using _api = stubNetcupApi(
    () => apiResponse(2000, { dnsrecords: [] }, 500),
  );

  assertEquals(
    await infoDnsRecord("123", "api-key", "session-abc", "example.com"),
    null,
  );
});

Deno.test("infoDnsRecord - returns null when statuscode is not 2000", async () => {
  using _errors = quietConsoleErrors();
  using _api = stubNetcupApi(() => apiResponse(4000, ""));

  assertEquals(
    await infoDnsRecord("123", "api-key", "session-abc", "example.com"),
    null,
  );
});

Deno.test("infoDnsRecord - returns null when the network call fails", async () => {
  using _errors = quietConsoleErrors();
  using _fetch = stubFetchRejects();

  assertEquals(
    await infoDnsRecord("123", "api-key", "session-abc", "example.com"),
    null,
  );
});

Deno.test("updateDnsRecord - returns true and sends the record set on success", async () => {
  const record: Dnsrecord = {
    id: "111",
    hostname: "@",
    type: "A",
    destination: "198.51.100.7",
  };
  using api = stubNetcupApi(
    () => apiResponse(2000, { dnsrecords: [record] }),
  );

  const result = await updateDnsRecord(
    "123",
    "api-key",
    "session-abc",
    "example.com",
    record,
  );

  assertEquals(result, true);
  assertEquals(api.calls[0].action, "updateDnsRecords");
  assertEquals(api.calls[0].param, {
    domainname: "example.com",
    customernumber: "123",
    apikey: "api-key",
    apisessionid: "session-abc",
    dnsrecordset: { dnsrecords: [record] },
  });
});

Deno.test("updateDnsRecord - returns false when HTTP status is not 200", async () => {
  using _errors = quietConsoleErrors();
  using _api = stubNetcupApi(
    () => apiResponse(2000, { dnsrecords: [] }, 500),
  );

  assertEquals(
    await updateDnsRecord(
      "123",
      "api-key",
      "session-abc",
      "example.com",
      { hostname: "@", type: "A", destination: "198.51.100.7" },
    ),
    false,
  );
});

Deno.test("updateDnsRecord - returns false when statuscode is not 2000", async () => {
  using _errors = quietConsoleErrors();
  using _api = stubNetcupApi(() => apiResponse(4000, ""));

  assertEquals(
    await updateDnsRecord(
      "123",
      "api-key",
      "session-abc",
      "example.com",
      { hostname: "@", type: "A", destination: "198.51.100.7" },
    ),
    false,
  );
});

Deno.test("updateDnsRecord - returns false when the network call fails", async () => {
  using _errors = quietConsoleErrors();
  using _fetch = stubFetchRejects();

  assertEquals(
    await updateDnsRecord(
      "123",
      "api-key",
      "session-abc",
      "example.com",
      { hostname: "@", type: "A", destination: "198.51.100.7" },
    ),
    false,
  );
});
