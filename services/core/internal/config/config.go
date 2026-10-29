// 配置：全部来自环境变量（12-Factor），新增配置项时集中在此加默认值。
package config

import "os"

type Config struct {
	Port            string // 监听端口，默认 8081
	JWTAccessSecret string // 与 Node 网关共用（HS256）；为空则跳过 JWT 鉴权（仅限开发/内网）
	GinMode         string // release / debug

	// 数据库（与 backend 共用同一 MySQL 实例；DB_HOST 为空则跳过连接，DB 型接口返回 503）
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string

	// Node 内部接口（/api/internal/ai/*），回调 AI 能力用
	NodeBaseURL     string // 默认 http://127.0.0.1:3000
	InternalToken   string // 与 backend 的 INTERNAL_API_TOKEN 一致
	ImageConcurrent int    // 生图并发上限，默认 3
	ChatTimeoutSec  int    // 单次 LLM 分幕超时秒数，默认 180
	ImageTimeoutSec int    // 单张生图/单次 TTS 超时秒数，默认 300
	UploadDir       string // 产物落盘根目录（Node 静态服务 backend/uploads），默认 ../../backend/uploads
	FFMPEGBin       string // ffmpeg 可执行文件，默认 PATH 中的 ffmpeg
	FFprobeBin      string // ffprobe 可执行文件，默认 PATH 中的 ffprobe
}

func Load() Config {
	return Config{
		Port:            getenv("PORT", "8081"),
		JWTAccessSecret: os.Getenv("JWT_ACCESS_SECRET"),
		GinMode:         getenv("GIN_MODE", "debug"),
		DBHost:          os.Getenv("DB_HOST"),
		DBPort:          getenv("DB_PORT", "3306"),
		DBUser:          os.Getenv("DB_USERNAME"),
		DBPassword:      os.Getenv("DB_PASSWORD"),
		DBName:          os.Getenv("DB_NAME"),
		NodeBaseURL:     getenv("NODE_BASE_URL", "http://127.0.0.1:3000"),
		InternalToken:   os.Getenv("INTERNAL_API_TOKEN"),
		ImageConcurrent: getenvInt("IMAGE_CONCURRENT", 3),
		ChatTimeoutSec:  getenvInt("CHAT_TIMEOUT_SEC", 180),
		ImageTimeoutSec: getenvInt("IMAGE_TIMEOUT_SEC", 300),
		UploadDir:       getenv("UPLOAD_DIR", "../../backend/uploads"),
		FFMPEGBin:       getenv("FFMPEG_BIN", "ffmpeg"),
		FFprobeBin:      getenv("FFPROBE_BIN", "ffprobe"),
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getenvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		n := 0
		for _, ch := range v {
			if ch < '0' || ch > '9' {
				return fallback
			}
			n = n*10 + int(ch-'0')
		}
		if n > 0 {
			return n
		}
	}
	return fallback
}
