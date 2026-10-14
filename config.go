package main

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	APIKey         string
	APIPassword    string
	CustomerNumber string
	Port           string
	Hostname       string
	AllowedIP      string
}

func LoadConfig() (*Config, error) {
	cfg := &Config{
		APIKey:         getEnv("NETCUP_API_KEY", ""),
		APIPassword:    getEnv("NETCUP_API_PASSWORD", ""),
		CustomerNumber: getEnv("NETCUP_CUSTOMER_NUMBER", ""),
		Port:           getEnv("PORT", "3000"),
		Hostname:       getEnv("HOSTNAME", "0.0.0.0"),
		AllowedIP:      getEnv("ALLOWED_IP", ""),
	}

	var missing []string
	if cfg.APIKey == "" {
		missing = append(missing, "NETCUP_API_KEY")
	}
	if cfg.APIPassword == "" {
		missing = append(missing, "NETCUP_API_PASSWORD")
	}
	if cfg.CustomerNumber == "" {
		missing = append(missing, "NETCUP_CUSTOMER_NUMBER")
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("missing required environment variables: %s", strings.Join(missing, ", "))
	}

	return cfg, nil
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}
