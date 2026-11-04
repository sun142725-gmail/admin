package graphic

import (
	"errors"
	"testing"
)

func TestCanMutateStory(t *testing.T) {
	if err := CanMutateStory(false); err != nil {
		t.Fatalf("空闲故事应允许变更: %v", err)
	}
	if err := CanMutateStory(true); !errors.Is(err, ErrStoryBusy) {
		t.Fatalf("执行中的故事应拒绝变更，实际: %v", err)
	}
}

func TestSceneRegenUpdates(t *testing.T) {
	for _, status := range []string{"succeeded", "failed", "pending", "skipped", "cancelled"} {
		t.Run(status, func(t *testing.T) {
			updates, err := SceneRegenUpdates(status)
			if err != nil {
				t.Fatalf("状态 %s 应允许重生成: %v", status, err)
			}
			if updates["status"] != "pending" {
				t.Fatalf("状态应回退为 pending，实际 %v", updates["status"])
			}
			for _, key := range []string{"error", "image_url", "audio_url", "audio_duration_ms", "finished_at", "duration_ms", "model_id"} {
				value, ok := updates[key]
				if !ok || value != nil {
					t.Fatalf("字段 %s 应被清空为 nil，实际 %v", key, value)
				}
			}
		})
	}

	if _, err := SceneRegenUpdates("running"); !errors.Is(err, ErrSceneBusy) {
		t.Fatalf("running 幕应拒绝重入，实际: %v", err)
	}

	// 每次返回独立 map，避免调用方改动污染后续请求。
	first, _ := SceneRegenUpdates("succeeded")
	first["status"] = "hacked"
	second, _ := SceneRegenUpdates("succeeded")
	if second["status"] != "pending" {
		t.Fatal("返回的 map 被复用，存在跨请求污染风险")
	}
}

func TestStoryRegenUpdates(t *testing.T) {
	updates := StoryRegenUpdates()
	if updates["status"] != "draft" {
		t.Fatalf("故事应退回 draft，实际 %v", updates["status"])
	}
	for _, key := range []string{"error", "video_url", "started_at", "finished_at", "duration_ms"} {
		value, ok := updates[key]
		if !ok || value != nil {
			t.Fatalf("字段 %s 应被清空为 nil，实际 %v", key, value)
		}
	}
}
