// 健康检查：/healthz 存活探针、/readyz 就绪探针。
package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func Ready(c *gin.Context) {
	// TODO: 接入 MySQL/Redis 等依赖后在此 ping，失败时返回 503
	c.JSON(http.StatusOK, gin.H{"status": "ready"})
}
