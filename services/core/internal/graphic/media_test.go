package graphic

import (
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestSceneSeconds(t *testing.T) {
	// 静音幕固定 4 秒
	if got := sceneSeconds(SceneClip{}); got != 4.0 {
		t.Fatalf("静音幕应为 4s，实际 %f", got)
	}
	// 配音幕 = 音频 + 收尾缓冲
	if got := sceneSeconds(SceneClip{AudioPath: "a.mp3", AudioDur: 3.0}); got != 3.6 {
		t.Fatalf("配音幕应为 3.6s，实际 %f", got)
	}
	// 下限 2.5s（超短配音也保底可读）
	if got := sceneSeconds(SceneClip{AudioPath: "a.mp3", AudioDur: 0.5}); got != 2.5 {
		t.Fatalf("超短配音应兜底 2.5s，实际 %f", got)
	}
}

func TestSrtCueFormat(t *testing.T) {
	got := srtCue(0.2, 3.7, "字幕文本")
	want := "1\n00:00:00,200 --> 00:00:03,700\n字幕文本\n"
	if got != want {
		t.Fatalf("SRT 格式错误:\n%s\n期望:\n%s", got, want)
	}
}

func TestComposeProducesPlayableVideo(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("本机无 ffmpeg，跳过合成测试")
	}
	uploadDir := t.TempDir()

	// 用 ffmpeg 生成两张测试图（青/红各一）
	img1 := filepath.Join(uploadDir, "a.jpg")
	img2 := filepath.Join(uploadDir, "b.jpg")
	for _, tc := range []struct {
		path, color string
	}{{img1, "0x008080"}, {img2, "0x800000"}} {
		cmd := exec.Command("ffmpeg", "-y", "-f", "lavfi", "-i", "color=c="+tc.color+":s=320x240:d=1", "-frames:v", "1", tc.path)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("生成测试图失败: %v: %s", err, out)
		}
	}

	clips := []SceneClip{
		{ImagePath: img1, Subtitle: "第一幕字幕"},
		{ImagePath: img2, Subtitle: "第二幕字幕"},
	}
	videoURL, err := Compose("ffmpeg", 99, clips, uploadDir)
	if err != nil {
		t.Fatalf("合成失败: %v", err)
	}
	if videoURL != "/uploads/graphic/story-99/final.mp4" {
		t.Fatalf("成片 URL 错误: %s", videoURL)
	}

	finalPath := filepath.Join(uploadDir, "graphic/story-99/final.mp4")
	info, err := os.Stat(finalPath)
	if err != nil {
		t.Fatalf("成片文件不存在: %v", err)
	}
	if info.Size() < 10*1024 {
		t.Fatalf("成片过小，疑似空转: %d bytes", info.Size())
	}
	// 时长 = 2 个静音幕 × 4s = 8s
	probe := exec.Command("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", finalPath)
	durOut, err := probe.Output()
	if err != nil {
		t.Fatalf("ffprobe 失败: %v", err)
	}
	duration, err := strconv.ParseFloat(strings.TrimSpace(string(durOut)), 64)
	if err != nil {
		t.Fatalf("时长解析失败: %s", durOut)
	}
	if duration < 7.0 || duration > 9.0 {
		t.Fatalf("成片时长应约 8s，实际 %f", duration)
	}

	// 本机 ffmpeg 缺 libass 时应产出外挂字幕（降级约定）
	srtPath := filepath.Join(uploadDir, "graphic/story-99/final.srt")
	if !hasSubtitlesFilter("ffmpeg") {
		if _, err := os.Stat(srtPath); err != nil {
			t.Fatal("无烧录能力时应产出 final.srt 外挂字幕")
		}
	}
}
