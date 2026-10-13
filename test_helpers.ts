// Shared helpers for the *_test.ts files. Deliberately NOT named *.test.ts
// or *_test.ts so `bun test` does not pick it up as a test suite.
import type { Dnsrecord } from "./interfaces";

export const NETCUP_ENDPOINT =
  "https://ccp.netcup.net/run/webservice/servers/endpoint.php?JSON";

/**
 * Minimal property stub with the same dispose contract as
 * `@std/testing/mock`'s `stub`, so tests can keep using `using`.
 */
export interface Stubbed {
  restore(): void;
  [Symbol.dispose](): void;
}

function stub<O extends object, K extends keyof O>(
  object: O,
  key: K,
  value: O[K],
): Stubbed {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  Object.defineProperty(object, key, {
    value,
    writable: true,
    configurable: true,
    enumerable: descriptor?.enumerable ?? true,
  });
  const restore = () => {
    if (descriptor) {
      Object.defineProperty(object, key, descriptor);
    } else {
      delete object[key];
    }
  };
  return { restore, [Symbol.dispose]: restore };
}

export interface NetcupCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  action: string;
  param: Record<string, unknown>;
}

/** A NetCup API JSON response (success usually means HTTP 200 + statuscode 2000). */
export function apiResponse(
  statuscode: number,
  responsedata: unknown,
  status = 200,
): Response {
  return new Response(
    JSON.stringify({
      serverrequestid: "00000000-0000-0000-0000-000000000000",
      action: "response",
      status: statuscode === 2000 ? "success" : "error",
      statuscode,
      shortmessage: statuscode === 2000 ? "erfolgreich" : "fehlgeschlagen",
      longmessage: "",
      responsedata,
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}

export interface NetcupApiStub {
  calls: NetcupCall[];
  [Symbol.dispose](): void;
}

/** Stubs the global fetch with a NetCup fake that records every call. */
export function stubNetcupApi(
  respond: (call: NetcupCall) => Response,
): NetcupApiStub {
  const calls: NetcupCall[] = [];
  const fake = ((input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      action: string;
      param: Record<string, unknown>;
    };
    const call: NetcupCall = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      action: body.action,
      param: body.param,
    };
    calls.push(call);
    return Promise.resolve(respond(call));
  }) as unknown as typeof fetch;
  const mock = stub(globalThis, "fetch", fake);
  return {
    calls,
    [Symbol.dispose]: () => mock.restore(),
  };
}

/** Makes every fetch call fail with a network error. Use with `using`. */
export function stubFetchRejects(message = "network down") {
  return stub(globalThis, "fetch", (() =>
    Promise.reject(new Error(message))) as unknown as typeof fetch);
}

/** The API layer reports errors via console.error; keep test output quiet. */
export function quietConsoleErrors() {
  return stub(console, "error", () => {});
}

export function apexARecord(destination = "192.0.2.1"): Dnsrecord {
  return { id: "111", hostname: "@", type: "A", destination };
}

export function sampleDnsRecords(): Dnsrecord[] {
  return [
    { id: "222", hostname: "www", type: "A", destination: "192.0.2.5" },
    apexARecord(),
    { id: "333", hostname: "@", type: "AAAA", destination: "2001:db8::1" },
  ];
}

/** Responder that answers every action of the session flow successfully. */
export function respondHappy(
  records: Dnsrecord[] = sampleDnsRecords(),
): (call: NetcupCall) => Response {
  return (call) => {
    switch (call.action) {
      case "login":
        return apiResponse(2000, { apisessionid: "session-abc" });
      case "infoDnsRecords":
        return apiResponse(2000, { dnsrecords: records });
      case "updateDnsRecords":
        return apiResponse(2000, { dnsrecords: records });
      case "logout":
        return apiResponse(2000, "");
      default:
        return apiResponse(4000, "", 500);
    }
  };
}

/** Success responder with per-action overrides, e.g. { updateDnsRecords: ... }. */
export function respondWith(
  overrides: Partial<Record<string, () => Response>>,
  records?: Dnsrecord[],
): (call: NetcupCall) => Response {
  const happy = respondHappy(records);
  return (call) => overrides[call.action]?.() ?? happy(call);
}
