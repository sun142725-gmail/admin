// 事件广播：SSE 推送故事/分幕状态变化（对应 Node flow 的 RunEventsService，Go channel 实现）。
// 终态事件（story 的 succeeded/failed/cancelled）发送后关闭通道，订阅流自然结束。
package graphic

import (
	"sync"
)

type Event struct {
	Type    string                 `json:"type"` // story | scene
	StoryID uint                   `json:"storyId"`
	Data    map[string]interface{} `json:"data"`
}

type Hub struct {
	mu   sync.Mutex
	subs map[uint]map[chan Event]struct{}
}

func NewHub() *Hub {
	return &Hub{subs: make(map[uint]map[chan Event]struct{})}
}

func (h *Hub) Subscribe(storyID uint) <-chan Event {
	ch := make(chan Event, 64)
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.subs[storyID] == nil {
		h.subs[storyID] = make(map[chan Event]struct{})
	}
	h.subs[storyID][ch] = struct{}{}
	return ch
}

func (h *Hub) unsubscribe(storyID uint, ch chan Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if set, ok := h.subs[storyID]; ok {
		delete(set, ch)
		if len(set) == 0 {
			delete(h.subs, storyID)
		}
	}
}

func (h *Hub) Publish(ev Event) {
	terminal := ev.Type == "story" &&
		(ev.Data["status"] == "succeeded" || ev.Data["status"] == "failed" || ev.Data["status"] == "cancelled")

	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs[ev.StoryID] {
		select {
		case ch <- ev:
		default: // 订阅者积压时丢弃事件，前端以 init 快照 + 轮询兜底
		}
		if terminal {
			close(ch)
			delete(h.subs[ev.StoryID], ch)
		}
	}
	if terminal {
		delete(h.subs, ev.StoryID)
	}
}
