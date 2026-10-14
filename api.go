package main

import (
	"log/slog"
	"net"
	"net/http"
)

type Handler struct {
	client    *NetcupClient
	allowedIP string
	logger    *slog.Logger
}

func NewHandler(client *NetcupClient, allowedIP string, logger *slog.Logger) *Handler {
	return &Handler{
		client:    client,
		allowedIP: allowedIP,
		logger:    logger,
	}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/health" {
		h.logger.Debug("health check")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Ok"))
		return
	}

	h.logger.Info("request received",
		"method", r.Method,
		"path", r.URL.Path,
		"remote_addr", getRemoteAddr(r),
	)

	if r.URL.Path != "/update" {
		h.logger.Warn("path not found", "path", r.URL.Path)
		http.NotFound(w, r)
		return
	}

	if r.Method != http.MethodGet {
		h.logger.Warn("method not allowed", "method", r.Method)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	clientIP := getRemoteAddr(r)
	if h.allowedIP != "" && clientIP != h.allowedIP {
		h.logger.Warn("IP not allowed", "ip", clientIP, "allowed_ip", h.allowedIP)
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	ip := r.URL.Query().Get("ip")
	domain := r.URL.Query().Get("domain")

	if ip == "" {
		h.logger.Error("missing IP parameter")
		http.Error(w, "Missing IP parameter", http.StatusBadRequest)
		return
	}

	if domain == "" {
		h.logger.Error("missing domain parameter")
		http.Error(w, "Missing domain parameter", http.StatusBadRequest)
		return
	}

	h.logger.Info("updating DNS",
		"domain", domain,
		"new_ip", ip,
	)

	if err := h.client.UpdateDNS(ip, domain); err != nil {
		h.logger.Error("failed to update DNS", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	h.logger.Info("DNS updated successfully", "domain", domain, "ip", ip)
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Ok"))
}

func getRemoteAddr(r *http.Request) string {
	addr, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return addr
}
