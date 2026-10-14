package main

import (
	"testing"
)

func TestFindARecord(t *testing.T) {
	t.Run("finds A record with @ hostname", func(t *testing.T) {
		records := []DNSRecord{
			{ID: "1", Hostname: "www", Type: "A", Destination: "1.2.3.4"},
			{ID: "2", Hostname: "@", Type: "A", Destination: "5.6.7.8"},
			{ID: "3", Hostname: "mail", Type: "A", Destination: "9.10.11.12"},
		}

		newIP := "192.168.1.1"
		record, err := findARecord(records, newIP)

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if record.ID != "2" {
			t.Errorf("expected ID '2', got '%s'", record.ID)
		}

		if record.Destination != newIP {
			t.Errorf("expected Destination '%s', got '%s'", newIP, record.Destination)
		}
	})

	t.Run("returns error when no A record found", func(t *testing.T) {
		records := []DNSRecord{
			{ID: "1", Hostname: "www", Type: "CNAME", Destination: "example.com"},
			{ID: "2", Hostname: "mail", Type: "A", Destination: "5.6.7.8"},
		}

		_, err := findARecord(records, "192.168.1.1")

		if err == nil {
			t.Fatal("expected error, got nil")
		}

		netcupErr, ok := IsNetcupError(err)
		if !ok {
			t.Fatalf("expected NetcupError, got %T", err)
		}

		if netcupErr.Code != ErrUpdateDnsRecord {
			t.Errorf("expected code %d, got %d", ErrUpdateDnsRecord, netcupErr.Code)
		}
	})

	t.Run("returns error when no matching hostname", func(t *testing.T) {
		records := []DNSRecord{
			{ID: "1", Hostname: "www", Type: "A", Destination: "1.2.3.4"},
			{ID: "2", Hostname: "mail", Type: "A", Destination: "5.6.7.8"},
		}

		_, err := findARecord(records, "192.168.1.1")

		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestNetcupError(t *testing.T) {
	t.Run("Error returns message", func(t *testing.T) {
		err := &NetcupError{Code: ErrLoginFailed, Message: "login failed"}

		if err.Error() != "login failed" {
			t.Errorf("expected 'login failed', got '%s'", err.Error())
		}
	})

	t.Run("IsNetcupError returns true for NetcupError", func(t *testing.T) {
		err := &NetcupError{Code: ErrLoginFailed, Message: "login failed"}

		netcupErr, ok := IsNetcupError(err)

		if !ok {
			t.Error("expected true, got false")
		}

		if netcupErr.Code != ErrLoginFailed {
			t.Errorf("expected code %d, got %d", ErrLoginFailed, netcupErr.Code)
		}
	})

	t.Run("IsNetcupError returns false for other errors", func(t *testing.T) {
		err := &netcupErrorWrapper{msg: "wrapped error"}

		_, ok := IsNetcupError(err)

		if ok {
			t.Error("expected false, got true")
		}
	})
}

type netcupErrorWrapper struct {
	msg string
}

func (e *netcupErrorWrapper) Error() string {
	return e.msg
}
