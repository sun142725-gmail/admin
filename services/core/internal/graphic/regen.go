// 漫画编辑闭环：单幕重生成 / 删除故事的前置校验与状态迁移（纯函数，便于 go test 覆盖）。
// 单幕重生成复用 runInternal 已有的「断点重跑」语义：把目标幕退回 pending，
// 其余 succeeded 幕在 Run 时被跳过，因此只重新生成用户指定的那一幕。
package graphic

import "errors"

var (
	ErrStoryBusy = errors.New("故事正在生成中，请等待完成或取消后再操作")
	ErrSceneBusy = errors.New("该分幕正在生成中")
)

// CanMutateStory 执行删除/重生成前检查流水线是否正在推进该故事。
func CanMutateStory(active bool) error {
	if active {
		return ErrStoryBusy
	}
	return nil
}

// SceneRegenUpdates 返回把某一幕退回「待生成」所需的字段；running 幕拒绝重入。
// 产物字段一并清空，避免旧图/旧音频在新一轮失败时被误当作成功结果展示。
func SceneRegenUpdates(currentStatus string) (map[string]interface{}, error) {
	if currentStatus == "running" {
		return nil, ErrSceneBusy
	}
	return map[string]interface{}{
		"status":            "pending",
		"error":             nil,
		"image_url":         nil,
		"audio_url":         nil,
		"audio_duration_ms": nil,
		"scene_prompt":      "",
		"started_at":        nil,
		"finished_at":       nil,
		"duration_ms":       nil,
		"model_id":          nil,
	}, nil
}

// StoryRegenUpdates 触发重跑前把故事退回待生成，并清掉上一轮成片与终态字段。
func StoryRegenUpdates() map[string]interface{} {
	return map[string]interface{}{
		"status":      "draft",
		"error":       nil,
		"video_url":   nil,
		"started_at":  nil,
		"finished_at": nil,
		"duration_ms": nil,
	}
}
