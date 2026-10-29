// 图文流水线服务：原文 →（LLM 分幕）→ 提示词模板渲染 → 并发生图 → 落库 + SSE 进度。
// 断点重跑：已成功分幕的图片复用，仅重跑 pending/failed 的分幕。
// 生图与分幕都经 aiclient 回调 Node（/internal/ai/*），模型由 AI 模块统一管理。
package graphic

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"

	"rbac-core/internal/aiclient"
	"rbac-core/internal/config"
	"rbac-core/internal/entity"
)

type Service struct {
	db     *gorm.DB
	client *aiclient.Client
	cfg    config.Config
	hub    *Hub

	active    sync.Map // storyID -> struct{}（正在执行）
	cancelReq sync.Map // storyID -> struct{}（请求取消）
}

func NewService(db *gorm.DB, client *aiclient.Client, cfg config.Config) *Service {
	return &Service{db: db, client: client, cfg: cfg, hub: NewHub()}
}

func (s *Service) Hub() *Hub { return s.hub }

// IsActive 流水线是否正在推进该故事。
func (s *Service) IsActive(storyID uint) bool {
	return s.isActive(storyID)
}

func (s *Service) isActive(storyID uint) bool {
	_, ok := s.active.Load(storyID)
	return ok
}

// RequestCancel 请求取消：当前分幕完成后生效，未开始的分幕不再执行。
func (s *Service) RequestCancel(storyID uint) {
	s.cancelReq.Store(storyID, struct{}{})
}

func (s *Service) isCancelled(storyID uint) bool {
	_, ok := s.cancelReq.Load(storyID)
	return ok
}

// ---------- 分幕 ----------

type sceneDraft struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

var jsonBlockRe = regexp.MustCompile("(?s)```(?:json)?\\s*(.*?)```")

// extractJSON 提取 LLM 回复中的 JSON 块（容忍 ```json 围栏与前后说明文字）。
func extractJSON(text string) []byte {
	if m := jsonBlockRe.FindStringSubmatch(text); m != nil {
		text = m[1]
	}
	start := strings.Index(text, "[")
	end := strings.LastIndex(text, "]")
	if start < 0 || end <= start {
		return nil
	}
	return []byte(text[start : end+1])
}

const segmentSystemPrompt = "你是图文故事分幕师。把用户给的原文拆成 3-8 幕，每幕是一个独立画面。只输出 JSON 数组，格式：[{\"name\":\"幕名\",\"content\":\"这一幕画面的文字描述，含场景/人物/氛围细节\"}]，不要输出其他内容。"

// segment 调用 LLM 把原文拆成分幕。
func (s *Service) segment(ctx context.Context, userID int, sourceText string, modelID *int) ([]sceneDraft, error) {
	messages := []aiclient.Message{
		{Role: "system", Content: segmentSystemPrompt},
		{Role: "user", Content: sourceText},
	}
	result, err := s.client.Chat(userID, messages, 0.7, modelID, time.Duration(s.cfg.ChatTimeoutSec)*time.Second)
	if err != nil {
		return nil, fmt.Errorf("分幕失败: %w", err)
	}
	raw := extractJSON(result.Text)
	if raw == nil {
		return nil, fmt.Errorf("分幕输出不是合法的 JSON 数组")
	}
	var drafts []sceneDraft
	if err := json.Unmarshal(raw, &drafts); err != nil || len(drafts) == 0 {
		return nil, fmt.Errorf("分幕 JSON 解析失败")
	}
	if len(drafts) > 12 {
		drafts = drafts[:12]
	}
	return drafts, nil
}

// ---------- 提示词渲染 ----------

// 风格兜底提示：未指定模板时按分类追加风格指引（提示词库是推荐项，不是必需项）。
var categoryHints = map[string]string{
	"illustrated": "水彩手绘插画风格，线条柔和，色调温暖",
	"poster":      "平面海报设计风格，构图大胆，主体突出",
	"anime":       "日系动漫风格，赛璐璐上色，清晰线条",
	"ui":          "现代 UI 界面设计风格，干净简洁",
	"general":     "高质量数字插画，细节丰富",
}

