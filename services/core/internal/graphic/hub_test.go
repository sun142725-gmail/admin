package graphic

import (
	"sync"
	"testing"
	"time"
)

func TestHubSubscribeAndPublish(t *testing.T) {
	hub := NewHub()
	ch := hub.Subscribe(1)

	hub.Publish(Event{Type: "scene", StoryID: 1, Data: map[string]interface{}{"status": "running"}})
	select {
	case ev := <-ch:
		if ev.Type != "scene" || ev.Data["status"] != "running" {
			t.Fatalf("收到意外事件: %+v", ev)
		}
	case <-time.After(time.Second):
		t.Fatal("订阅者未收到事件")
	}
}

func TestHubTerminalEventClosesChannel(t *testing.T) {
	hub := NewHub()
	ch := hub.Subscribe(2)

	hub.Publish(Event{Type: "story", StoryID: 2, Data: map[string]interface{}{"status": "succeeded"}})

	// 终态事件本身可达，随后通道关闭
	deadline := time.After(time.Second)
	for {
		select {
		case _, ok := <-ch:
			if !ok {
				return // 通道已关闭，符合预期
			}
		case <-deadline:
			t.Fatal("终态事件后通道未关闭")
		}
	}
}

func TestHubUnsubscribeOnBackpressure(t *testing.T) {
	hub := NewHub()
	ch := hub.Subscribe(3)

	// 大量发布（超出缓冲）不阻塞、不 panic
	var wg sync.WaitGroup
	for i := 0; i < 200; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			hub.Publish(Event{Type: "scene", StoryID: 3, Data: map[string]interface{}{"i": i}})
		}()
	}
	wg.Wait()

	// 终态后通道关闭，无悬挂
	hub.Publish(Event{Type: "story", StoryID: 3, Data: map[string]interface{}{"status": "failed"}})
	if _, ok := hub.subs[3]; ok {
		t.Fatal("终态后订阅应被清理")
	}
	_ = ch
}

func TestHubIsolationBetweenStories(t *testing.T) {
	hub := NewHub()
	chA := hub.Subscribe(10)
	hub.Subscribe(11)

	hub.Publish(Event{Type: "scene", StoryID: 11, Data: map[string]interface{}{"x": 1}})

	select {
	case ev := <-chA:
		t.Fatalf("故事 10 不应收到故事 11 的事件: %+v", ev)
	case <-time.After(100 * time.Millisecond):
		// 符合预期
	}
}
