import { assert, assertEquals, assertThrows } from "@std/assert";
import type { Dnsrecord } from "./interfaces.ts";
import {
  getRemoteAddress,
  updateIpInDnsRecord,
  updateNetcupDns,
} from "./utils.ts";
import {
  apexARecord,
  apiResponse,
  quietConsoleErrors,
  respondHappy,
  respondWith,
  sampleDnsRecords,
  stubFetchRejects,
  stubNetcupApi,
} from "./test_helpers.ts";

Deno.test("getRemoteAddress - returns the tcp remote address unchanged", () => {
  const remoteAddr: Deno.NetAddr = {
    transport: "tcp",
    hostname: "192.0.2.10",
    port: 4711,
  };
  const connInfo: Deno.ServeHandlerInfo = {
    remoteAddr,
    completed: Promise.resolve(),
  };

  assertEquals(getRemoteAddress(connInfo), remoteAddr);
});

Deno.test("getRemoteAddress - throws for non-network addresses", () => {
  const connInfo: Deno.ServeHandlerInfo = {
    remoteAddr: { transport: "unix", path: "/tmp/fritzbox.sock" },
    completed: Promise.resolve(),
  };

  assertThrows(
    () => getRemoteAddress(connInfo),
    Error,
    "Not a network address",
  );
});

Deno.test("updateIpInDnsRecord - updates the apex A record in place", () => {
  const records = sampleDnsRecords();

  const result = updateIpInDnsRecord(records, "198.51.100.7");

  assert(result !== false);
  assertEquals(result.hostname, "@");
  assertEquals(result.type, "A");
  assertEquals(result.destination, "198.51.100.7");
  // the record is mutated and the very same object is returned
  assertEquals(result, records[1]);
  // unrelated records stay untouched
  assertEquals(records[0].destination, "192.0.2.5");
  assertEquals(records[2].destination, "2001:db8::1");
});

Deno.test("updateIpInDnsRecord - returns false when no apex A record exists", () => {
  const records = [
    { id: "222", hostname: "www", type: "A", destination: "192.0.2.5" },
    { id: "333", hostname: "@", type: "AAAA", destination: "2001:db8::1" },
  ];

  assertEquals(updateIpInDnsRecord(records, "198.51.100.7"), false);
});

Deno.test("updateIpInDnsRecord - returns false for an empty record list", () => {
  assertEquals(updateIpInDnsRecord([], "198.51.100.7"), false);
});

Deno.test("updateNetcupDns - runs the full session flow on success", async () => {
  using api = stubNetcupApi(respondHappy());

  const ok = await updateNetcupDns(
    "api-key",
    "api-password",
    "123",
    "example.com",
    "198.51.100.7",
  );

  assertEquals(ok, true);
  assertEquals(
    api.calls.map((call) => call.action),
    ["login", "infoDnsRecords", "updateDnsRecords", "logout"],
  );
  assertEquals(api.calls[0].param, {
    apikey: "api-key",
    apipassword: "api-password",
    customernumber: "123",
  });
  // the updated apex A record is what gets sent to NetCup
  const dnsrecordset = api.calls[2].param.dnsrecordset as {
    dnsrecords: Dnsrecord[];
  };
  assertEquals(dnsrecordset.dnsrecords.length, 1);
  assertEquals(dnsrecordset.dnsrecords[0], {
    id: "111",
    hostname: "@",
    type: "A",
    destination: "198.51.100.7",
  });
  // the session id from the login is reused for the later calls
  assertEquals(api.calls[1].param.apisessionid, "session-abc");
  assertEquals(api.calls[3].param.apisessionid, "session-abc");
});

Deno.test("updateNetcupDns - returns false when login fails", async () => {
  using _errors = quietConsoleErrors();
  using api = stubNetcupApi(
    respondWith({ login: () => apiResponse(4000, "") }),
  );

  const ok = await updateNetcupDns(
    "api-key",
    "api-password",
    "123",
    "example.com",
    "198.51.100.7",
  );

  assertEquals(ok, false);
  // no further API calls after the failed login
  assertEquals(api.calls.map((call) => call.action), ["login"]);
});

Deno.test("updateNetcupDns - returns false when fetching records fails", async () => {
  using _errors = quietConsoleErrors();
  using api = stubNetcupApi(
    respondWith({ infoDnsRecords: () => apiResponse(4000, "", 500) }),
  );

  const ok = await updateNetcupDns(
    "api-key",
    "api-password",
    "123",
    "example.com",
    "198.51.100.7",
  );

  assertEquals(ok, false);
  // the session is closed even when fetching records fails
  assertEquals(api.calls.map((call) => call.action), [
    "login",
    "infoDnsRecords",
    "logout",
  ]);
});

Deno.test("updateNetcupDns - returns false when no apex A record exists", async () => {
  using _errors = quietConsoleErrors();
  using api = stubNetcupApi(
    respondHappy([
      { id: "222", hostname: "www", type: "A", destination: "192.0.2.5" },
    ]),
  );

  const ok = await updateNetcupDns(
    "api-key",
    "api-password",
    "123",
    "example.com",
    "198.51.100.7",
  );

  assertEquals(ok, false);
  // logout runs even when the flow aborts — no leaked API session
  assertEquals(api.calls.map((call) => call.action), [
    "login",
    "infoDnsRecords",
    "logout",
  ]);
});

Deno.test("updateNetcupDns - returns false when the update call fails", async () => {
  using _errors = quietConsoleErrors();
  using api = stubNetcupApi(
    respondWith({ updateDnsRecords: () => apiResponse(4000, "") }),
  );

  const ok = await updateNetcupDns(
    "api-key",
    "api-password",
    "123",
    "example.com",
    "198.51.100.7",
  );

  assertEquals(ok, false);
  // logout runs even after a failed update — no leaked API session
  assertEquals(api.calls.map((call) => call.action), [
    "login",
    "infoDnsRecords",
    "updateDnsRecords",
    "logout",
  ]);
});

Deno.test("updateNetcupDns - returns true when only the logout fails", async () => {
  using _errors = quietConsoleErrors();
  using api = stubNetcupApi(
    respondWith({ logout: () => apiResponse(4004, "") }),
  );

  const ok = await updateNetcupDns(
    "api-key",
    "api-password",
    "123",
    "example.com",
    "198.51.100.7",
  );

  // logout is best-effort cleanup: the applied update still counts as success
  assertEquals(ok, true);
  assertEquals(api.calls.map((call) => call.action), [
    "login",
    "infoDnsRecords",
    "updateDnsRecords",
    "logout",
  ]);
});

Deno.test("updateNetcupDns - returns false when the network call fails", async () => {
  using _errors = quietConsoleErrors();
  using _fetch = stubFetchRejects();

  const ok = await updateNetcupDns(
    "api-key",
    "api-password",
    "123",
    "example.com",
    "198.51.100.7",
  );

  assertEquals(ok, false);
});

Deno.test("updateNetcupDns - matches the apex A record independent of position", async () => {
  using api = stubNetcupApi(respondHappy([apexARecord("203.0.113.9")]));

  const ok = await updateNetcupDns(
    "api-key",
    "api-password",
    "123",
    "example.com",
    "198.51.100.7",
  );

  assertEquals(ok, true);
  const dnsrecordset = api.calls[2].param.dnsrecordset as {
    dnsrecords: Dnsrecord[];
  };
  assertEquals(dnsrecordset.dnsrecords[0].destination, "198.51.100.7");
});