// renderPrompt 把场景内容渲染进模板（{{content}} 占位），无模板时用分类兜底。
func renderPrompt(template, categoryHint, content string) string {
	if template == "" {
		return fmt.Sprintf("为以下文字内容生成一张插画：%s。风格要求：%s。", content, categoryHint)
	}
	return strings.ReplaceAll(template, "{{content}}", content)
}

// ---------- 执行 ----------

// Run 完整执行（fire-and-forget，内部全量捕获异常落库）。
func (s *Service) Run(storyID uint, userID int) {
	if s.isActive(storyID) {
		return
	}
	s.active.Store(storyID, struct{}{})
	defer func() {
		s.active.Delete(storyID)
		s.cancelReq.Delete(storyID)
	}()

	if err := s.runInternal(storyID, userID); err != nil {
		log.Printf("故事 %d 流水线异常: %v", storyID, err)
		s.finalize(storyID, "failed", err.Error())
	}
}

func (s *Service) runInternal(storyID uint, userID int) error {
	var story entity.GraphicStory
	if err := s.db.First(&story, storyID).Error; err != nil {
		return fmt.Errorf("故事不存在")
	}
	if story.Status == "cancelled" {
		return nil
	}

	// 标记运行中
	now := time.Now()
	s.db.Model(&story).Updates(map[string]interface{}{
		"status": "running", "error": nil, "started_at": now, "finished_at": nil, "duration_ms": nil,
	})
	s.hub.Publish(Event{Type: "story", StoryID: storyID, Data: map[string]interface{}{"status": "running"}})

	// 已有分幕：断点重跑复用 succeeded；没有分幕则 LLM 分幕
	var scenes []entity.GraphicScene
	if err := s.db.Where("story_id = ?", storyID).Order("idx ASC").Find(&scenes).Error; err != nil {
		return err
	}
	if len(scenes) == 0 {
		drafts, err := s.segment(context.Background(), userID, story.SourceText, story.ModelID)
		if err != nil {
			return err
		}
		for i, d := range drafts {
			scenes = append(scenes, entity.GraphicScene{
				StoryID: storyID, Idx: i + 1, Name: d.Name, Content: d.Content, Status: "pending",
			})
		}
		if err := s.db.Create(&scenes).Error; err != nil {
			return err
		}
		for _, sc := range scenes {
			s.hub.Publish(Event{Type: "scene", StoryID: storyID, Data: map[string]interface{}{
				"sceneId": sc.ID, "idx": sc.Idx, "name": sc.Name, "status": "pending",
			}})
		}
	}

	// 提示词模板（可选）
	var promptTemplate string
	if story.PromptTemplate != nil {
		tpl, err := s.client.PromptTemplate(*story.PromptTemplate)
		if err == nil {
			promptTemplate = tpl.Template
		} else {
			log.Printf("故事 %d 模板获取失败，使用分类兜底: %v", storyID, err)
		}
	}
	categoryHint := categoryHints[story.StyleCategory]
	if categoryHint == "" {
		categoryHint = categoryHints["general"]
	}

	anyFailed := false
	if story.Mode == "anime" {
		// 动漫模式：顺序执行（首帧延续依赖上一幕成图），逐幕 TTS，最后 ffmpeg 合成
		anyFailed = s.runAnimeScenes(storyID, scenes, promptTemplate, categoryHint, userID, story.Continuity, story.ModelID)
	} else {
		anyFailed = s.runGraphicScenesConcurrent(storyID, scenes, promptTemplate, categoryHint, userID, story.ModelID)
	}

	if s.isCancelled(storyID) {
		s.db.Model(&entity.GraphicScene{}).Where("story_id = ? AND status IN ?", storyID, []string{"pending", "running"}).
			Update("status", "cancelled")
		s.finalize(storyID, "cancelled", "用户取消")
		return nil
	}
	if anyFailed {
		s.db.Model(&entity.GraphicScene{}).Where("story_id = ? AND status = ?", storyID, "pending").
			Update("status", "skipped")
		s.finalize(storyID, "failed", "部分分幕生图失败，可重跑（已成功的分幕会复用）")
		return nil
	}
	if story.Mode == "anime" {
		s.hub.Publish(Event{Type: "story", StoryID: storyID, Data: map[string]interface{}{"status": "running", "stage": "composing"}})
		videoURL, err := s.composeAnime(storyID)
		if err != nil {
			s.finalize(storyID, "failed", "视频合成失败: "+err.Error())
			return nil
		}
		s.db.Model(&entity.GraphicStory{}).Where("id = ?", storyID).Update("video_url", videoURL)
	}
	s.finalize(storyID, "succeeded", "")
	return nil
}

