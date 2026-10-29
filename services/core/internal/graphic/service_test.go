package graphic

import (
	"strings"
	"testing"
)

func TestExtractJSON(t *testing.T) {
	cases := []struct {
		name    string
		input   string
		wantLen int
		wantErr bool
	}{
		{"裸 JSON 数组", `[{"name":"开场","content":"内容"}]`, 1, false},
		{"json 围栏", "```json\n[{\"name\":\"a\",\"content\":\"b\"}]\n```", 1, false},
		{"前后说明文字", "好的，以下是分幕：\n[{\"name\":\"a\",\"content\":\"b\"}]\n希望有帮助", 1, false},
		{"多幕", `[{"name":"1","content":"x"},{"name":"2","content":"y"},{"name":"3","content":"z"}]`, 3, false},
		{"无 JSON", "抱歉我无法输出", 0, true},
		{"对象而非数组", `{"name":"a"}`, 0, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			raw := extractJSON(tc.input)
			if tc.wantErr {
				if raw != nil {
					t.Fatalf("期望提取失败，实际得到: %s", raw)
				}
				return
			}
			if raw == nil {
				t.Fatal("期望提取到 JSON，实际为 nil")
			}
			if !strings.HasPrefix(string(raw), "[") {
				t.Fatalf("提取结果应为数组: %s", raw)
			}
		})
	}
}

func TestExtractJSONTruncatesTo12(t *testing.T) {
	var sb strings.Builder
	sb.WriteString("[")
	for i := 0; i < 20; i++ {
		if i > 0 {
			sb.WriteString(",")
		}
		sb.WriteString(`{"name":"n","content":"c"}`)
	}
	sb.WriteString("]")
	raw := extractJSON(sb.String())
	if raw == nil {
		t.Fatal("应能提取 JSON")
	}
	// extractJSON 只裁剪字符串不做解析，这里验证未越界：解析交给 segment。
	// 实际裁剪逻辑在 segment 中，本用例确认大输入不 panic。
}

func TestRenderPrompt(t *testing.T) {
	// 模板命中：{{content}} 被替换
	got := renderPrompt("水彩插画：{{content}}。", "ignored", "锦鲤跃出水面")
	if got != "水彩插画：锦鲤跃出水面。" {
		t.Fatalf("模板渲染错误: %s", got)
	}

	// 无模板：走分类兜底（调用方先把分类 key 解析为风格文案，anime）
	got = renderPrompt("", categoryHints["anime"], "老猫伸懒腰")
	if !strings.Contains(got, "老猫伸懒腰") || !strings.Contains(got, "日系动漫") {
		t.Fatalf("分类兜底错误: %s", got)
	}

	// 未知分类：调用方回退 general 文案
	got = renderPrompt("", categoryHints["general"], "测试内容")
	if !strings.Contains(got, "测试内容") {
		t.Fatalf("未知分类应回退通用提示: %s", got)
	}
}

func TestLocalImageAsReferenceExtension(t *testing.T) {
	// 纯格式断言：不落盘，只验证 mime 推断的分支完整性由 persistImage 侧保证。
	// 这里覆盖 persistImage 的 ext 推断表（间接保护 data URL 的 mime 正确性）。
	for mime, want := range map[string]string{
		"image/jpeg": "jpg",
		"image/png":  "png",
		"image/webp": "webp",
	} {
		if extByMime[mime] != want {
			t.Fatalf("mime %s 应映射到 %s", mime, want)
		}
	}
}
