// ffmpeg 合成：每幕（图 + 配音 + 字幕 + 缓动推近）→ 分段 mp4 → concat 成片。
// 静音幕用 anullsrc 补白（时长固定），配音幕时长 = 音频时长 + 收尾缓冲。
package graphic

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
)

const (
	videoWidth      = 1280
	videoHeight     = 720
	videoFPS        = 25
	silentSceneSecs = 4.0
	tailBufferSecs  = 0.6
	minSceneSecs    = 2.5
	zoomStep        = 0.0006
	zoomMax         = 1.1
)

type SceneClip struct {
	ImagePath string  // 绝对路径（必填）
	AudioPath string  // 绝对路径（空 = 静音幕）
	AudioDur  float64 // 音频秒数（AudioPath 非空时有效）
	Subtitle  string  // 字幕文本（可空）
}

func sceneSeconds(clip SceneClip) float64 {
	if clip.AudioPath == "" {
		return silentSceneSecs
	}
	dur := clip.AudioDur + tailBufferSecs
	if dur < minSceneSecs {
		dur = minSceneSecs
	}
	return dur
}

// probeAudioDuration 用 ffprobe 读音频时长（秒）。
func probeAudioDuration(ffprobeBin, audioPath string) (float64, error) {
	out, err := exec.Command(ffprobeBin, "-v", "error", "-show_entries", "format=duration",
		"-of", "csv=p=0", audioPath).Output()
	if err != nil {
		return 0, fmt.Errorf("ffprobe 失败: %w", err)
	}
	return strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
}

// srtCue 生成单条字幕的 SRT 块（时间格式 时:分:秒,毫秒）。
func srtCue(from, to float64, text string) string {
	format := func(v float64) string {
		t := int(v)
		ms := int((v - float64(t)) * 1000)
		return fmt.Sprintf("%02d:%02d:%02d,%03d", t/3600, (t%3600)/60, t%60, ms)
	}
	return fmt.Sprintf("1\n%s --> %s\n%s\n", format(from), format(to), text)
}

var (
	subtitlesProbeOnce sync.Once
	subtitlesFilterOK  bool
)

// hasSubtitlesFilter 探测当前 ffmpeg 是否带 subtitles 滤镜（libass）。
// 缺失时降级：不烧录字幕，改产 final.srt 外挂字幕（播放器可加载，装全量 ffmpeg 后自动恢复烧录）。
func hasSubtitlesFilter(ffmpegBin string) bool {
	subtitlesProbeOnce.Do(func() {
		out, err := exec.Command(ffmpegBin, "-hide_banner", "-filters").Output()
		subtitlesFilterOK = err == nil && strings.Contains(string(out), " subtitles ")
		if !subtitlesFilterOK {
			log.Println("ffmpeg 缺少 subtitles 滤镜（libass），字幕将以外挂 .srt 交付")
		}
	})
	return subtitlesFilterOK
}

