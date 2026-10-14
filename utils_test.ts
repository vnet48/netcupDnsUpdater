import { expect, test } from "bun:test";
import type { Dnsrecord } from "./interfaces";
import {
  apexARecord,
  apiResponse,
  quietConsoleErrors,
  respondHappy,
  respondWith,
  sampleDnsRecords,
  stubFetchRejects,
  stubNetcupApi,
} from "./test_helpers";
import {
  type ConnInfo,
  getRemoteAddress,
  type NetAddr,
  updateIpInDnsRecord,
  updateNetcupDns,
} from "./utils";

function connInfoWith(addr: NetAddr | undefined): ConnInfo {
  return { requestIP: () => addr };
}

const SOME_REQUEST = new Request("http://localhost:3000/update");

test("getRemoteAddress - returns the tcp remote address unchanged", () => {
  const remoteAddr: NetAddr = {
    address: "192.0.2.10",
    family: "IPv4",
    port: 4711,
  };

  expect(getRemoteAddress(connInfoWith(remoteAddr), SOME_REQUEST)).toEqual(
    remoteAddr,
  );
});

test("getRemoteAddress - strips the ::ffff: prefix of IPv4-mapped addresses", () => {
  // A dual-stack Bun.serve reports IPv4 peers as ::ffff:<ip>; the allowlist
  // comparison needs the plain dotted-quad form.
  const mapped: NetAddr = {
    address: "::ffff:127.0.0.1",
    family: "IPv6",
    port: 4711,
  };

  expect(getRemoteAddress(connInfoWith(mapped), SOME_REQUEST)).toEqual({
    address: "127.0.0.1",
    family: "IPv6",
    port: 4711,
  });
});

test("getRemoteAddress - throws when no remote address is available", () => {
  expect(() => getRemoteAddress(connInfoWith(undefined), SOME_REQUEST)).toThrow(
    "No remote address",
  );
});

test("updateIpInDnsRecord - updates the apex A record in place", () => {
  const records = sampleDnsRecords();

  const result = updateIpInDnsRecord(records, "198.51.100.7");

  if (result === false) {
    throw new Error("expected the apex A record to be updated");
  }
  expect(result.hostname).toBe("@");
  expect(result.type).toBe("A");
  expect(result.destination).toBe("198.51.100.7");
  // the record is mutated and the very same object is returned
  expect(result).toBe(records[1]);
  // unrelated records stay untouched
  expect(records[0].destination).toBe("192.0.2.5");
  expect(records[2].destination).toBe("2001:db8::1");
});

test("updateIpInDnsRecord - returns false when no apex A record exists", () => {
  const records = [
    { id: "222", hostname: "www", type: "A", destination: "192.0.2.5" },
    { id: "333", hostname: "@", type: "AAAA", destination: "2001:db8::1" },
  ];

  expect(updateIpInDnsRecord(records, "198.51.100.7")).toBe(false);
});

test("updateIpInDnsRecord - returns false for an empty record list", () => {
  expect(updateIpInDnsRecord([], "198.51.100.7")).toBe(false);
});

test("updateNetcupDns - runs the full session flow on success", async () => {
  using api = stubNetcupApi(respondHappy());

  const ok = await updateNetcupDns(
    "api-key",
    "api-password",
    "123",
    "example.com",
    "198.51.100.7",
  );

  expect(ok).toBe(true);
  expect(api.calls.map((call) => call.action)).toEqual([
    "login",
    "infoDnsRecords",
    "updateDnsRecords",
    "logout",
  ]);
  expect(api.calls[0].param).toEqual({
    apikey: "api-key",
    apipassword: "api-password",
    customernumber: "123",
  });
  // the updated apex A record is what gets sent to NetCup
  const dnsrecordset = api.calls[2].param.dnsrecordset as {
    dnsrecords: Dnsrecord[];
  };
  expect(dnsrecordset.dnsrecords.length).toBe(1);
  expect(dnsrecordset.dnsrecords[0]).toEqual({
    id: "111",
    hostname: "@",
    type: "A",
    destination: "198.51.100.7",
  });
  // the session id from the login is reused for the later calls
  expect(api.calls[1].param.apisessionid).toBe("session-abc");
  expect(api.calls[3].param.apisessionid).toBe("session-abc");
});

test("updateNetcupDns - returns false when login fails", async () => {
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

  expect(ok).toBe(false);
  // no further API calls after the failed login
  expect(api.calls.map((call) => call.action)).toEqual(["login"]);
});

test("updateNetcupDns - returns false when fetching records fails", async () => {
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

  expect(ok).toBe(false);
  // the session is closed even when fetching records fails
  expect(api.calls.map((call) => call.action)).toEqual([
    "login",
    "infoDnsRecords",
    "logout",
  ]);
});

test("updateNetcupDns - returns false when no apex A record exists", async () => {
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

  expect(ok).toBe(false);
  // logout runs even when the flow aborts — no leaked API session
  expect(api.calls.map((call) => call.action)).toEqual([
    "login",
    "infoDnsRecords",
    "logout",
  ]);
});

test("updateNetcupDns - returns false when the update call fails", async () => {
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

  expect(ok).toBe(false);
  // logout runs even after a failed update — no leaked API session
  expect(api.calls.map((call) => call.action)).toEqual([
    "login",
    "infoDnsRecords",
    "updateDnsRecords",
    "logout",
  ]);
});

test("updateNetcupDns - returns true when only the logout fails", async () => {
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
  expect(ok).toBe(true);
  expect(api.calls.map((call) => call.action)).toEqual([
    "login",
    "infoDnsRecords",
    "updateDnsRecords",
    "logout",
  ]);
});

test("updateNetcupDns - returns false when the network call fails", async () => {
  using _errors = quietConsoleErrors();
  using _fetch = stubFetchRejects();

  const ok = await updateNetcupDns(
    "api-key",
    "api-password",
    "123",
    "example.com",
    "198.51.100.7",
  );

  expect(ok).toBe(false);
});

test("updateNetcupDns - matches the apex A record independent of position", async () => {
  using api = stubNetcupApi(respondHappy([apexARecord("203.0.113.9")]));

  const ok = await updateNetcupDns(
    "api-key",
    "api-password",
    "123",
    "example.com",
    "198.51.100.7",
  );

  expect(ok).toBe(true);
  const dnsrecordset = api.calls[2].param.dnsrecordset as {
    dnsrecords: Dnsrecord[];
  };
  expect(dnsrecordset.dnsrecords[0].destination).toBe("198.51.100.7");
});
