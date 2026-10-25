// JWT 鉴权中间件：与 Node 网关共用 JWT_ACCESS_SECRET（HS256），校验 accessToken。
// 纵深防御：请求经网关转发时已鉴权过一次，这里再验签一次，保证服务被直连时也安全。
package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"

	"rbac-core/pkg/response"
)

func JWTAuth(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 未配置密钥时跳过（仅限开发/内网）；生产环境必须在 compose 里注入 JWT_ACCESS_SECRET
		if secret == "" {
			c.Set("authSkipped", true)
			c.Next()
			return
		}
		auth := c.GetHeader("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") {
			response.Fail(c, 401, "缺少 Bearer 令牌", 401)
			c.Abort()
			return
		}
		tokenStr := strings.TrimPrefix(auth, "Bearer ")
		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			return []byte(secret), nil
		}, jwt.WithValidMethods([]string{"HS256"}))
		if err != nil || !token.Valid {
			response.Fail(c, 401, "无效或过期的令牌", 401)
			c.Abort()
			return
		}
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok || claims["typ"] != "access" {
			response.Fail(c, 401, "令牌类型错误", 401)
			c.Abort()
			return
		}
		// 网关也会带 X-Forwarded-User 头，这里以令牌验签结果为准
		c.Set("userId", claims["sub"])
		if name, ok := claims["username"].(string); ok {
			c.Set("username", name)
		}
		c.Next()
	}
}
