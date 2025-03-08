import { Dnsrecord } from "./interfaces.ts";
import { infoDnsRecord, login, logout, updateDnsRecord } from "./netcup_api.ts";

function assertIsNetAddr(addr: Deno.Addr): asserts addr is Deno.NetAddr {
  if (!["tcp", "udp"].includes(addr.transport)) {
    throw new Error("Not a network address");
  }
}

export function getRemoteAddress(
  connInfo: Deno.ServeHandlerInfo,
): Deno.NetAddr {
  assertIsNetAddr(connInfo.remoteAddr);
  return connInfo.remoteAddr;
}

export async function updateNetcupDns(
  apiKey: string,
  apiPassword: string,
  customerNumber: string,
  domain: string,
  newIp: string,
): Promise<boolean> {
  // login
  const apiSessionId = await login(
    customerNumber,
    apiKey,
    apiPassword,
  );

  if (!apiSessionId) {
    console.error("Failed to login");
    return false;
  }

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

  // logout
  if (!await logout(customerNumber, apiKey, apiSessionId)) {
    console.error("Failed to logout");
    return false;
  }
  return true;
}

export function updateIpInDnsRecord(
  dnsrecords: Dnsrecord[],
  newIp: string,
): false | Dnsrecord {
  const dnsrecord = dnsrecords.find((record) =>
    record.hostname === "@" && record.type === "A"
  );
  if (!dnsrecord) {
    console.error("DNS Record not found");
    return false;
  }

  dnsrecord.destination = newIp;
  return dnsrecord;
}