// runGraphicScenesConcurrent 图文模式：并发生图（信号量限流），已成功分幕跳过。
func (s *Service) runGraphicScenesConcurrent(storyID uint, scenes []entity.GraphicScene, promptTemplate, categoryHint string, userID int, modelID *int) bool {
	sem := make(chan struct{}, s.cfg.ImageConcurrent)
	var wg sync.WaitGroup
	var mu sync.Mutex
	anyFailed := false

	for i := range scenes {
		sc := &scenes[i]
		if sc.Status == "succeeded" {
			continue
		}
		wg.Add(1)
		sem <- struct{}{}
		go func(sc *entity.GraphicScene) {
			defer wg.Done()
			defer func() { <-sem }()

			if s.isCancelled(storyID) {
				s.db.Model(sc).Updates(map[string]interface{}{"status": "skipped"})
				s.hub.Publish(Event{Type: "scene", StoryID: storyID, Data: map[string]interface{}{
					"sceneId": sc.ID, "idx": sc.Idx, "name": sc.Name, "status": "skipped",
				}})
				return
			}

			started := time.Now()
			prompt := renderPrompt(promptTemplate, categoryHint, sc.Content)
			s.db.Model(sc).Updates(map[string]interface{}{
				"status": "running", "scene_prompt": prompt, "started_at": started, "error": nil,
			})
			s.hub.Publish(Event{Type: "scene", StoryID: storyID, Data: map[string]interface{}{
				"sceneId": sc.ID, "idx": sc.Idx, "name": sc.Name, "status": "running",
			}})

			result, err := s.client.Image(userID, prompt, "", modelID, nil, time.Duration(s.cfg.ImageTimeoutSec)*time.Second)
			duration := int(time.Since(started).Milliseconds())
			if err == nil {
				// gpt-image 类渠道可能返回 base64 data URL（数百 KB），统一落盘换成本地相对路径
				var imageURL string
				imageURL, err = persistImage(s.cfg.UploadDir, storyID, sc.Idx, result.URL)
				if err == nil {
					s.db.Model(sc).Updates(map[string]interface{}{
						"status": "succeeded", "image_url": imageURL, "model_id": result.ModelID,
						"finished_at": time.Now(), "duration_ms": duration,
					})
					s.hub.Publish(Event{Type: "scene", StoryID: storyID, Data: map[string]interface{}{
						"sceneId": sc.ID, "idx": sc.Idx, "name": sc.Name, "status": "succeeded",
						"imageUrl": imageURL, "durationMs": duration,
					}})
					return
				}
			}
			msg := err.Error()
			s.db.Model(sc).Updates(map[string]interface{}{
				"status": "failed", "error": msg, "finished_at": time.Now(), "duration_ms": duration,
			})
			s.hub.Publish(Event{Type: "scene", StoryID: storyID, Data: map[string]interface{}{
				"sceneId": sc.ID, "idx": sc.Idx, "name": sc.Name, "status": "failed", "error": msg,
			}})
			mu.Lock()
			anyFailed = true
			mu.Unlock()
		}(sc)
	}
	wg.Wait()
	return anyFailed
}

