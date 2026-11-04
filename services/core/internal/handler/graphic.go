// 图文流水线控制器：故事 CRUD + 触发生成/取消 + SSE 进度（照 example.go 的标准写法）。
package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"rbac-core/internal/entity"
	"rbac-core/internal/graphic"
	"rbac-core/pkg/response"
)

type GraphicHandler struct {
	db  *gorm.DB
	svc *graphic.Service
}

func NewGraphicHandler(db *gorm.DB, svc *graphic.Service) *GraphicHandler {
	return &GraphicHandler{db: db, svc: svc}
}

type createStoryInput struct {
	Title            string `json:"title" binding:"required"`
	StyleCategory    string `json:"styleCategory" binding:"required"`
	SourceText       string `json:"sourceText" binding:"required"`
	Mode             string `json:"mode"`       // graphic（默认）| anime
	Continuity       *bool  `json:"continuity"` // 首帧延续（anime 下默认 true）
	PromptTemplateID *int   `json:"promptTemplateId"`
	ModelID          *int   `json:"modelId"`
	// Scenes 可选：不传则由 LLM 自动分幕；传入则跳过分幕直接生图（便于调试与前端手动编排）。
	Scenes []struct {
		Name    string `json:"name"`
		Content string `json:"content" binding:"required"`
	} `json:"scenes"`
}

