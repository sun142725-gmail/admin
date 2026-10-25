// 示例接口：演示标准写法（列表 / 详情+404 / 创建 / SSE 流式），无业务含义，接业务时可整文件替换。
// 真实业务建议按 handler(参数校验) → service(业务逻辑) → repo(数据访问) 分层，目录建在 internal/ 下。
package handler

import (
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"rbac-core/pkg/response"
)

// Example 示例资源（内存存储仅作演示）。
type Example struct {
	ID     uint64 `json:"id"`
	Name   string `json:"name" binding:"required"`
	Remark string `json:"remark"`
}

var (
	examplesMu sync.Mutex
	examples   = []Example{
		{ID: 1, Name: "示例一", Remark: "只读列表数据"},
		{ID: 2, Name: "示例二", Remark: "Go 标准脚手架"},
	}
	nextID uint64 = 3
)

// ListExamples GET /api/v1/examples
func ListExamples(c *gin.Context) {
	examplesMu.Lock()
	defer examplesMu.Unlock()
	response.Ok(c, examples)
}

// GetExample GET /api/v1/examples/:id —— 含 404 用法示例
func GetExample(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.Fail(c, 400, "id 必须是数字", http.StatusBadRequest)
		return
	}
	examplesMu.Lock()
	defer examplesMu.Unlock()
	for _, item := range examples {
		if item.ID == id {
			response.Ok(c, item)
			return
		}
	}
	response.Fail(c, 404, "示例不存在", http.StatusNotFound)
}

// CreateExample POST /api/v1/examples
func CreateExample(c *gin.Context) {
	var input Example
	if err := c.ShouldBindJSON(&input); err != nil {
		response.Fail(c, 400, "参数错误: "+err.Error(), http.StatusBadRequest)
		return
	}
	examplesMu.Lock()
	input.ID = nextID
	nextID++
	examples = append(examples, input)
	examplesMu.Unlock()
	response.Ok(c, input)
}

// StreamExample GET /api/v1/examples/:id/stream —— SSE 流式响应示例，
// 用于验证"前端 ← SSE ← Node 网关 ← SSE ← Go"的透传链路；长任务进度推送照此模式实现。
func StreamExample(c *gin.Context) {
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)
	for i := 1; i <= 3; i++ {
		fmt.Fprintf(c.Writer, "data: 事件%d\n\n", i)
		c.Writer.Flush()
		time.Sleep(200 * time.Millisecond)
	}
	fmt.Fprint(c.Writer, "data: [DONE]\n\n")
	c.Writer.Flush()
}
