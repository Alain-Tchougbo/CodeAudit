import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import { CurrentUser, Public, type AuthRequest, type CookieResponse } from './auth.types';
import { AuthService } from './auth.service';
import { ForgotPasswordDto, RecoveryService, ResetPasswordDto } from './recovery.service';

@Controller('auth')
export class AccountController {
  constructor(private readonly recovery: RecoveryService, private readonly auth: AuthService) {}
  @Public() @Post('forgot-password') @HttpCode(202)
  forgot(@Body() input: ForgotPasswordDto, @Req() request: AuthRequest) { return this.recovery.forgot(input, request); }
  @Public() @Post('reset-password') @HttpCode(204)
  async reset(@Body() input: ResetPasswordDto, @Req() request: AuthRequest, @Res({ passthrough: true }) response: CookieResponse) { await this.recovery.reset(input, request, response); }
  @Get('sessions')
  sessions(@CurrentUser() userId: string, @Req() request: AuthRequest) { return this.auth.sessions(userId, request); }
  @Delete('sessions/:id') @HttpCode(204)
  async revoke(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() userId: string, @Req() request: AuthRequest, @Res({ passthrough: true }) response: CookieResponse) { await this.auth.revoke(userId, id, request, response); }
  @Post('logout-all') @HttpCode(204)
  async all(@CurrentUser() userId: string, @Res({ passthrough: true }) response: CookieResponse) { await this.auth.logoutAll(userId, response); }
}
