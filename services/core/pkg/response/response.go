// 统一响应结构：与 Node 网关的 ResponseInterceptor 保持一致，前端无需感知后端语言差异。
// 注意：经网关转发时（/api/svc/*）Node 不做二次包装，本结构会原样到达前端。
package response

import (
	"time"

	"github.com/gin-gonic/gin"
)

type Body struct {
	Code      int         `json:"code"`      // 0 成功；非 0 业务错误码
	Message   string      `json:"message"`   // 提示信息
	Data      interface{} `json:"data"`      // 业务数据
	Timestamp string      `json:"timestamp"` // ISO8601 时间
	TraceID   string      `json:"traceId"`   // 链路 ID（透传自 X-Request-Id 请求头）
}

func traceID(c *gin.Context) string {
	if v, ok := c.Get("traceId"); ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// Ok 统一成功响应（HTTP 200）。
func Ok(c *gin.Context, data interface{}) {
	c.JSON(200, Body{Code: 0, Message: "success", Data: data, Timestamp: time.Now().Format(time.RFC3339), TraceID: traceID(c)})
}

// Fail 统一失败响应；httpStatus 缺省 400。
func Fail(c *gin.Context, code int, message string, httpStatus ...int) {
	status := 400
	if len(httpStatus) > 0 {
		status = httpStatus[0]
	}
	c.JSON(status, Body{Code: code, Message: message, Data: nil, Timestamp: time.Now().Format(time.RFC3339), TraceID: traceID(c)})
}
