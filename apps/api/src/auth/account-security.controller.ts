import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { CurrentUser, Public, type AuthRequest, type CookieResponse } from './auth.types';
import { AuthService } from './auth.service';
import { AccountSecurityService } from './account-security.service';
import { ChangeEmailDto, ChangePasswordDto, CredentialsDto, DeleteAccountDto, EditProfileDto, EventsQuery, MfaConfirmDto, OAuthCallbackDto, OAuthMfaDto, VerificationDto } from './account-security.dto';
import { MfaService } from './mfa.service';
import { OAuthService } from './oauth.service';
interface Response extends CookieResponse { redirect(status: number, url: string): void; send(value: string): void }
@Controller('auth')
export class AccountSecurityController {
  constructor(private readonly security: AccountSecurityService, private readonly auth: AuthService, private readonly mfa: MfaService, private readonly oauth: OAuthService) {}
  @Get('security') state(@CurrentUser() userId: string) { return this.security.state(userId); }
  @Patch('profile') async profile(@CurrentUser() userId: string, @Body() input: EditProfileDto, @Req() request: AuthRequest, @Res({ passthrough: true }) response: CookieResponse) { await this.security.profile(userId, input.name); return this.auth.authenticate(request, response); }
  @Post('verification-request') @HttpCode(202) verifyRequest(@CurrentUser() userId: string, @Req() request: AuthRequest) { return this.security.verification(userId, request); }
  @Post('change-email') @HttpCode(202) changeEmail(@CurrentUser() userId: string, @Body() input: ChangeEmailDto, @Req() request: AuthRequest) { return this.security.verification(userId, request, input); }
  @Public() @Post('verify-email') @HttpCode(200) async verifyEmail(@Body() input: VerificationDto, @Req() request: AuthRequest, @Res({ passthrough: true }) response: CookieResponse) { const result = await this.security.confirmEmail(input.token, request); if (result.changed) this.auth.clearCookie(response); return result; }
  @Post('change-password') @HttpCode(204) async password(@CurrentUser() userId: string, @Body() input: ChangePasswordDto, @Req() request: AuthRequest, @Res({ passthrough: true }) response: CookieResponse) { await this.security.password(userId, input, request); this.auth.clearCookie(response); }
  @Post('mfa/setup') @HttpCode(200) async setup(@CurrentUser() userId: string, @Body() input: CredentialsDto, @Req() request: AuthRequest) { const user = await this.auth.sensitive(userId, input, request); return this.mfa.setup(userId, user.email, user.authVersion); }
  @Post('mfa/enable') @HttpCode(200) async enable(@CurrentUser() userId: string, @Body() input: MfaConfirmDto, @Req() request: AuthRequest, @Res({ passthrough: true }) response: CookieResponse) { await this.auth.limit(request, 'reauth', userId); const { recoveryCodes, authVersion } = await this.mfa.enable(userId, input.code); return { recoveryCodes, profile: await this.auth.issue(userId, request, response, authVersion) }; }
  @Post('mfa/disable') @HttpCode(204) async disable(@CurrentUser() userId: string, @Body() input: CredentialsDto, @Req() request: AuthRequest, @Res({ passthrough: true }) response: CookieResponse) { const user = await this.auth.sensitive(userId, input, request); await this.mfa.disable(userId, user.authVersion); this.auth.clearCookie(response); }
  @Get('security-events') events(@CurrentUser() userId: string, @Query() query: EventsQuery) { return this.security.events(userId, query.cursor); }
  @Post('data-export') @HttpCode(200) async export(@CurrentUser() userId: string, @Body() input: CredentialsDto, @Req() request: AuthRequest, @Res() response: Response) { const json = await this.security.export(userId, input, request); response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('Content-Disposition', 'attachment; filename="codeaudit-account-v1.json"'); response.send(json); }
  @Delete('account') @HttpCode(204) async delete(@CurrentUser() userId: string, @Body() input: DeleteAccountDto, @Req() request: AuthRequest, @Res({ passthrough: true }) response: CookieResponse) { await this.security.delete(userId, input, request); this.auth.clearCookie(response); }
  @Public() @Get('oauth/providers') providers() { return this.security.providers(); }
  @Public() @Get('oauth/:provider/start') async start(@Param('provider') value: string, @Req() request: AuthRequest, @Res() response: Response) { const { url } = await this.oauth.start(this.oauth.provider(value), request, response); response.redirect(302, url); }
  @Post('oauth/:provider/link') @HttpCode(200) async link(@Param('provider') value: string, @CurrentUser() userId: string, @Body() input: CredentialsDto, @Req() request: AuthRequest, @Res({ passthrough: true }) response: CookieResponse) { const user = await this.auth.sensitive(userId, input, request); return this.oauth.start(this.oauth.provider(value), request, response, { userId, authVersion: user.authVersion }); }
  @Delete('oauth/:provider/link') @HttpCode(204) async unlink(@Param('provider') value: string, @CurrentUser() userId: string, @Body() input: CredentialsDto, @Req() request: AuthRequest, @Res({ passthrough: true }) response: CookieResponse) { const user = await this.auth.sensitive(userId, input, request); await this.oauth.unlink(userId, this.oauth.provider(value), user.authVersion); this.auth.clearCookie(response); }
  @Public() @Post('oauth/mfa') @HttpCode(200) finishMfa(@Body() input: OAuthMfaDto, @Req() request: AuthRequest, @Res({ passthrough: true }) response: CookieResponse) { return this.oauth.finishMfa(input.code, request, response); }
  @Public() @Get('oauth/:provider/callback') async callback(@Param('provider') value: string, @Query() query: OAuthCallbackDto, @Req() request: AuthRequest, @Res() response: Response) {
    try { response.redirect(302, await this.oauth.callback(this.oauth.provider(value), query.state, query.code, !!query.error, request, response)); }
    catch { const origin = new URL(process.env.AUTH_APP_ORIGIN ?? 'http://127.0.0.1:5173').origin; response.redirect(302, `${origin}/login?oauthError=failed`); }
  }
}