// CreateStory POST /api/v1/graphic/stories
func (h *GraphicHandler) CreateStory(c *gin.Context) {
	if h.db == nil {
		response.Fail(c, 503, "数据库未连接（未配置 DB_HOST）", http.StatusServiceUnavailable)
		return
	}
	var input createStoryInput
	if err := c.ShouldBindJSON(&input); err != nil {
		response.Fail(c, 400, "参数错误: "+err.Error(), http.StatusBadRequest)
		return
	}
	mode := input.Mode
	if mode == "" {
		mode = "graphic"
	}
	if mode != "graphic" && mode != "anime" {
		response.Fail(c, 400, "mode 仅支持 graphic / anime", http.StatusBadRequest)
		return
	}
	continuity := false
	if input.Continuity != nil {
		continuity = *input.Continuity
	} else if mode == "anime" {
		continuity = true // 动漫模式默认开启首帧延续
	}
	story := entity.GraphicStory{
		Title:          input.Title,
		Mode:           mode,
		Continuity:     continuity,
		StyleCategory:  input.StyleCategory,
		PromptTemplate: input.PromptTemplateID,
		ModelID:        input.ModelID,
		SourceText:     input.SourceText,
		Status:         "draft",
		CreatedBy:      intPtr(c),
	}
	if err := h.db.Create(&story).Error; err != nil {
		response.Fail(c, 500, "创建失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if len(input.Scenes) > 0 {
		var scenes []entity.GraphicScene
		for i, s := range input.Scenes {
			scenes = append(scenes, entity.GraphicScene{
				StoryID: story.ID, Idx: i + 1, Name: s.Name, Content: s.Content, Status: "pending",
			})
		}
		h.db.Create(&scenes)
	}
	response.Ok(c, story)
}

// ListStories GET /api/v1/graphic/stories?status=&take=
func (h *GraphicHandler) ListStories(c *gin.Context) {
	if h.db == nil {
		response.Fail(c, 503, "数据库未连接（未配置 DB_HOST）", http.StatusServiceUnavailable)
		return
	}
	take := 50
	if v, err := strconv.Atoi(c.Query("take")); err == nil && v > 0 && v <= 200 {
		take = v
	}
	q := h.db.Model(&entity.GraphicStory{}).Order("id DESC").Limit(take)
	if s := c.Query("status"); s != "" {
		q = q.Where("status = ?", s)
	}
	var stories []entity.GraphicStory
	q.Find(&stories)
	response.Ok(c, stories)
}

// GetStory GET /api/v1/graphic/stories/:id —— 含分幕明细
func (h *GraphicHandler) GetStory(c *gin.Context) {
	if h.db == nil {
		response.Fail(c, 503, "数据库未连接（未配置 DB_HOST）", http.StatusServiceUnavailable)
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.Fail(c, 400, "id 必须是数字", http.StatusBadRequest)
		return
	}
	var story entity.GraphicStory
	if err := h.db.First(&story, id).Error; err != nil {
		response.Fail(c, 404, "故事不存在", http.StatusNotFound)
		return
	}
	var scenes []entity.GraphicScene
	h.db.Where("story_id = ?", id).Order("idx ASC").Find(&scenes)
	response.Ok(c, gin.H{"story": story, "scenes": scenes})
}

// RunStory POST /api/v1/graphic/stories/:id/run —— 触发流水线（fire-and-forget），进度走 SSE
func (h *GraphicHandler) RunStory(c *gin.Context) {
	if h.svc == nil {
		response.Fail(c, 503, "流水线未就绪", http.StatusServiceUnavailable)
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.Fail(c, 400, "id 必须是数字", http.StatusBadRequest)
		return
	}
	go h.svc.Run(uint(id), userIDFrom(c))
	response.Ok(c, gin.H{"storyId": id, "accepted": true})
}

// CancelStory POST /api/v1/graphic/stories/:id/cancel
func (h *GraphicHandler) CancelStory(c *gin.Context) {
	if h.svc == nil {
		response.Fail(c, 503, "流水线未就绪", http.StatusServiceUnavailable)
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.Fail(c, 400, "id 必须是数字", http.StatusBadRequest)
		return
	}
	if !h.svc.IsActive(uint(id)) {
		response.Fail(c, 400, "该故事当前未在执行", http.StatusBadRequest)
		return
	}
	h.svc.RequestCancel(uint(id))
	response.Ok(c, gin.H{"storyId": id, "cancelRequested": true})
}

// StreamStory GET /api/v1/graphic/stories/:id/stream —— SSE 进度流：
// init 事件带全量快照（断线重连可用），后续为增量 story/scene 事件，终态后结束流。
func (h *GraphicHandler) StreamStory(c *gin.Context) {
	if h.db == nil || h.svc == nil {
		response.Fail(c, 503, "流水线未就绪", http.StatusServiceUnavailable)
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.Fail(c, 400, "id 必须是数字", http.StatusBadRequest)
		return
	}
	storyID := uint(id)

	var story entity.GraphicStory
	if err := h.db.First(&story, storyID).Error; err != nil {
		response.Fail(c, 404, "故事不存在", http.StatusNotFound)
		return
	}
	var scenes []entity.GraphicScene
	h.db.Where("story_id = ?", storyID).Order("idx ASC").Find(&scenes)

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)

	initData, _ := json.Marshal(gin.H{"story": story, "scenes": scenes})
	fmt.Fprintf(c.Writer, "event: init\ndata: %s\n\n", initData)
	c.Writer.Flush()

	terminal := story.Status == "succeeded" || story.Status == "failed" || story.Status == "cancelled"
	if terminal {
		fmt.Fprint(c.Writer, "data: [DONE]\n\n")
		c.Writer.Flush()
		return
	}

	events := h.svc.Hub().Subscribe(storyID)
	timeout := time.After(30 * time.Minute) // 兜底：超长运行防悬挂连接
	for {
		select {
		case ev, ok := <-events:
			if !ok {
				fmt.Fprint(c.Writer, "data: [DONE]\n\n")
				c.Writer.Flush()
				return
			}
			payload, _ := json.Marshal(ev)
			fmt.Fprintf(c.Writer, "event: %s\ndata: %s\n\n", ev.Type, payload)
			c.Writer.Flush()
		case <-timeout:
			fmt.Fprint(c.Writer, "data: [DONE]\n\n")
			c.Writer.Flush()
			return
		case <-c.Request.Context().Done():
			return
		}
	}
}

