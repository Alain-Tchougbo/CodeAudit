import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Req } from '@nestjs/common';
import { CurrentUser, type AuthRequest } from '../auth/auth.types';
import { TeamsService } from './teams.service';
import { InvitationsService } from './invitations.service';
import { InvitationTokenDto, InviteDto, MemberRoleDto, ShareProjectDto, TeamNameDto } from './team.dto';
@Controller()
export class TeamsController {
  constructor(private readonly teams: TeamsService, private readonly invitations: InvitationsService) {}
  @Post('teams') create(@Body() input: TeamNameDto, @CurrentUser() userId: string) { return this.teams.create(input.name, userId); }
  @Get('teams') list(@CurrentUser() userId: string) { return this.teams.list(userId); }
  @Get('teams/:id') get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() userId: string) { return this.teams.get(id, userId); }
  @Patch('teams/:id') rename(@Param('id', ParseUUIDPipe) id: string, @Body() input: TeamNameDto, @CurrentUser() userId: string) { return this.teams.rename(id, input.name, userId); }
  @Delete('teams/:id') @HttpCode(204) async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() userId: string) { await this.teams.delete(id, userId); }
  @Put('teams/:id/members/:userId') @HttpCode(204) async role(@Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) targetId: string, @Body() input: MemberRoleDto, @CurrentUser() userId: string) { await this.teams.membership(id, targetId, input.role, userId); }
  @Delete('teams/:id/members/:userId') @HttpCode(204) async removeMember(@Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) targetId: string, @CurrentUser() userId: string) { await this.teams.membership(id, targetId, null, userId); }
  @Put('projects/:id/team') @HttpCode(204) async share(@Param('id', ParseUUIDPipe) id: string, @Body() input: ShareProjectDto, @CurrentUser() userId: string) { await this.teams.share(id, input.teamId, userId); }
  @Get('teams/:id/invitations') listInvites(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() userId: string) { return this.invitations.list(id, userId); }
  @Post('teams/:id/invitations') @HttpCode(202) async invite(@Param('id', ParseUUIDPipe) id: string, @Body() input: InviteDto, @CurrentUser() userId: string, @Req() request: AuthRequest) { await this.invitations.create(id, input, userId, request); return { message: 'Invitation envoyée. L’accès sera accordé après acceptation du lien.' }; }
  @Delete('teams/:id/invitations/:invitationId') @HttpCode(204) async revoke(@Param('id', ParseUUIDPipe) id: string, @Param('invitationId', ParseUUIDPipe) invitationId: string, @CurrentUser() userId: string) { await this.invitations.revoke(id, invitationId, userId); }
  @Post('team-invitations/preview') @HttpCode(200) preview(@Body() input: InvitationTokenDto, @CurrentUser() userId: string) { return this.invitations.preview(input.token, userId); }
  @Post('team-invitations/accept') @HttpCode(200) accept(@Body() input: InvitationTokenDto, @CurrentUser() userId: string) { return this.invitations.accept(input.token, userId); }
}
