// GORM 实体：图文故事与分幕场景。表结构与 TypeORM 命名对齐（snake_case，BaseEntity 同构）。
// 这两张表由 Go 侧负责写入；启动时 AutoMigrate 仅作用于自己的表，不碰 Node 的表。
package entity

import "time"

type GraphicStory struct {
	ID             uint       `gorm:"primaryKey;autoIncrement" json:"id"`
	Title          string     `gorm:"size:128" json:"title"`
	Mode           string     `gorm:"size:16;default:graphic" json:"mode"` // graphic=图文 | anime=动漫视频
	Continuity     bool       `gorm:"default:false" json:"continuity"`     // 首帧延续：上一幕成图作为下一幕参考图
	StyleCategory  string     `gorm:"column:style_category;size:64" json:"styleCategory"`
	PromptTemplate *int       `gorm:"column:prompt_template_id" json:"promptTemplateId,omitempty"`
	ModelID        *int       `gorm:"column:model_id" json:"modelId,omitempty"`
	SourceText     string     `gorm:"column:source_text;type:longtext" json:"sourceText"`
	Status         string     `gorm:"size:16;default:draft;index" json:"status"` // draft/running/succeeded/failed/cancelled
	Error          *string    `gorm:"type:text" json:"error,omitempty"`
	VideoURL       *string    `gorm:"column:video_url;size:500" json:"videoUrl,omitempty"` // anime 模式成片
	StartedAt      *time.Time `gorm:"column:started_at" json:"startedAt,omitempty"`
	FinishedAt     *time.Time `gorm:"column:finished_at" json:"finishedAt,omitempty"`
	DurationMs     *int       `gorm:"column:duration_ms" json:"durationMs,omitempty"`
	CreatedBy      *int       `gorm:"column:created_by" json:"createdBy,omitempty"`
	CreatedAt      time.Time  `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
	UpdatedAt      time.Time  `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
}

func (GraphicStory) TableName() string { return "graphic_stories" }

type GraphicScene struct {
	ID              uint       `gorm:"primaryKey;autoIncrement" json:"id"`
	StoryID         uint       `gorm:"column:story_id;index" json:"storyId"`
	Idx             int        `gorm:"column:idx" json:"idx"` // 幕序号，从 1 开始
	Name            string     `gorm:"size:128" json:"name"`
	Content         string     `gorm:"type:text" json:"content"`                         // 场景文本内容（兼作字幕与 TTS 文本）
	ScenePrompt     string     `gorm:"column:scene_prompt;type:text" json:"scenePrompt"` // 渲染后的生图 prompt
	ImageURL        *string    `gorm:"column:image_url;size:500" json:"imageUrl,omitempty"`
	AudioURL        *string    `gorm:"column:audio_url;size:500" json:"audioUrl,omitempty"` // TTS 音频
	AudioDurationMs *int       `gorm:"column:audio_duration_ms" json:"audioDurationMs,omitempty"`
	Status          string     `gorm:"size:16;default:pending;index" json:"status"` // pending/running/succeeded/failed/skipped
	Error           *string    `gorm:"type:text" json:"error,omitempty"`
	ModelID         *int       `gorm:"column:model_id" json:"modelId,omitempty"`
	DurationMs      *int       `gorm:"column:duration_ms" json:"durationMs,omitempty"`
	StartedAt       *time.Time `gorm:"column:started_at" json:"startedAt,omitempty"`
	FinishedAt      *time.Time `gorm:"column:finished_at" json:"finishedAt,omitempty"`
	CreatedAt       time.Time  `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
	UpdatedAt       time.Time  `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
}

func (GraphicScene) TableName() string { return "graphic_scenes" }
