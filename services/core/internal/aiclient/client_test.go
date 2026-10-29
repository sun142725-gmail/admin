package aiclient

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"rbac-core/internal/config"
)

func newTestClient(t *testing.T, handler http.HandlerFunc) (*Client, *httptest.Server) {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	cfg := config.Config{NodeBaseURL: server.URL, InternalToken: "tok"}
	return New(cfg), server
}

func TestPostAccepts201FromNest(t *testing.T) {
	client, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		// Node 对 POST 默认返回 201（曾导致 Go 客户端误判失败）
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"code": 0, "message": "success", "data": map[string]string{"text": "ok"}})
	})

	var out ChatResult
	err := client.post("/internal/ai/chat", 5*time.Second, map[string]string{"a": "b"}, &out)
	if err != nil {
		t.Fatalf("2xx 响应应被接受: %v", err)
	}
	if out.Text != "ok" {
		t.Fatalf("data 解析错误: %+v", out)
	}
}

func TestPostRejectsBusinessError(t *testing.T) {
	client, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"code": 503, "message": "没有可用的生图模型", "data": nil})
	})
	err := client.post("/internal/ai/image", 5*time.Second, map[string]string{}, &struct{}{})
	if err == nil || err.Error() != "Node 接口错误(HTTP 200): 没有可用的生图模型" {
		t.Fatalf("业务错误应透出: %v", err)
	}
}

func TestGetRejectsHTTPError(t *testing.T) {
	client, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Internal-Token") != "tok" {
			t.Fatal("内部令牌未随请求携带")
		}
		http.Error(w, "unauthorized", http.StatusUnauthorized)
	})
	if err := client.get("/internal/prompt-templates/1", 5*time.Second, &struct{}{}); err == nil {
		t.Fatal("非 2xx 应报错")
	}
}

func TestTTSParsesAudio(t *testing.T) {
	raw := []byte{0x01, 0x02, 0x03}
	client, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"code": 0, "message": "success",
			"data": map[string]interface{}{"audioBase64": base64.StdEncoding.EncodeToString(raw), "mime": "audio/mpeg"},
		})
	})
	audio, mime, err := client.TTS(1, "文本", "", nil, 5*time.Second)
	if err != nil {
		t.Fatalf("TTS 解析失败: %v", err)
	}
	if mime != "audio/mpeg" || len(audio) != 3 {
		t.Fatalf("音频解析错误: mime=%s len=%d", mime, len(audio))
	}
}

func TestImageParsesFirstImage(t *testing.T) {
	client, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&payload)
		if payload["referenceImages"] == nil {
			t.Fatal("referenceImages 未随请求透传")
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"code": 0, "message": "success",
			"data": map[string]interface{}{
				"images":  []map[string]string{{"url": "data:image/png;base64,AAA"}},
				"modelId": 7,
			},
		})
	})
	result, err := client.Image(1, "提示词", "", nil, []string{"data:image/png;base64,AAA"}, 5*time.Second)
	if err != nil {
		t.Fatalf("Image 失败: %v", err)
	}
	if result.URL != "data:image/png;base64,AAA" || result.ModelID == nil || *result.ModelID != 7 {
		t.Fatalf("Image 结果解析错误: %+v", result)
	}
}
