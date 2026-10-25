// 路由注册：公共探针 + 受保护业务分组；新增业务模块时在 registerV1 里挂子分组。
package router

import (
	"github.com/gin-gonic/gin"

	"rbac-core/internal/config"
	"rbac-core/internal/handler"
	"rbac-core/internal/middleware"
)

func Register(engine *gin.Engine, cfg config.Config) {
	engine.Use(gin.Recovery(), middleware.Observability())

	// 探针不鉴权（给 compose healthcheck / K8s 探针用）
	engine.GET("/healthz", handler.Health)
	engine.GET("/readyz", handler.Ready)

	v1 := engine.Group("/api/v1", middleware.JWTAuth(cfg.JWTAccessSecret))
	registerV1(v1)
}

func registerV1(v1 *gin.RouterGroup) {
	examples := v1.Group("/examples")
	{
		examples.GET("", handler.ListExamples)
		examples.GET("/:id", handler.GetExample)
		examples.POST("", handler.CreateExample)
		examples.GET("/:id/stream", handler.StreamExample)
	}
}
