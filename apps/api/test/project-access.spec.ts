import { NotFoundException } from '@nestjs/common';
import { projectPermissions } from '../src/access/project-access';
describe('Permissions des projets personnels et partagés', () => {
  it('conserve la propriété personnelle sans réattribuer les projets historiques sans propriétaire', () => {
    expect(projectPermissions({ ownerId: 'owner', teamId: null }, 'owner')).toEqual({ write: true, admin: true });
    expect(() => projectPermissions({ ownerId: null, teamId: null }, 'owner')).toThrow(NotFoundException);
    expect(() => projectPermissions({ ownerId: 'other', teamId: null }, 'owner')).toThrow(NotFoundException);
  });
  it('retire les droits du créateur d’un projet partagé après retrait de son équipe', () => {
    expect(() => projectPermissions({ ownerId: 'creator', teamId: 'team', team: { id: 'team', name: 'Team', members: [] } }, 'creator')).toThrow(NotFoundException);
  });
  it.each([{ role: 'ADMIN' as const, write: true, admin: true }, { role: 'MEMBER' as const, write: true, admin: false }, { role: 'READER' as const, write: false, admin: false }])('applique le rôle $role du membre courant sans hériter du rôle d’un autre', example => {
    const project = { ownerId: 'creator', teamId: 'team', team: { id: 'team', name: 'Team', members: [{ userId: 'another-admin', role: 'ADMIN' as const }, { userId: 'current', role: example.role }] } };
    expect(projectPermissions(project, 'current')).toEqual({ write: example.write, admin: example.admin });
  });
});
