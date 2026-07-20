package middleware

import (
	"context"
	"strings"

	"connectrpc.com/connect"

	"lms/backend/internal/service"
)

type contextKey struct{}

// NewAuthInterceptor returns a ConnectRPC interceptor that validates JWT tokens.
// The Login RPC is exempt from authentication checks.
func NewAuthInterceptor(jwtSvc *service.JWTService) connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			// Public procedures — no token required.
			switch req.Spec().Procedure {
			case "/user.v1.UserService/Login",
				"/school.v1.SchoolService/GetSchool", // landing page reads these pre-login
				"/school.v1.SchoolService/ListStaff",
				"/school.v1.SchoolService/ListContent":
				return next(ctx, req)
			}

			authHeader := req.Header().Get("Authorization")
			if authHeader == "" {
				return nil, connect.NewError(connect.CodeUnauthenticated, connect.NewError(connect.CodeUnauthenticated, nil))
			}

			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
			if tokenStr == authHeader {
				return nil, connect.NewError(connect.CodeUnauthenticated, nil)
			}

			claims, err := jwtSvc.ValidateToken(tokenStr)
			if err != nil {
				return nil, connect.NewError(connect.CodeUnauthenticated, err)
			}

			ctx = context.WithValue(ctx, contextKey{}, claims)
			return next(ctx, req)
		}
	}
}

// ClaimsFromContext extracts JWT claims from the request context.
func ClaimsFromContext(ctx context.Context) (*service.Claims, bool) {
	claims, ok := ctx.Value(contextKey{}).(*service.Claims)
	return claims, ok
}

// TestContextKey returns the context key used for claims injection.
// Only use this in tests to populate context with fake claims.
func TestContextKey() contextKey {
	return contextKey{}
}
