// 产物落盘：把生图结果（data URL 或远程 URL）写进 Node 静态目录 uploads/graphic/，
// DB 只存 /uploads/... 相对路径——与 novel-pipeline 的「OSS 外链会过期，必须本地化」约定一致。
package graphic

import (
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var extByMime = map[string]string{
	"image/jpeg": "jpg",
	"image/png":  "png",
	"image/webp": "webp",
	"image/gif":  "gif",
}

// persistImage 把图片字节写入 uploads/graphic/story-{id}/scene-{idx}.{ext}，返回相对 URL。
func persistImage(uploadDir string, storyID uint, idx int, remoteURL string) (string, error) {
	var (
		data []byte
		mime string
		err  error
	)
	if strings.HasPrefix(remoteURL, "data:") {
		// data:[<mime>][;base64],<payload>
		head, payload, ok := strings.Cut(remoteURL, ",")
		if !ok {
			return "", fmt.Errorf("data URL 格式非法")
		}
		mime = strings.TrimPrefix(strings.TrimPrefix(head, "data:"), ";base64")
		data, err = base64.StdEncoding.DecodeString(payload)
	} else {
		client := &http.Client{Timeout: 60 * time.Second}
		resp, fetchErr := client.Get(remoteURL)
		if fetchErr != nil {
			return "", fmt.Errorf("下载生图结果失败: %w", fetchErr)
		}
		defer resp.Body.Close()
		if resp.StatusCode > 299 {
			return "", fmt.Errorf("下载生图结果 HTTP %d", resp.StatusCode)
		}
		data, err = io.ReadAll(resp.Body)
		mime = resp.Header.Get("Content-Type")
	}
	if err != nil {
		return "", fmt.Errorf("读取生图结果失败: %w", err)
	}
	if len(data) == 0 {
		return "", fmt.Errorf("生图结果为空")
	}

	ext := extByMime[strings.Split(mime, ";")[0]]
	if ext == "" {
		ext = "jpg" // 兜底
	}
	relative := fmt.Sprintf("graphic/story-%d/scene-%d.%s", storyID, idx, ext)
	absolute := filepath.Join(uploadDir, relative)
	if err := os.MkdirAll(filepath.Dir(absolute), 0o755); err != nil {
		return "", fmt.Errorf("创建产物目录失败: %w", err)
	}
	if err := os.WriteFile(absolute, data, 0o644); err != nil {
		return "", fmt.Errorf("写入产物文件失败: %w", err)
	}
	return "/uploads/" + relative, nil
}
