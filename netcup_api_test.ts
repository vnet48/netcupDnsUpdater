import { expect, test } from "bun:test";
import type { Dnsrecord } from "./interfaces.ts";
import { infoDnsRecord, login, logout, updateDnsRecord } from "./netcup_api.ts";
import {
  apiResponse,
  NETCUP_ENDPOINT,
  quietConsoleErrors,
  stubFetchRejects,
  stubNetcupApi,
} from "./test_helpers.ts";

test("login - returns the API session id on success", async () => {
  using api = stubNetcupApi(() =>
    apiResponse(2000, { apisessionid: "session-abc" }),
  );

  const sessionId = await login("123", "api-key", "api-password");

  expect(sessionId).toBe("session-abc");
  expect(api.calls.length).toBe(1);
  expect(api.calls[0].url).toBe(NETCUP_ENDPOINT);
  expect(api.calls[0].method).toBe("POST");
  expect(api.calls[0].headers["Content-Type"]).toBe("application/json");
  expect(api.calls[0].action).toBe("login");
  expect(api.calls[0].param).toEqual({
    apikey: "api-key",
    apipassword: "api-password",
    customernumber: "123",
  });
});

test("login - returns null when HTTP status is not 200", async () => {
  using _errors = quietConsoleErrors();
  using _api = stubNetcupApi(() => apiResponse(2000, {}, 500));

  expect(await login("123", "api-key", "api-password")).toBeNull();
});

test("login - returns null when NetCup statuscode is not 2000", async () => {
  using _errors = quietConsoleErrors();
  // NetCup answers HTTP 200 even on many failures — the statuscode decides.
  using _api = stubNetcupApi(() => apiResponse(4000, ""));

  expect(await login("123", "api-key", "api-password")).toBeNull();
});

test("login - returns null when the network call fails", async () => {
  using _errors = quietConsoleErrors();
  using _fetch = stubFetchRejects();

  expect(await login("123", "api-key", "api-password")).toBeNull();
});

test("logout - returns true on success and sends session params", async () => {
  using api = stubNetcupApi(() => apiResponse(2000, ""));

  expect(await logout("123", "api-key", "session-abc")).toBe(true);
  expect(api.calls.length).toBe(1);
  expect(api.calls[0].action).toBe("logout");
  expect(api.calls[0].param).toEqual({
    customernumber: "123",
    apikey: "api-key",
    apisessionid: "session-abc",
  });
});

test("logout - returns false when statuscode is not 2000", async () => {
  using _errors = quietConsoleErrors();
  using _api = stubNetcupApi(() => apiResponse(4004, ""));

  expect(await logout("123", "api-key", "session-abc")).toBe(false);
});

test("logout - returns false when the response body is not JSON", async () => {
  using _errors = quietConsoleErrors();
  using _api = stubNetcupApi(
    () => new Response("Internal Server Error", { status: 500 }),
  );

  expect(await logout("123", "api-key", "session-abc")).toBe(false);
});

test("logout - returns false when the network call fails", async () => {
  using _errors = quietConsoleErrors();
  using _fetch = stubFetchRejects();

  expect(await logout("123", "api-key", "session-abc")).toBe(false);
});

test("infoDnsRecord - returns the DNS records on success", async () => {
  const records: Dnsrecord[] = [
    { id: "111", hostname: "@", type: "A", destination: "192.0.2.1" },
  ];
  using api = stubNetcupApi(() => apiResponse(2000, { dnsrecords: records }));

  const result = await infoDnsRecord(
    "123",
    "api-key",
    "session-abc",
    "example.com",
  );

  expect(result).toEqual(records);
  expect(api.calls[0].action).toBe("infoDnsRecords");
  expect(api.calls[0].param).toEqual({
    domainname: "example.com",
    customernumber: "123",
    apikey: "api-key",
    apisessionid: "session-abc",
  });
});

test("infoDnsRecord - returns null when HTTP status is not 200", async () => {
  using _errors = quietConsoleErrors();
  using _api = stubNetcupApi(() => apiResponse(2000, { dnsrecords: [] }, 500));

  expect(
    await infoDnsRecord("123", "api-key", "session-abc", "example.com"),
  ).toBeNull();
});

test("infoDnsRecord - returns null when statuscode is not 2000", async () => {
  using _errors = quietConsoleErrors();
  using _api = stubNetcupApi(() => apiResponse(4000, ""));

  expect(
    await infoDnsRecord("123", "api-key", "session-abc", "example.com"),
  ).toBeNull();
});

test("infoDnsRecord - returns null when the network call fails", async () => {
  using _errors = quietConsoleErrors();
  using _fetch = stubFetchRejects();

  expect(
    await infoDnsRecord("123", "api-key", "session-abc", "example.com"),
  ).toBeNull();
});

test("updateDnsRecord - returns true and sends the record set on success", async () => {
  const record: Dnsrecord = {
    id: "111",
    hostname: "@",
    type: "A",
    destination: "198.51.100.7",
  };
  using api = stubNetcupApi(() => apiResponse(2000, { dnsrecords: [record] }));

  const result = await updateDnsRecord(
    "123",
    "api-key",
    "session-abc",
    "example.com",
    record,
  );

  expect(result).toBe(true);
  expect(api.calls[0].action).toBe("updateDnsRecords");
  expect(api.calls[0].param).toEqual({
    domainname: "example.com",
    customernumber: "123",
    apikey: "api-key",
    apisessionid: "session-abc",
    dnsrecordset: { dnsrecords: [record] },
  });
});

test("updateDnsRecord - returns false when HTTP status is not 200", async () => {
  using _errors = quietConsoleErrors();
  using _api = stubNetcupApi(() => apiResponse(2000, { dnsrecords: [] }, 500));

  expect(
    await updateDnsRecord("123", "api-key", "session-abc", "example.com", {
      hostname: "@",
      type: "A",
      destination: "198.51.100.7",
    }),
  ).toBe(false);
});

test("updateDnsRecord - returns false when statuscode is not 2000", async () => {
  using _errors = quietConsoleErrors();
  using _api = stubNetcupApi(() => apiResponse(4000, ""));

  expect(
    await updateDnsRecord("123", "api-key", "session-abc", "example.com", {
      hostname: "@",
      type: "A",
      destination: "198.51.100.7",
    }),
  ).toBe(false);
});

test("updateDnsRecord - returns false when the network call fails", async () => {
  using _errors = quietConsoleErrors();
  using _fetch = stubFetchRejects();

  expect(
    await updateDnsRecord("123", "api-key", "session-abc", "example.com", {
      hostname: "@",
      type: "A",
      destination: "198.51.100.7",
    }),
  ).toBe(false);
});
