import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { InvitationsService } from './invitations.service';
@Module({ imports: [DatabaseModule, AuthModule], controllers: [TeamsController], providers: [TeamsService, InvitationsService] })
export class TeamsModule {}
