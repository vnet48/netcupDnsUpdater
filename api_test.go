package main

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestGetRemoteAddr(t *testing.T) {
	t.Run("returns IP from RemoteAddr", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "192.168.1.50:12345"

		addr := getRemoteAddr(req)

		if addr != "192.168.1.50" {
			t.Errorf("expected '192.168.1.50', got '%s'", addr)
		}
	})

	t.Run("ignores proxy headers", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("X-Forwarded-For", "10.0.0.1")
		req.Header.Set("X-Forwarded-Proto", "https")
		req.RemoteAddr = "192.168.1.50:12345"

		addr := getRemoteAddr(req)

		if addr != "192.168.1.50" {
			t.Errorf("expected '192.168.1.50', got '%s'", addr)
		}
	})

	t.Run("returns RemoteAddr unchanged when no port present", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "no-port"

		addr := getRemoteAddr(req)

		if addr != "no-port" {
			t.Errorf("expected 'no-port', got '%s'", addr)
		}
	})
}

func TestHandler_ServeHTTP(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelError}))
	client := &NetcupClient{}
	handler := NewHandler(client, "192.168.1.1", logger)

	t.Run("returns 200 for /health without IP check", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		req.RemoteAddr = "10.0.0.1:12345" // not the allowed IP
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("expected %d, got %d", http.StatusOK, rec.Code)
		}

		if !strings.Contains(rec.Body.String(), "Ok") {
			t.Errorf("expected 'Ok' in body, got '%s'", rec.Body.String())
		}
	})

	t.Run("returns 404 for unknown path", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/unknown", nil)
		req.RemoteAddr = "192.168.1.1:12345"
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Errorf("expected %d, got %d", http.StatusNotFound, rec.Code)
		}
	})

	t.Run("returns 405 for non-GET method", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/update", nil)
		req.RemoteAddr = "192.168.1.1:12345"
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("expected %d, got %d", http.StatusMethodNotAllowed, rec.Code)
		}
	})

	t.Run("returns 403 for disallowed IP", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/update?ip=1.2.3.4&domain=example.com", nil)
		req.RemoteAddr = "10.0.0.1:12345"
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Errorf("expected %d, got %d", http.StatusForbidden, rec.Code)
		}
	})

	t.Run("returns 400 for missing IP", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/update?domain=example.com", nil)
		req.RemoteAddr = "192.168.1.1:12345"
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected %d, got %d", http.StatusBadRequest, rec.Code)
		}

		if !strings.Contains(rec.Body.String(), "Missing IP") {
			t.Errorf("expected 'Missing IP' in body, got '%s'", rec.Body.String())
		}
	})

	t.Run("returns 400 for missing domain", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/update?ip=1.2.3.4", nil)
		req.RemoteAddr = "192.168.1.1:12345"
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected %d, got %d", http.StatusBadRequest, rec.Code)
		}

		if !strings.Contains(rec.Body.String(), "Missing domain") {
			t.Errorf("expected 'Missing domain' in body, got '%s'", rec.Body.String())
		}
	})
}
