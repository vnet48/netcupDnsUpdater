package main

import (
	"strings"
	"testing"
)

func setRequiredEnv(t *testing.T) {
	t.Helper()
	t.Setenv("NETCUP_API_KEY", "test-key")
	t.Setenv("NETCUP_API_PASSWORD", "test-pass")
	t.Setenv("NETCUP_CUSTOMER_NUMBER", "123456")
}

func TestLoadConfig(t *testing.T) {
	t.Run("default values", func(t *testing.T) {
		setRequiredEnv(t)

		cfg, err := LoadConfig()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if cfg.Port != "3000" {
			t.Errorf("expected Port '3000', got '%s'", cfg.Port)
		}

		if cfg.Hostname != "0.0.0.0" {
			t.Errorf("expected Hostname '0.0.0.0', got '%s'", cfg.Hostname)
		}

		if cfg.AllowedIP != "" {
			t.Errorf("expected AllowedIP '', got '%s'", cfg.AllowedIP)
		}
	})

	t.Run("env overrides", func(t *testing.T) {
		setRequiredEnv(t)
		t.Setenv("PORT", "8080")
		t.Setenv("HOSTNAME", "127.0.0.1")
		t.Setenv("ALLOWED_IP", "192.168.1.1")

		cfg, err := LoadConfig()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if cfg.Port != "8080" {
			t.Errorf("expected Port '8080', got '%s'", cfg.Port)
		}

		if cfg.Hostname != "127.0.0.1" {
			t.Errorf("expected Hostname '127.0.0.1', got '%s'", cfg.Hostname)
		}

		if cfg.AllowedIP != "192.168.1.1" {
			t.Errorf("expected AllowedIP '192.168.1.1', got '%s'", cfg.AllowedIP)
		}

		if cfg.APIKey != "test-key" {
			t.Errorf("expected APIKey 'test-key', got '%s'", cfg.APIKey)
		}

		if cfg.APIPassword != "test-pass" {
			t.Errorf("expected APIPassword 'test-pass', got '%s'", cfg.APIPassword)
		}

		if cfg.CustomerNumber != "123456" {
			t.Errorf("expected CustomerNumber '123456', got '%s'", cfg.CustomerNumber)
		}
	})

	t.Run("error when all required vars missing", func(t *testing.T) {
		t.Setenv("NETCUP_API_KEY", "")
		t.Setenv("NETCUP_API_PASSWORD", "")
		t.Setenv("NETCUP_CUSTOMER_NUMBER", "")

		cfg, err := LoadConfig()

		if err == nil {
			t.Fatal("expected error, got nil")
		}

		if cfg != nil {
			t.Errorf("expected nil config, got %+v", cfg)
		}

		for _, want := range []string{"NETCUP_API_KEY", "NETCUP_API_PASSWORD", "NETCUP_CUSTOMER_NUMBER"} {
			if !strings.Contains(err.Error(), want) {
				t.Errorf("expected error to mention %q, got: %v", want, err)
			}
		}
	})

	t.Run("error mentions only missing vars", func(t *testing.T) {
		t.Setenv("NETCUP_API_KEY", "test-key")
		t.Setenv("NETCUP_API_PASSWORD", "test-pass")
		t.Setenv("NETCUP_CUSTOMER_NUMBER", "")

		_, err := LoadConfig()

		if err == nil {
			t.Fatal("expected error, got nil")
		}

		if !strings.Contains(err.Error(), "NETCUP_CUSTOMER_NUMBER") {
			t.Errorf("expected error to mention NETCUP_CUSTOMER_NUMBER, got: %v", err)
		}

		for _, absent := range []string{"NETCUP_API_KEY", "NETCUP_API_PASSWORD"} {
			if strings.Contains(err.Error(), absent) {
				t.Errorf("expected error not to mention %s, got: %v", absent, err)
			}
		}
	})
}

func TestGetEnv(t *testing.T) {
	t.Run("returns default when not set", func(t *testing.T) {
		result := getEnv("NON_EXISTENT_VAR_12345", "default-value")
		if result != "default-value" {
			t.Errorf("expected 'default-value', got '%s'", result)
		}
	})

	t.Run("returns value when set", func(t *testing.T) {
		t.Setenv("TEST_VAR", "test-value")
		result := getEnv("TEST_VAR", "default-value")
		if result != "test-value" {
			t.Errorf("expected 'test-value', got '%s'", result)
		}
	})
}