// DeleteStory DELETE /api/v1/graphic/stories/:id —— 删除故事与全部分幕。
// 产物文件保留在 uploads/graphic/ 下不随删（与 novel-pipeline 一致，避免误删被其它记录引用的静态资源，
// 由运维按目录定期清理）；执行中的故事拒绝删除，避免后台 goroutine 写回已删记录。
func (h *GraphicHandler) DeleteStory(c *gin.Context) {
	if h.db == nil {
		response.Fail(c, 503, "数据库未连接（未配置 DB_HOST）", http.StatusServiceUnavailable)
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.Fail(c, 400, "id 必须是数字", http.StatusBadRequest)
		return
	}
	if h.svc != nil && h.svc.IsActive(uint(id)) {
		response.Fail(c, 409, graphic.ErrStoryBusy.Error(), http.StatusConflict)
		return
	}
	var story entity.GraphicStory
	if err := h.db.First(&story, id).Error; err != nil {
		response.Fail(c, 404, "故事不存在", http.StatusNotFound)
		return
	}
	tx := h.db.Begin()
	if tx.Error != nil {
		response.Fail(c, 500, "开启事务失败: "+tx.Error.Error(), http.StatusInternalServerError)
		return
	}
	if err := tx.Where("story_id = ?", id).Delete(&entity.GraphicScene{}).Error; err != nil {
		tx.Rollback()
		response.Fail(c, 500, "删除分幕失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if err := tx.Delete(&entity.GraphicStory{}, id).Error; err != nil {
		tx.Rollback()
		response.Fail(c, 500, "删除故事失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if err := tx.Commit().Error; err != nil {
		response.Fail(c, 500, "提交事务失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	response.Ok(c, gin.H{"storyId": id, "deleted": true})
}

// RegenerateScene POST /api/v1/graphic/stories/:id/scenes/:sceneId/regenerate
// 把指定分幕退回 pending 后触发整条流水线；runInternal 会复用其它 succeeded 幕，只重跑这一幕
// （anime 模式会顺带重做该幕 TTS 与最终成片）。同一事务内完成状态回退，避免前端看到半更新态。
func (h *GraphicHandler) RegenerateScene(c *gin.Context) {
	if h.db == nil || h.svc == nil {
		response.Fail(c, 503, "流水线未就绪", http.StatusServiceUnavailable)
		return
	}
	storyID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.Fail(c, 400, "id 必须是数字", http.StatusBadRequest)
		return
	}
	sceneID, err := strconv.ParseUint(c.Param("sceneId"), 10, 64)
	if err != nil {
		response.Fail(c, 400, "sceneId 必须是数字", http.StatusBadRequest)
		return
	}
	if err := graphic.CanMutateStory(h.svc.IsActive(uint(storyID))); err != nil {
		response.Fail(c, 409, err.Error(), http.StatusConflict)
		return
	}
	var story entity.GraphicStory
	if err := h.db.First(&story, storyID).Error; err != nil {
		response.Fail(c, 404, "故事不存在", http.StatusNotFound)
		return
	}
	var scene entity.GraphicScene
	if err := h.db.Where("id = ? AND story_id = ?", sceneID, storyID).First(&scene).Error; err != nil {
		response.Fail(c, 404, "分幕不存在或不属于该故事", http.StatusNotFound)
		return
	}
	updates, err := graphic.SceneRegenUpdates(scene.Status)
	if err != nil {
		response.Fail(c, 409, err.Error(), http.StatusConflict)
		return
	}
	tx := h.db.Begin()
	if tx.Error != nil {
		response.Fail(c, 500, "开启事务失败: "+tx.Error.Error(), http.StatusInternalServerError)
		return
	}
	if err := tx.Model(&entity.GraphicScene{}).Where("id = ?", sceneID).Updates(updates).Error; err != nil {
		tx.Rollback()
		response.Fail(c, 500, "重置分幕失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if err := tx.Model(&entity.GraphicStory{}).Where("id = ?", storyID).Updates(graphic.StoryRegenUpdates()).Error; err != nil {
		tx.Rollback()
		response.Fail(c, 500, "重置故事失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if err := tx.Commit().Error; err != nil {
		response.Fail(c, 500, "提交事务失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	go h.svc.Run(uint(storyID), userIDFrom(c))
	response.Ok(c, gin.H{"storyId": storyID, "sceneId": sceneID, "accepted": true})
}

// ---------- 小工具 ----------

func userIDFrom(c *gin.Context) int {
	if v, ok := c.Get("userId"); ok {
		switch n := v.(type) {
		case float64:
			return int(n)
		case int:
			return n
		case string:
			if i, err := strconv.Atoi(n); err == nil {
				return i
			}
		}
	}
	return 0 // 开发模式（未鉴权）时用量记录归属 0
}

func intPtr(c *gin.Context) *int {
	if v, ok := c.Get("userId"); ok {
		if n, ok := v.(float64); ok {
			i := int(n)
			return &i
		}
	}
	return nil
}
