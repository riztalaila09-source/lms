import { createClient } from '@connectrpc/connect'
import { UserService } from '@/gen/user/v1/user_pb'
import { transport } from './transport'

// Typed ConnectRPC client for the UserService.
// Generated types in @/gen/user/v1/user_pb come from `buf generate` / `make proto`.
export const userClient = createClient(UserService, transport)
