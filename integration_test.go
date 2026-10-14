package main

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"slices"
	"sync"
	"testing"
)

// mockNetcupAPI simulates the netcup webservice endpoint for integration tests.
type mockNetcupAPI struct {
	t      *testing.T
	server *httptest.Server

	mu      sync.Mutex
	actions []string

	// behaviour (netcup status codes, 2000 = success)
	loginStatus  int
	infoStatus   int
	updateStatus int
	logoutStatus int
	records      []DNSRecord
	sessionID    string

	// captured request payloads
	loginParam  LoginRequestParam
	updateParam UpdateDNSRecordRequestParam
	sessions    []string // apisessionid values seen in info/update/logout calls
}

func newMockNetcupAPI(t *testing.T) *mockNetcupAPI {
	m := &mockNetcupAPI{
		t:            t,
		loginStatus:  2000,
		infoStatus:   2000,
		updateStatus: 2000,
		logoutStatus: 2000,
		sessionID:    "test-session-123",
	}
	m.server = httptest.NewServer(http.HandlerFunc(m.handle))
	t.Cleanup(m.server.Close)
	return m
}

func (m *mockNetcupAPI) client(t *testing.T) *NetcupClient {
	t.Helper()
	return NewNetcupClientWithBaseURL(m.server.URL, "test-key", "test-pass", "123456")
}

func (m *mockNetcupAPI) handle(w http.ResponseWriter, r *http.Request) {
	var env struct {
		Action string          `json:"action"`
		Param  json.RawMessage `json:"param"`
	}
	if err := json.NewDecoder(r.Body).Decode(&env); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	m.mu.Lock()
	m.actions = append(m.actions, env.Action)
	m.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")

	switch env.Action {
	case "login":
		var p LoginRequestParam
		if err := json.Unmarshal(env.Param, &p); err != nil {
			m.t.Errorf("failed to decode login param: %v", err)
		}
		m.mu.Lock()
		m.loginParam = p
		m.mu.Unlock()

		if m.loginStatus != 2000 {
			writeNetcupJSON(w, m.loginStatus, LoginResponseData{})
			return
		}
		writeNetcupJSON(w, 2000, LoginResponseData{APISessionID: m.sessionID})

	case "logout":
		var p LogoutRequestParam
		if err := json.Unmarshal(env.Param, &p); err != nil {
			m.t.Errorf("failed to decode logout param: %v", err)
		}
		m.mu.Lock()
		m.sessions = append(m.sessions, p.APISessionID)
		m.mu.Unlock()
		writeNetcupJSON(w, m.logoutStatus, "Logout successfully.")

	case "infoDnsRecords":
		var p InfoDNSRecordsRequestParam
		if err := json.Unmarshal(env.Param, &p); err != nil {
			m.t.Errorf("failed to decode infoDnsRecords param: %v", err)
		}
		m.mu.Lock()
		m.sessions = append(m.sessions, p.APISessionID)
		m.mu.Unlock()
		writeNetcupJSON(w, m.infoStatus, InfoDNSRecordsResponseData{DNSRecords: m.records})

	case "updateDnsRecords":
		var p UpdateDNSRecordRequestParam
		if err := json.Unmarshal(env.Param, &p); err != nil {
			m.t.Errorf("failed to decode updateDnsRecords param: %v", err)
		}
		m.mu.Lock()
		m.updateParam = p
		m.sessions = append(m.sessions, p.APISessionID)
		m.mu.Unlock()
		writeNetcupJSON(w, m.updateStatus, UpdateDNSRecordResponseData{})

	default:
		m.t.Errorf("unexpected action: %q", env.Action)
		writeNetcupJSON(w, 4000, struct{}{})
	}
}

func writeNetcupJSON(w http.ResponseWriter, statuscode int, responseData any) {
	status := "ok"
	if statuscode != 2000 {
		status = "error"
	}
	_ = json.NewEncoder(w).Encode(map[string]any{
		"serverrequestid": "mock-server-request-id",
		"clientrequestid": "mock-client-request-id",
		"action":          "",
		"status":          status,
		"statuscode":      statuscode,
		"shortmessage":    "mock",
		"longmessage":     "mock",
		"responsedata":    responseData,
	})
}

func (m *mockNetcupAPI) wantActions(t *testing.T, want ...string) {
	t.Helper()
	m.mu.Lock()
	defer m.mu.Unlock()
	if !slices.Equal(m.actions, want) {
		t.Errorf("expected actions %v, got %v", want, m.actions)
	}
}

func sampleRecords() []DNSRecord {
	return []DNSRecord{
		{ID: "1", Hostname: "www", Type: "A", Destination: "1.2.3.4"},
		{ID: "2", Hostname: "@", Type: "A", Destination: "5.6.7.8"},
	}
}

