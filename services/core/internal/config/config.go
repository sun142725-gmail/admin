// 配置：全部来自环境变量（12-Factor），新增配置项时集中在此加默认值。
package config

import "os"

type Config struct {
	Port            string // 监听端口，默认 8081
	JWTAccessSecret string // 与 Node 网关共用（HS256）；为空则跳过 JWT 鉴权（仅限开发/内网）
	GinMode         string // release / debug
}

func Load() Config {
	return Config{
		Port:            getenv("PORT", "8081"),
		JWTAccessSecret: os.Getenv("JWT_ACCESS_SECRET"),
		GinMode:         getenv("GIN_MODE", "debug"),
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