// runAnimeScenes 动漫模式：顺序生图（首帧延续时上一幕成图作参考图）+ 逐幕 TTS。
// TTS 失败不致命（静音幕兜底），生图失败才致命。
func (s *Service) runAnimeScenes(storyID uint, scenes []entity.GraphicScene, promptTemplate, categoryHint string, userID int, continuity bool, modelID *int) bool {
	anyFailed := false
	var prevRef []string // 上一幕成图的 data URL（延续参考）
	ttsAvailable := true

	for i := range scenes {
		sc := &scenes[i]
		if sc.Status == "succeeded" {
			// 断点重跑复用：延续参考取本地成图
			if sc.ImageURL != nil {
				prevRef = s.localImageAsReference(*sc.ImageURL)
			}
			continue
		}
		if s.isCancelled(storyID) {
			s.db.Model(sc).Updates(map[string]interface{}{"status": "skipped"})
			s.hub.Publish(Event{Type: "scene", StoryID: storyID, Data: map[string]interface{}{
				"sceneId": sc.ID, "idx": sc.Idx, "name": sc.Name, "status": "skipped",
			}})
			continue
		}

		// ---------- 生图 ----------
		started := time.Now()
		prompt := renderPrompt(promptTemplate, categoryHint, sc.Content)
		if continuity && len(prevRef) > 0 {
			prompt += "。请保持与参考图一致的角色形象、画风与色调，画面自然衔接上一幕。"
		}
		s.db.Model(sc).Updates(map[string]interface{}{
			"status": "running", "scene_prompt": prompt, "started_at": started, "error": nil,
		})
		s.hub.Publish(Event{Type: "scene", StoryID: storyID, Data: map[string]interface{}{
			"sceneId": sc.ID, "idx": sc.Idx, "name": sc.Name, "status": "running",
		}})

		result, err := s.client.Image(userID, prompt, "", modelID, prevRef, time.Duration(s.cfg.ImageTimeoutSec)*time.Second)
		duration := int(time.Since(started).Milliseconds())
		var imageURL string
		if err == nil {
			imageURL, err = persistImage(s.cfg.UploadDir, storyID, sc.Idx, result.URL)
		}
		if err != nil {
			msg := err.Error()
			s.db.Model(sc).Updates(map[string]interface{}{
				"status": "failed", "error": msg, "finished_at": time.Now(), "duration_ms": duration,
			})
			s.hub.Publish(Event{Type: "scene", StoryID: storyID, Data: map[string]interface{}{
				"sceneId": sc.ID, "idx": sc.Idx, "name": sc.Name, "status": "failed", "error": msg,
			}})
			anyFailed = true
			continue
		}
		s.db.Model(sc).Updates(map[string]interface{}{
			"status": "succeeded", "image_url": imageURL, "model_id": result.ModelID,
			"finished_at": time.Now(), "duration_ms": duration,
		})
		s.hub.Publish(Event{Type: "scene", StoryID: storyID, Data: map[string]interface{}{
			"sceneId": sc.ID, "idx": sc.Idx, "name": sc.Name, "status": "succeeded",
			"imageUrl": imageURL, "durationMs": duration,
		}})
		if continuity {
			prevRef = s.localImageAsReference(imageURL)
		}

		// ---------- TTS（非致命） ----------
		if !ttsAvailable {
			continue
		}
		audio, _, err := s.client.TTS(userID, sc.Content, "", modelID, time.Duration(s.cfg.ImageTimeoutSec)*time.Second)
		if err != nil {
			msg := err.Error()
			if strings.Contains(msg, "没有可用的语音模型") {
				ttsAvailable = false
				log.Printf("故事 %d 未配置 tts 能力模型，后续分幕将使用静音（可后续补配音）", storyID)
				s.hub.Publish(Event{Type: "scene", StoryID: storyID, Data: map[string]interface{}{
					"sceneId": sc.ID, "idx": sc.Idx, "name": sc.Name, "status": "succeeded",
					"warning": "未配置 tts 能力模型，视频将使用静音",
				}})
			} else {
				log.Printf("故事 %d 幕 %d TTS 失败（静音兜底）: %v", storyID, sc.Idx, err)
				s.hub.Publish(Event{Type: "scene", StoryID: storyID, Data: map[string]interface{}{
					"sceneId": sc.ID, "idx": sc.Idx, "name": sc.Name, "status": "succeeded",
					"warning": "本幕配音失败，将使用静音: " + msg,
				}})
			}
			continue
		}
		audioRel := fmt.Sprintf("graphic/story-%d/audio-%d.mp3", storyID, sc.Idx)
		audioAbs := filepath.Join(s.cfg.UploadDir, audioRel)
		if err := os.MkdirAll(filepath.Dir(audioAbs), 0o755); err != nil {
			log.Printf("故事 %d 幕 %d 音频落盘失败: %v", storyID, sc.Idx, err)
			continue
		}
		if err := os.WriteFile(audioAbs, audio, 0o644); err != nil {
			log.Printf("故事 %d 幕 %d 音频写入失败: %v", storyID, sc.Idx, err)
			continue
		}
		audioDur, err := probeAudioDuration(s.cfg.FFprobeBin, audioAbs)
		if err != nil {
			log.Printf("故事 %d 幕 %d 音频时长探测失败: %v", storyID, sc.Idx, err)
			continue
		}
		audioURL := "/uploads/" + audioRel
		s.db.Model(sc).Updates(map[string]interface{}{
			"audio_url": audioURL, "audio_duration_ms": int(audioDur * 1000),
		})
		s.hub.Publish(Event{Type: "scene", StoryID: storyID, Data: map[string]interface{}{
			"sceneId": sc.ID, "idx": sc.Idx, "name": sc.Name, "status": "succeeded",
			"audioUrl": audioURL, "audioDurationMs": int(audioDur * 1000),
		}})
	}
	return anyFailed
}

