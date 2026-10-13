import type { Dnsrecord } from "./interfaces.ts";
import { infoDnsRecord, login, logout, updateDnsRecord } from "./netcup_api.ts";

/** Remote address of a request, as Bun's `server.requestIP()` reports it. */
export interface NetAddr {
  address: string;
  family: string;
  port: number;
}

/**
 * Minimal view of the `Bun.serve` server object the handler needs; tests can
 * pass a fake with the same shape.
 */
export interface ConnInfo {
  requestIP(request: Request): NetAddr | null | undefined;
}

/**
 * Returns the peer address of the connection that carried `request`.
 *
 * A dual-stack socket reports IPv4 peers as `::ffff:<ip>`; the prefix is
 * stripped so the plain dotted-quad form reaches the allowlist comparison.
 */
export function getRemoteAddress(
  connInfo: ConnInfo,
  request: Request,
): NetAddr {
  const remoteAddr = connInfo.requestIP(request);
  if (!remoteAddr) {
    throw new Error("No remote address available for this request");
  }

  const mappedPrefix = "::ffff:";
  if (remoteAddr.address.startsWith(mappedPrefix)) {
    return {
      ...remoteAddr,
      address: remoteAddr.address.slice(mappedPrefix.length),
    };
  }
  return remoteAddr;
}

export async function updateNetcupDns(
  apiKey: string,
  apiPassword: string,
  customerNumber: string,
  domain: string,
  newIp: string,
): Promise<boolean> {
  // login
  const apiSessionId = await login(customerNumber, apiKey, apiPassword);

  if (!apiSessionId) {
    console.error("Failed to login");
    return false;
  }

  try {
    // infoDnsRecords
    const dnsrecords = await infoDnsRecord(
      customerNumber,
      apiKey,
      apiSessionId,
      domain,
    );
    if (!dnsrecords) {
      console.error("Failed to get DNS Records");
      return false;
    }

    // updateIpInDnsRecord
    const dnsRecord = updateIpInDnsRecord(dnsrecords, newIp);
    if (!dnsRecord) {
      console.error("Failed to update DNS Record");
      return false;
    }

    // updateDnsRecord
    const res = await updateDnsRecord(
      customerNumber,
      apiKey,
      apiSessionId,
      domain,
      dnsRecord,
    );
    if (!res) {
      console.error("Failed to update DNS Record");
      return false;
    }

    return true;
  } finally {
    // Always close the session. A failed logout is best-effort cleanup
    // and must not turn an applied update into a failure.
    if (!(await logout(customerNumber, apiKey, apiSessionId))) {
      console.error("Failed to logout");
    }
  }
}

export function updateIpInDnsRecord(
  dnsrecords: Dnsrecord[],
  newIp: string,
): false | Dnsrecord {
  const dnsrecord = dnsrecords.find(
    (record) => record.hostname === "@" && record.type === "A",
  );
  if (!dnsrecord) {
    console.error("DNS Record not found");
    return false;
  }

  dnsrecord.destination = newIp;
  return dnsrecord;
}
