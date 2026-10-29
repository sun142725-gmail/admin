// 数据库连接：与 backend 共用 MySQL；DB_HOST 未配置时返回 nil（DB 型接口降级为 503）。
package store

import (
	"fmt"
	"log"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"rbac-core/internal/config"
	"rbac-core/internal/entity"
)

// Open 打开数据库；host 未配置返回 (nil, nil) 表示开发模式无 DB。
func Open(cfg config.Config) (*gorm.DB, error) {
	if cfg.DBHost == "" {
		log.Println("DB_HOST 未配置，DB 型接口将以 503 降级（开发模式）")
		return nil, nil
	}
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		cfg.DBUser, cfg.DBPassword, cfg.DBHost, cfg.DBPort, cfg.DBName)
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, err
	}
	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(20)
	sqlDB.SetMaxIdleConns(5)
	sqlDB.SetConnMaxLifetime(time.Hour)

	// 只迁移 Go 侧自有的表；Node 的表（含 prompt_templates）由 TypeORM synchronize 维护。
	if err := db.AutoMigrate(&entity.GraphicStory{}, &entity.GraphicScene{}); err != nil {
		return nil, fmt.Errorf("AutoMigrate: %w", err)
	}
	log.Println("数据库连接成功，graphic 表已就绪")
	return db, nil
}