func TestIntegration_UpdateDNS_Success(t *testing.T) {
	m := newMockNetcupAPI(t)
	m.records = sampleRecords()

	client := m.client(t)
	if err := client.UpdateDNS("9.8.7.6", "example.com"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m.wantActions(t, "login", "infoDnsRecords", "updateDnsRecords", "logout")

	if m.loginParam.APIKey != "test-key" || m.loginParam.APIPassword != "test-pass" || m.loginParam.CustomerNumber != "123456" {
		t.Errorf("unexpected login credentials: %+v", m.loginParam)
	}

	if m.updateParam.DomainName != "example.com" {
		t.Errorf("expected domain 'example.com', got '%s'", m.updateParam.DomainName)
	}

	records := m.updateParam.DNSRecordSet.DNSRecords
	if len(records) != 1 {
		t.Fatalf("expected 1 record in update, got %d", len(records))
	}
	if records[0].ID != "2" || records[0].Hostname != "@" || records[0].Type != "A" {
		t.Errorf("expected the @ A-record (ID 2) to be updated, got %+v", records[0])
	}
	if records[0].Destination != "9.8.7.6" {
		t.Errorf("expected destination '9.8.7.6', got '%s'", records[0].Destination)
	}

	for i, session := range m.sessions {
		if session != m.sessionID {
			t.Errorf("call %d used session %q, expected %q", i, session, m.sessionID)
		}
	}
}

func TestIntegration_UpdateDNS_LoginFails(t *testing.T) {
	m := newMockNetcupAPI(t)
	m.loginStatus = 4000

	client := m.client(t)
	err := client.UpdateDNS("9.8.7.6", "example.com")

	if err == nil {
		t.Fatal("expected error, got nil")
	}

	netcupErr, ok := IsNetcupError(err)
	if !ok || netcupErr.Code != ErrLoginFailed {
		t.Errorf("expected ErrLoginFailed, got %v (%v)", netcupErr, err)
	}

	// without a session nothing else may be called, not even logout
	m.wantActions(t, "login")
}

func TestIntegration_UpdateDNS_NoARecord(t *testing.T) {
	m := newMockNetcupAPI(t)
	m.records = []DNSRecord{
		{ID: "1", Hostname: "www", Type: "A", Destination: "1.2.3.4"},
	}

	client := m.client(t)
	err := client.UpdateDNS("9.8.7.6", "example.com")

	if err == nil {
		t.Fatal("expected error, got nil")
	}

	netcupErr, ok := IsNetcupError(err)
	if !ok || netcupErr.Code != ErrUpdateDnsRecord {
		t.Errorf("expected ErrUpdateDnsRecord, got %v (%v)", netcupErr, err)
	}

	// no update, but session must still be closed
	m.wantActions(t, "login", "infoDnsRecords", "logout")
}

func TestIntegration_UpdateDNS_UpdateFails(t *testing.T) {
	m := newMockNetcupAPI(t)
	m.records = sampleRecords()
	m.updateStatus = 5000

	client := m.client(t)
	err := client.UpdateDNS("9.8.7.6", "example.com")

	if err == nil {
		t.Fatal("expected error, got nil")
	}

	netcupErr, ok := IsNetcupError(err)
	if !ok || netcupErr.Code != ErrUpdateDnsRecord {
		t.Errorf("expected ErrUpdateDnsRecord, got %v (%v)", netcupErr, err)
	}

	// logout must still be called via defer
	m.wantActions(t, "login", "infoDnsRecords", "updateDnsRecords", "logout")
}

func TestIntegration_Handler_UpdateSuccess(t *testing.T) {
	m := newMockNetcupAPI(t)
	m.records = sampleRecords()

	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelError}))
	handler := NewHandler(m.client(t), "192.168.1.1", logger)

	req := httptest.NewRequest(http.MethodGet, "/update?ip=9.8.7.6&domain=example.com", nil)
	req.RemoteAddr = "192.168.1.1:55555"
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected %d, got %d (body: %s)", http.StatusOK, rec.Code, rec.Body.String())
	}
	if rec.Body.String() != "Ok" {
		t.Errorf("expected body 'Ok', got '%s'", rec.Body.String())
	}

	m.wantActions(t, "login", "infoDnsRecords", "updateDnsRecords", "logout")
}

func TestIntegration_Handler_UpdateFailure(t *testing.T) {
	m := newMockNetcupAPI(t)
	m.loginStatus = 4000

	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelError}))
	handler := NewHandler(m.client(t), "192.168.1.1", logger)

	req := httptest.NewRequest(http.MethodGet, "/update?ip=9.8.7.6&domain=example.com", nil)
	req.RemoteAddr = "192.168.1.1:55555"
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("expected %d, got %d", http.StatusInternalServerError, rec.Code)
	}
}
