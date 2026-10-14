package main

type LoginRequest struct {
	Action string            `json:"action"`
	Param  LoginRequestParam `json:"param"`
}

type LoginRequestParam struct {
	APIKey         string `json:"apikey"`
	APIPassword    string `json:"apipassword"`
	CustomerNumber string `json:"customernumber"`
}

type LoginResponse struct {
	ServerRequestID string            `json:"serverrequestid"`
	ClientRequestID string            `json:"clientrequestid"`
	Action          string            `json:"action"`
	Status          string            `json:"status"`
	StatusCode      int               `json:"statuscode"`
	ShortMessage    string            `json:"shortmessage"`
	LongMessage     string            `json:"longmessage"`
	ResponseData    LoginResponseData `json:"responsedata"`
}

type LoginResponseData struct {
	APISessionID string `json:"apisessionid"`
}

type LogoutRequest struct {
	Action string             `json:"action"`
	Param  LogoutRequestParam `json:"param"`
}

type LogoutRequestParam struct {
	CustomerNumber string `json:"customernumber"`
	APIKey         string `json:"apikey"`
	APISessionID   string `json:"apisessionid"`
}

type LogoutResponse struct {
	ServerRequestID string `json:"serverrequestid"`
	ClientRequestID string `json:"clientrequestid"`
	Action          string `json:"action"`
	Status          string `json:"status"`
	StatusCode      int    `json:"statuscode"`
	ShortMessage    string `json:"shortmessage"`
	LongMessage     string `json:"longmessage"`
	ResponseData    string `json:"responsedata"`
}

type InfoDNSRecordsRequest struct {
	Action string                     `json:"action"`
	Param  InfoDNSRecordsRequestParam `json:"param"`
}

type InfoDNSRecordsRequestParam struct {
	DomainName     string `json:"domainname"`
	CustomerNumber string `json:"customernumber"`
	APIKey         string `json:"apikey"`
	APISessionID   string `json:"apisessionid"`
}

type InfoDNSRecordsResponse struct {
	ServerRequestID string                     `json:"serverrequestid"`
	ClientRequestID string                     `json:"clientrequestid"`
	Action          string                     `json:"action"`
	Status          string                     `json:"status"`
	StatusCode      int                        `json:"statuscode"`
	ShortMessage    string                     `json:"shortmessage"`
	LongMessage     string                     `json:"longmessage"`
	ResponseData    InfoDNSRecordsResponseData `json:"responsedata"`
}

type InfoDNSRecordsResponseData struct {
	DNSRecords []DNSRecord `json:"dnsrecords"`
}

type DNSRecord struct {
	ID           string `json:"id,omitempty"`
	Hostname     string `json:"hostname"`
	Type         string `json:"type"`
	Priority     string `json:"priority,omitempty"`
	Destination  string `json:"destination"`
	DeleteRecord bool   `json:"deleterecord,omitempty"`
	State        string `json:"state,omitempty"`
}

type UpdateDNSRecordRequest struct {
	Action string                      `json:"action"`
	Param  UpdateDNSRecordRequestParam `json:"param"`
}

type UpdateDNSRecordRequestParam struct {
	DomainName     string       `json:"domainname"`
	CustomerNumber string       `json:"customernumber"`
	APIKey         string       `json:"apikey"`
	APISessionID   string       `json:"apisessionid"`
	DNSRecordSet   DNSRecordSet `json:"dnsrecordset"`
}

type DNSRecordSet struct {
	DNSRecords []DNSRecord `json:"dnsrecords"`
}

type UpdateDNSRecordResponse struct {
	ServerRequestID string                      `json:"serverrequestid"`
	ClientRequestID string                      `json:"clientrequestid"`
	Action          string                      `json:"action"`
	Status          string                      `json:"status"`
	StatusCode      int                         `json:"statuscode"`
	ShortMessage    string                      `json:"shortmessage"`
	LongMessage     string                      `json:"longmessage"`
	ResponseData    UpdateDNSRecordResponseData `json:"responsedata"`
}

type UpdateDNSRecordResponseData struct {
	DNSRecords []DNSRecord `json:"dnsrecords"`
}

type NetcupError struct {
	Code    int
	Message string
}

func (e *NetcupError) Error() string {
	return e.Message
}

const (
	ErrLoginFailed     = 1001
	ErrLogoutFailed    = 1002
	ErrGetDnsRecords   = 1003
	ErrUpdateDnsRecord = 1004
	ErrMissingIP       = 2001
	ErrMissingDomain   = 2002
	ErrForbidden       = 2003
	ErrNotFound        = 2004
)
