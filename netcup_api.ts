import {
  Dnsrecord,
  InfoDNSRecordsRequest,
  InfoDNSRecordsResponse,
  LoginRequest,
  UpdateDNSRecordRequest,
  UpdateDnsRecordsResponse,
} from "./interfaces.ts";

export async function login(
  customernumber: string,
  apikey: string,
  apipassword: string,
): Promise<string | null> {
  const reqBodyLogin: LoginRequest = {
    action: "login",
    param: {
      apikey: apikey,
      apipassword: apipassword,
      customernumber: customernumber,
    },
  };
  try {
    const resp = await fetch(
      "https://ccp.netcup.net/run/webservice/servers/endpoint.php?JSON",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(reqBodyLogin),
      },
    );

    if (resp.status !== 200) {
      console.error("Failed to login");
      return null;
    }

    const respJson = await resp.json();
    if (respJson.statuscode !== 2000) {
      console.error("Failed to login");
      return null;
    }

    return respJson.responsedata.apisessionid;
  } catch (error) {
    console.error("error:", error);
    return null;
  }
}

export async function logout(
  customernumber: string,
  apikey: string,
  apisessionid: string,
) {
  const logoutReqest = {
    action: "logout",
    param: {
      customernumber: customernumber,
      apikey: apikey,
      apisessionid: apisessionid,
    },
  };
  try {
    const resp = await fetch(
      "https://ccp.netcup.net/run/webservice/servers/endpoint.php?JSON",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(logoutReqest),
      },
    );

    const respJson = await resp.json();

    if (respJson.statuscode !== 2000) {
      console.error("Failed to logout");
      return false;
    }
  } catch (error) {
    console.error("error:", error);
    return false;
  }
  return true;
}

export async function infoDnsRecord(
  customernumber: string,
  apikey: string,
  apisessionid: string,
  domain: string,
): Promise<Dnsrecord[] | null> {
  const reqBodyInfoDNSRecords: InfoDNSRecordsRequest = {
    action: "infoDnsRecords",
    param: {
      domainname: domain,
      customernumber: customernumber,
      apikey: apikey,
      apisessionid: apisessionid,
    },
  };
  try {
    const resp = await fetch(
      "https://ccp.netcup.net/run/webservice/servers/endpoint.php?JSON",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(reqBodyInfoDNSRecords),
      },
    );

    if (resp.status !== 200) {
      console.error("Failed to get DNS Records");
      return null;
    }

    const respJson: InfoDNSRecordsResponse = await resp.json();

    if (respJson.statuscode !== 2000) {
      console.error("Failed to get DNS Records");
      return null;
    }

    return respJson.responsedata.dnsrecords;
  } catch (error) {
    console.error("error:", error);
    return null;
  }
}

export async function updateDnsRecord(
  customernumber: string,
  apikey: string,
  apisessionid: string,
  domain: string,
  dnsrecord: Dnsrecord,
): Promise<boolean> {
  const reqBodyUpdateDNSRecord: UpdateDNSRecordRequest = {
    action: "updateDnsRecords",
    param: {
      domainname: domain,
      customernumber: customernumber,
      apikey: apikey,
      apisessionid: apisessionid,
      dnsrecordset: {
        dnsrecords: [dnsrecord],
      },
    },
  };
  try {
    const resp = await fetch(
      "https://ccp.netcup.net/run/webservice/servers/endpoint.php?JSON",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(reqBodyUpdateDNSRecord),
      },
    );

    if (resp.status !== 200) {
      console.error("Failed to update DNS Record");
      return false;
    }

    const respJson: UpdateDnsRecordsResponse = await resp.json();

    if (respJson.statuscode !== 2000) {
      console.error("Failed to update DNS Record");
      return false;
    }
  } catch (error) {
    console.error("error:", error);
    return false;
  }
  return true;
}
