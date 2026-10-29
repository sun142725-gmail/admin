// Node 内部接口客户端：图文流水线回调 Node 的 AI 能力（/api/internal/ai/*）与提示词库。
// 阻塞式 HTTP（引擎只消费聚合结果，不需要流式），X-Internal-Token 鉴权。
package aiclient

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"rbac-core/internal/config"
)

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatResult struct {
	Text    string `json:"text"`
	ModelID *int   `json:"modelId"`
}

type ImageResult struct {
	URL     string `json:"url"`
	ModelID *int   `json:"modelId"`
}

type TTSResult struct {
	AudioBase64 string `json:"audioBase64"`
	Mime        string `json:"mime"`
	ModelID     *int   `json:"modelId"`
}

type PromptTemplate struct {
	ID             int     `json:"id"`
	Category       string  `json:"category"`
	Template       string  `json:"template"`
	NegativePrompt *string `json:"negativePrompt"`
	ModelID        *int    `json:"modelId"`
}

type Client struct {
	baseURL string
	token   string
	http    *http.Client
}

func New(cfg config.Config) *Client {
	return &Client{
		baseURL: cfg.NodeBaseURL,
		token:   cfg.InternalToken,
		http:    &http.Client{Timeout: 0}, // 超时按调用点 context 控制
	}
}

// post JSON 请求并解析 Node 统一响应 {code, message, data}。
func (c *Client) post(path string, timeout time.Duration, payload, out interface{}) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, c.baseURL+"/api"+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Token", c.token)
	httpResp, err := c.do(req, timeout)
	if err != nil {
		return err
	}
	return decode(httpResp, out)
}

func (c *Client) get(path string, timeout time.Duration, out interface{}) error {
	req, err := http.NewRequest(http.MethodGet, c.baseURL+"/api"+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-Internal-Token", c.token)
	httpResp, err := c.do(req, timeout)
	if err != nil {
		return err
	}
	return decode(httpResp, out)
}

func (c *Client) do(req *http.Request, timeout time.Duration) (*http.Response, error) {
	httpClient := &http.Client{Timeout: timeout}
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("调用 Node %s 失败: %w", req.URL.Path, err)
	}
	return resp, nil
}

type envelope struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

func decode(resp *http.Response, out interface{}) error {
	defer resp.Body.Close()
	var env envelope
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		return fmt.Errorf("Node 响应解析失败(HTTP %d): %w", resp.StatusCode, err)
	}
	// Nest 对 POST 默认返回 201，统一接受 2xx
	if resp.StatusCode < 200 || resp.StatusCode > 299 || env.Code != 0 {
		return fmt.Errorf("Node 接口错误(HTTP %d): %s", resp.StatusCode, env.Message)
	}
	if out == nil || len(env.Data) == 0 {
		return nil
	}
	return json.Unmarshal(env.Data, out)
}

// Chat 阻塞式对话生成（用于分幕/文案加工）。
func (c *Client) Chat(userID int, messages []Message, temperature float64, modelID *int, timeout time.Duration) (*ChatResult, error) {
	payload := map[string]interface{}{
		"userId":   userID,
		"messages": messages,
	}
	if temperature > 0 {
		payload["temperature"] = temperature
	}
	if modelID != nil {
		payload["modelId"] = *modelID
	}
	var result ChatResult
	if err := c.post("/internal/ai/chat", timeout, payload, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// Image 阻塞式生图（gpt-image-2.5 等已配置的 image 能力模型）。
// referenceImages 非空时走图生图（首帧延续/角色一致性）。
func (c *Client) Image(userID int, prompt, size string, modelID *int, referenceImages []string, timeout time.Duration) (*ImageResult, error) {
	payload := map[string]interface{}{"userId": userID, "prompt": prompt, "count": 1}
	if size != "" {
		payload["size"] = size
	}
	if modelID != nil {
		payload["modelId"] = *modelID
	}
	if len(referenceImages) > 0 {
		payload["referenceImages"] = referenceImages
	}
	var result struct {
		Images []struct {
			URL string `json:"url"`
		} `json:"images"`
		ModelID *int `json:"modelId"`
	}
	if err := c.post("/internal/ai/image", timeout, payload, &result); err != nil {
		return nil, err
	}
	if len(result.Images) == 0 {
		return nil, fmt.Errorf("生图返回为空")
	}
	return &ImageResult{URL: result.Images[0].URL, ModelID: result.ModelID}, nil
}

// TTS 阻塞式语音合成（OpenAI 兼容 /audio/speech 渠道），返回音频字节。
func (c *Client) TTS(userID int, text, voice string, modelID *int, timeout time.Duration) ([]byte, string, error) {
	payload := map[string]interface{}{"userId": userID, "text": text}
	if voice != "" {
		payload["voice"] = voice
	}
	if modelID != nil {
		payload["modelId"] = *modelID
	}
	var result TTSResult
	if err := c.post("/internal/ai/tts", timeout, payload, &result); err != nil {
		return nil, "", err
	}
	audio, err := base64.StdEncoding.DecodeString(result.AudioBase64)
	if err != nil || len(audio) == 0 {
		return nil, "", fmt.Errorf("语音合成结果解码失败")
	}
	return audio, result.Mime, nil
}

// PromptTemplate 获取提示词模板（同时让 Node 侧引用计数 +1）。
func (c *Client) PromptTemplate(id int) (*PromptTemplate, error) {
	var result PromptTemplate
	if err := c.get(fmt.Sprintf("/internal/prompt-templates/%d", id), 15*time.Second, &result); err != nil {
		return nil, err
	}
	return &result, nil
}
