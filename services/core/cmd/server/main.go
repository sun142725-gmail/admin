// 服务入口：装配配置/数据库/内部客户端与路由，监听信号优雅停机。业务代码不写在这里。
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	"rbac-core/internal/aiclient"
	"rbac-core/internal/config"
	"rbac-core/internal/router"
	"rbac-core/internal/store"
)

func main() {
	cfg := config.Load()
	gin.SetMode(cfg.GinMode)

	db, err := store.Open(cfg)
	if err != nil {
		log.Fatalf("数据库连接失败: %v", err)
	}
	client := aiclient.New(cfg)

	engine := gin.New()
	router.Register(engine, cfg, router.Deps{DB: db, Client: client})

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           engine,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("core service listening on :%s (jwt auth: %v, db: %v, node: %s)",
			cfg.Port, cfg.JWTAccessSecret != "", db != nil, cfg.NodeBaseURL)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("listen: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("shutting down ...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("forced shutdown: %v", err)
	}
	log.Println("core service stopped")
}
