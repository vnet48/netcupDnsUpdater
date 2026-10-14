package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))
	slog.SetDefault(logger)

	cfg, err := LoadConfig()
	if err != nil {
		logger.Error("failed to load configuration", "error", err)
		os.Exit(1)
	}

	logger.Info("configuration loaded",
		"port", cfg.Port,
		"hostname", cfg.Hostname,
		"allowed_ip", cfg.AllowedIP,
	)

	client := NewNetcupClient(cfg.APIKey, cfg.APIPassword, cfg.CustomerNumber)

	handler := NewHandler(client, cfg.AllowedIP, logger)

	addr := cfg.Hostname + ":" + cfg.Port
	server := &http.Server{
		Addr:    addr,
		Handler: handler,
	}

	go func() {
		logger.Info("starting server", "addr", addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Error("server shutdown error", "error", err)
		os.Exit(1)
	}

	logger.Info("server stopped")
}
