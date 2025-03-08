// import * as xml from "@libs/xml";
export interface LoginRequest {
  action: string;
  param: LoginRequestParam;
}

export interface LoginRequestParam {
  apikey: string;
  apipassword: string;
  customernumber: string;
  clientrequestid?: string;
}

export interface LoginResponse {
  serverrequestid: string;
  clientrequestid: string;
  action: string;
  status: string;
  statuscode: number;
  shortmessage: string;
  longmessage: string;
  responsedata: LoginResponsedata;
}

export interface LoginResponsedata {
  apisessionid: string;
}

export interface LogoutRequest {
  action: string;
  param: LogoutRequestParam;
}

export interface LogoutRequestParam {
  customernumber: string;
  apikey: string;
  apisessionid: string;
  clientrequestid?: string;
}

export interface LogoutResponse {
  serverrequestid: string;
  clientrequestid: string;
  action: string;
  status: string;
  statuscode: number;
  shortmessage: string;
  longmessage: string;
  responsedata: string;
}

export interface InfoDNSRecordsRequest {
  action: string;
  param: InfoDNSRecordsRequestParam;
}

export interface InfoDNSRecordsRequestParam {
  domainname: string;
  customernumber: string;
  apikey: string;
  apisessionid: string;
  clientrequestid?: string;
}

export interface InfoDNSRecordsResponse {
  serverrequestid: string;
  clientrequestid: string;
  action: string;
  status: string;
  statuscode: number;
  shortmessage: string;
  longmessage: string;
  responsedata: InfoDNSRecordsResponsedata;
}

export interface InfoDNSRecordsResponsedata {
  dnsrecords: Dnsrecord[];
}

export interface Dnsrecord {
  id?: string;
  hostname: string;
  type: string;
  priority?: string;
  destination: string;
  deleterecord?: boolean;
  state?: string;
}

export interface UpdateDNSRecordRequest {
  action: string;
  param: UpdateDNSRecordRequestParam;
}

export interface UpdateDNSRecordRequestParam {
  domainname: string;
  customernumber: string;
  apikey: string;
  apisessionid: string;
  clientRequestID?: string;
  dnsrecordset: {
    dnsrecords: Dnsrecord[];
  };
}

export interface UpdateDnsRecordsResponse {
  serverrequestid: string;
  clientrequestid: string;
  action: string;
  status: string;
  statuscode: number;
  shortmessage: string;
  longmessage: string;
  responsedata: UpdateDnsRecordsResponsedata;
}

export interface UpdateDnsRecordsResponsedata {
  dnsrecords: Dnsrecord[];
}
