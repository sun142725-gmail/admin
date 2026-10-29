// 路由注册：公共探针 + 受保护业务分组；新增业务模块时在此挂子分组。
package router

import (
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"rbac-core/internal/aiclient"
	"rbac-core/internal/config"
	"rbac-core/internal/graphic"
	"rbac-core/internal/handler"
	"rbac-core/internal/middleware"
)

type Deps struct {
	DB     *gorm.DB
	Client *aiclient.Client
}

func Register(engine *gin.Engine, cfg config.Config, deps Deps) {
	engine.Use(gin.Recovery(), middleware.Observability())

	// 探针不鉴权（给 compose healthcheck / K8s 探针用）
	engine.GET("/healthz", handler.Health)
	engine.GET("/readyz", handler.Ready)

	v1 := engine.Group("/api/v1", middleware.JWTAuth(cfg.JWTAccessSecret))
	registerV1(v1)

	// 图文流水线：DB 与内部客户端就绪时装配（缺任一依赖时接口以 503 降级）
	if deps.DB != nil && deps.Client != nil {
		graphicSvc := graphic.NewService(deps.DB, deps.Client, cfg)
		registerGraphic(v1, handler.NewGraphicHandler(deps.DB, graphicSvc))
	}
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

func registerGraphic(v1 *gin.RouterGroup, h *handler.GraphicHandler) {
	graphicGroup := v1.Group("/graphic/stories")
	{
		graphicGroup.GET("", h.ListStories)
		graphicGroup.POST("", h.CreateStory)
		graphicGroup.GET("/:id", h.GetStory)
		graphicGroup.POST("/:id/run", h.RunStory)
		graphicGroup.POST("/:id/cancel", h.CancelStory)
		graphicGroup.GET("/:id/stream", h.StreamStory)
	}
}
