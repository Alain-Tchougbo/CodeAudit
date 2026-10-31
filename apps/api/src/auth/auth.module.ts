import { Controller, Get, Post, Body, Req, Res, HttpCode, Injectable, Module, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { DatabaseModule } from '../database/database.module';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './auth.dto';
import { Public, type AuthRequest, type CookieResponse } from './auth.types';
import { MailService } from './mail.service';
import { RecoveryService } from './recovery.service';
import { AccountController } from './account.controller';
import { ApiKeyService } from './api-key.service';
import { ApiKeyController } from './api-key.controller';
import { AccountSecurityController } from './account-security.controller';
import { AccountSecurityService } from './account-security.service';
import { SecurityCrypto } from './security-crypto';
import { SecurityAuditService } from './security-audit.service';
import { MfaService } from './mfa.service';
import { OAuthService } from './oauth.service';
@Injectable()
class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService, private readonly reflector: Reflector, private readonly keys: ApiKeyService) {}
  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>('codeaudit.public', [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    request.auth = request.headers.authorization !== undefined
      ? await this.keys.authenticate(request, this.reflector.getAllAndOverride<boolean>('codeaudit.api-key', [context.getHandler(), context.getClass()]) === true)
      : await this.auth.authenticate(request, context.switchToHttp().getResponse<CookieResponse>());
    return true;
  }
}
@Controller('auth')
class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public() @Post('register')
  register(@Body() input: RegisterDto, @Req() request: AuthRequest, @Res({ passthrough: true }) response: CookieResponse) { return this.auth.register(input, request, response); }
  @Public() @Post('login') @HttpCode(200)
  login(@Body() input: LoginDto, @Req() request: AuthRequest, @Res({ passthrough: true }) response: CookieResponse) { return this.auth.login(input, request, response); }
  @Get('me')
  me(@Req() request: AuthRequest) { return request.auth; }
  @Public() @Post('logout') @HttpCode(204)
  async logout(@Req() request: AuthRequest, @Res({ passthrough: true }) response: CookieResponse) { await this.auth.logout(request, response); }
}
@Module({ imports: [DatabaseModule], controllers: [AuthController, AccountController, ApiKeyController, AccountSecurityController], providers: [SecurityCrypto, SecurityAuditService, MfaService, AccountSecurityService, OAuthService, AuthService, ApiKeyService, MailService, RecoveryService, { provide: APP_GUARD, useClass: SessionGuard }], exports: [AuthService, MailService] })
export class AuthModule {}