// composeAnime 收集成功分幕 → ffmpeg 合成成片。
func (s *Service) composeAnime(storyID uint) (string, error) {
	var scenes []entity.GraphicScene
	if err := s.db.Where("story_id = ? AND status = ?", storyID, "succeeded").Order("idx ASC").Find(&scenes).Error; err != nil {
		return "", err
	}
	if len(scenes) == 0 {
		return "", fmt.Errorf("没有可合成的分幕")
	}
	clips := make([]SceneClip, 0, len(scenes))
	for _, sc := range scenes {
		if sc.ImageURL == nil {
			continue
		}
		imgAbs := filepath.Join(s.cfg.UploadDir, strings.TrimPrefix(*sc.ImageURL, "/uploads/"))
		if _, err := os.Stat(imgAbs); err != nil {
			return "", fmt.Errorf("幕 %d 成图文件缺失: %s", sc.Idx, *sc.ImageURL)
		}
		clip := SceneClip{ImagePath: imgAbs, Subtitle: sc.Content}
		if sc.AudioURL != nil {
			audioAbs := filepath.Join(s.cfg.UploadDir, strings.TrimPrefix(*sc.AudioURL, "/uploads/"))
			if dur, err := probeAudioDuration(s.cfg.FFprobeBin, audioAbs); err == nil {
				clip.AudioPath = audioAbs
				clip.AudioDur = dur
			}
		}
		clips = append(clips, clip)
	}
	return Compose(s.cfg.FFMPEGBin, storyID, clips, s.cfg.UploadDir)
}

// localImageAsReference 读取本地成图转 data URL（图生图参考）；读取失败返回 nil（退化为文生图）。
func (s *Service) localImageAsReference(imageURL string) []string {
	abs := filepath.Join(s.cfg.UploadDir, strings.TrimPrefix(imageURL, "/uploads/"))
	data, err := os.ReadFile(abs)
	if err != nil {
		return nil
	}
	mime := "image/jpeg"
	if strings.HasSuffix(abs, ".png") {
		mime = "image/png"
	} else if strings.HasSuffix(abs, ".webp") {
		mime = "image/webp"
	}
	return []string{fmt.Sprintf("data:%s;base64,%s", mime, base64.StdEncoding.EncodeToString(data))}
}

func (s *Service) finalize(storyID uint, status, errMsg string) {
	var story entity.GraphicStory
	if err := s.db.First(&story, storyID).Error; err != nil {
		return
	}
	now := time.Now()
	updates := map[string]interface{}{"status": status, "finished_at": now}
	if story.StartedAt != nil {
		updates["duration_ms"] = int(now.Sub(*story.StartedAt).Milliseconds())
	}
	if errMsg != "" {
		updates["error"] = errMsg
	}
	s.db.Model(&story).Updates(updates)
	data := map[string]interface{}{"status": status}
	if errMsg != "" {
		data["error"] = errMsg
	}
	s.hub.Publish(Event{Type: "story", StoryID: storyID, Data: data})
}