// Compose 把分幕合成成片，返回相对 uploads 的 URL（/uploads/graphic/story-{id}/final.mp4）。
// 字幕烧录不可用时同步产出 /uploads/graphic/story-{id}/final.srt。
func Compose(ffmpegBin string, storyID uint, clips []SceneClip, uploadDir string) (string, error) {
	if len(clips) == 0 {
		return "", fmt.Errorf("没有可合成的分幕")
	}
	// 统一转绝对路径：后面 ffmpeg 以 cmd.Dir=workDir 运行（srt 用相对名规避转义），
	// 相对 uploadDir 会以 workDir 为基准解析导致文件找不到
	uploadDir, _ = filepath.Abs(uploadDir)
	for i := range clips {
		if abs, err := filepath.Abs(clips[i].ImagePath); err == nil {
			clips[i].ImagePath = abs
		}
		if clips[i].AudioPath != "" {
			if abs, err := filepath.Abs(clips[i].AudioPath); err == nil {
				clips[i].AudioPath = abs
			}
		}
	}
	relDir := fmt.Sprintf("graphic/story-%d", storyID)
	workDir := filepath.Join(uploadDir, relDir, "work")
	if err := os.MkdirAll(workDir, 0o755); err != nil {
		return "", fmt.Errorf("创建合成工作目录失败: %w", err)
	}
	burnSubtitles := hasSubtitlesFilter(ffmpegBin)

	listLines := make([]string, 0, len(clips))
	timeline := make([]string, 0, len(clips)) // 降级模式的全时间轴字幕
	var timelineOffset float64
	for i, clip := range clips {
		dur := sceneSeconds(clip)

		img := filepath.Join(workDir, fmt.Sprintf("img-%d%s", i, filepath.Ext(clip.ImagePath)))
		if err := copyFile(clip.ImagePath, img); err != nil {
			return "", fmt.Errorf("复制幕 %d 图片失败: %w", i+1, err)
		}

		args := []string{"-y", "-loop", "1", "-i", img}
		hasAudio := clip.AudioPath != ""
		if hasAudio {
			args = append(args, "-i", clip.AudioPath)
		} else {
			args = append(args, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo")
		}

		filters := []string{
			fmt.Sprintf("[0:v]scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d,zoompan=z='min(zoom+%f,%f)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=%dx%d:fps=%d,format=yuv420p[v]",
				videoWidth, videoHeight, videoWidth, videoHeight, zoomStep, zoomMax, videoWidth, videoHeight, videoFPS),
		}
		if burnSubtitles && strings.TrimSpace(clip.Subtitle) != "" {
			srt := filepath.Join(workDir, fmt.Sprintf("clip-%d.srt", i))
			end := dur - 0.3
			if end <= 0.5 {
				end = dur
			}
			if err := os.WriteFile(srt, []byte(srtCue(0.2, end, clip.Subtitle)), 0o644); err != nil {
				return "", fmt.Errorf("写字幕文件失败: %w", err)
			}
			filters = append(filters, fmt.Sprintf("[v]subtitles=%s:force_style='FontName=%s,FontSize=13,Outline=1,MarginV=42'[vout]",
				filepath.Base(srt), subtitleFontName()))
			args = append(args, "-filter_complex", strings.Join(filters, ";"))
			args = append(args, "-map", "[vout]")
		} else {
			if strings.TrimSpace(clip.Subtitle) != "" {
				end := timelineOffset + dur - 0.3
				if end <= timelineOffset+0.5 {
					end = timelineOffset + dur
				}
				timeline = append(timeline, srtCue(timelineOffset+0.2, end, clip.Subtitle))
			}
			args = append(args, "-filter_complex", strings.Join(filters, ";"))
			args = append(args, "-map", "[v]")
		}
		args = append(args,
			"-map", "1:a",
			"-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
			"-c:a", "aac", "-b:a", "128k",
			"-shortest", "-t", strconv.FormatFloat(dur, 'f', 3, 64),
			fmt.Sprintf("clip-%d.mp4", i),
		)

		cmd := exec.Command(ffmpegBin, args...)
		cmd.Dir = workDir // 相对路径引用 srt，规避 subtitles filter 的路径转义
		if out, err := cmd.CombinedOutput(); err != nil {
			return "", fmt.Errorf("合成幕 %d 失败: %w: %s", i+1, err, tailBytes(out, 400))
		}
		listLines = append(listLines, fmt.Sprintf("file '%s'", fmt.Sprintf("clip-%d.mp4", i)))
		timelineOffset += dur
	}

	listFile := filepath.Join(workDir, "list.txt")
	if err := os.WriteFile(listFile, []byte(strings.Join(listLines, "\n")+"\n"), 0o644); err != nil {
		return "", fmt.Errorf("写 concat 列表失败: %w", err)
	}
	finalAbs := filepath.Join(uploadDir, relDir, "final.mp4")
	cmd := exec.Command(ffmpegBin, "-y", "-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", finalAbs)
	cmd.Dir = workDir
	if out, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("拼接成片失败: %w: %s", err, tailBytes(out, 400))
	}
	_ = os.RemoveAll(workDir) // 清理中间产物
	if !burnSubtitles && len(timeline) > 0 {
		srtAbs := filepath.Join(uploadDir, relDir, "final.srt")
		if err := os.WriteFile(srtAbs, []byte(strings.Join(timeline, "\n")), 0o644); err != nil {
			log.Printf("故事 %d 外挂字幕写入失败: %v", storyID, err)
		}
	}
	return "/uploads/" + relDir + "/final.mp4", nil
}

// subtitleFontName macOS 用苹方，容器（Noto CJK）用环境变量覆盖。
func subtitleFontName() string {
	if v := os.Getenv("SUBTITLE_FONT"); v != "" {
		return v
	}
	return "PingFang SC"
}

func copyFile(src, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0o644)
}

func tailBytes(b []byte, n int) string {
	if len(b) > n {
		return string(b[len(b)-n:])
	}
	return string(b)
}
