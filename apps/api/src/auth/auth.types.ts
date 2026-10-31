import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthProfile } from '@codeaudit/contracts';
export const Public = () => SetMetadata('codeaudit.public', true);
export interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  socket: { remoteAddress?: string };
  auth?: AuthProfile;
}
export interface CookieResponse {
  cookie(name: string, value: string, options: { httpOnly: boolean; secure: boolean; sameSite: 'lax'; path: string; maxAge: number }): void;
  setHeader(name: string, value: string): void;
}
export const CurrentUser = createParamDecorator((_value: unknown, context: ExecutionContext): string => context.switchToHttp().getRequest<AuthRequest>().auth!.user.id);
