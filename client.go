package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
)

const apiURL = "https://ccp.netcup.net/run/webservice/servers/endpoint.php?JSON"

type NetcupClient struct {
	APIKey         string
	APIPassword    string
	CustomerNumber string
	baseURL        string
	httpClient     *http.Client
}

func NewNetcupClient(apiKey, apiPassword, customerNumber string) *NetcupClient {
	return NewNetcupClientWithBaseURL(apiURL, apiKey, apiPassword, customerNumber)
}

// NewNetcupClientWithBaseURL allows overriding the API endpoint, e.g. for
// integration tests with a mocked Netcup API.
func NewNetcupClientWithBaseURL(baseURL, apiKey, apiPassword, customerNumber string) *NetcupClient {
	return &NetcupClient{
		APIKey:         apiKey,
		APIPassword:    apiPassword,
		CustomerNumber: customerNumber,
		baseURL:        baseURL,
		httpClient:     &http.Client{},
	}
}

func (c *NetcupClient) login() (string, error) {
	reqBody := LoginRequest{
		Action: "login",
		Param: LoginRequestParam{
			APIKey:         c.APIKey,
			APIPassword:    c.APIPassword,
			CustomerNumber: c.CustomerNumber,
		},
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal login request: %w", err)
	}

	resp, err := c.httpClient.Post(c.baseURL, "application/json", bytes.NewBuffer(body))
	if err != nil {
		return "", fmt.Errorf("failed to send login request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", &NetcupError{Code: ErrLoginFailed, Message: "login request failed"}
	}

	var loginResp LoginResponse
	if err := json.NewDecoder(resp.Body).Decode(&loginResp); err != nil {
		return "", fmt.Errorf("failed to decode login response: %w", err)
	}

	if loginResp.StatusCode != 2000 {
		return "", &NetcupError{Code: ErrLoginFailed, Message: "login failed"}
	}

	return loginResp.ResponseData.APISessionID, nil
}

func (c *NetcupClient) logout(apiSessionID string) error {
	reqBody := LogoutRequest{
		Action: "logout",
		Param: LogoutRequestParam{
			CustomerNumber: c.CustomerNumber,
			APIKey:         c.APIKey,
			APISessionID:   apiSessionID,
		},
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("failed to marshal logout request: %w", err)
	}

	resp, err := c.httpClient.Post(c.baseURL, "application/json", bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("failed to send logout request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return &NetcupError{Code: ErrLogoutFailed, Message: "logout request failed"}
	}

	var logoutResp LogoutResponse
	if err := json.NewDecoder(resp.Body).Decode(&logoutResp); err != nil {
		return fmt.Errorf("failed to decode logout response: %w", err)
	}

	if logoutResp.StatusCode != 2000 {
		return &NetcupError{Code: ErrLogoutFailed, Message: "logout failed"}
	}

	return nil
}

func (c *NetcupClient) infoDNSRecords(apiSessionID, domain string) ([]DNSRecord, error) {
	reqBody := InfoDNSRecordsRequest{
		Action: "infoDnsRecords",
		Param: InfoDNSRecordsRequestParam{
			DomainName:     domain,
			CustomerNumber: c.CustomerNumber,
			APIKey:         c.APIKey,
			APISessionID:   apiSessionID,
		},
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal info DNS request: %w", err)
	}

	resp, err := c.httpClient.Post(c.baseURL, "application/json", bytes.NewBuffer(body))
	if err != nil {
		return nil, fmt.Errorf("failed to send info DNS request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, &NetcupError{Code: ErrGetDnsRecords, Message: "info DNS request failed"}
	}

	var infoResp InfoDNSRecordsResponse
	if err := json.NewDecoder(resp.Body).Decode(&infoResp); err != nil {
		return nil, fmt.Errorf("failed to decode info DNS response: %w", err)
	}

	if infoResp.StatusCode != 2000 {
		return nil, &NetcupError{Code: ErrGetDnsRecords, Message: "get DNS records failed"}
	}

	return infoResp.ResponseData.DNSRecords, nil
}

func (c *NetcupClient) updateDNSRecord(apiSessionID, domain string, record DNSRecord) error {
	reqBody := UpdateDNSRecordRequest{
		Action: "updateDnsRecords",
		Param: UpdateDNSRecordRequestParam{
			DomainName:     domain,
			CustomerNumber: c.CustomerNumber,
			APIKey:         c.APIKey,
			APISessionID:   apiSessionID,
			DNSRecordSet: DNSRecordSet{
				DNSRecords: []DNSRecord{record},
			},
		},
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("failed to marshal update DNS request: %w", err)
	}

	resp, err := c.httpClient.Post(c.baseURL, "application/json", bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("failed to send update DNS request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return &NetcupError{Code: ErrUpdateDnsRecord, Message: "update DNS request failed"}
	}

	var updateResp UpdateDNSRecordResponse
	if err := json.NewDecoder(resp.Body).Decode(&updateResp); err != nil {
		return fmt.Errorf("failed to decode update DNS response: %w", err)
	}

	if updateResp.StatusCode != 2000 {
		return &NetcupError{Code: ErrUpdateDnsRecord, Message: "update DNS record failed"}
	}

	return nil
}

func (c *NetcupClient) UpdateDNS(newIP, domain string) error {
	apiSessionID, err := c.login()
	if err != nil {
		return err
	}
	defer c.logout(apiSessionID)

	records, err := c.infoDNSRecords(apiSessionID, domain)
	if err != nil {
		return err
	}

	record, err := findARecord(records, newIP)
	if err != nil {
		return err
	}

	if err := c.updateDNSRecord(apiSessionID, domain, record); err != nil {
		return err
	}

	return nil
}

func findARecord(records []DNSRecord, newIP string) (DNSRecord, error) {
	for i := range records {
		if records[i].Hostname == "@" && records[i].Type == "A" {
			records[i].Destination = newIP
			return records[i], nil
		}
	}
	return DNSRecord{}, &NetcupError{Code: ErrUpdateDnsRecord, Message: "DNS record not found"}
}

func IsNetcupError(err error) (*NetcupError, bool) {
	var netcupErr *NetcupError
	if errors.As(err, &netcupErr) {
		return netcupErr, true
	}
	return nil, false
}
