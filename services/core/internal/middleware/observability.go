// 请求观测中间件：透传/生成 X-Request-Id，并输出一行访问日志。
package middleware

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"time"

	"github.com/gin-gonic/gin"
)

func newTraceID() string {
	buf := make([]byte, 8)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}

func Observability() gin.HandlerFunc {
	return func(c *gin.Context) {
		traceID := c.GetHeader("X-Request-Id")
		if traceID == "" {
			traceID = newTraceID()
		}
		c.Set("traceId", traceID)
		c.Header("X-Request-Id", traceID)

		start := time.Now()
		c.Next()

		log.Printf("[access] %s %s %d %s traceId=%s",
			c.Request.Method, c.Request.URL.Path, c.Writer.Status(), time.Since(start).Round(time.Millisecond), traceID)
	}
}
