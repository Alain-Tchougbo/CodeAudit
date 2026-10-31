import type { InvitationPreview, TeamDetail, TeamInvitation, TeamRole, TeamSummary } from '@codeaudit/contracts';
import { apiJson } from './http';
const json = (method: string, value: unknown, signal?: AbortSignal): RequestInit => ({ method, signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
export const teamsApi = {
  list: (signal?: AbortSignal) => apiJson<TeamSummary[]>('/teams', { signal }),
  get: (id: string, signal?: AbortSignal) => apiJson<TeamDetail>(`/teams/${encodeURIComponent(id)}`, { signal }),
  create: (name: string) => apiJson<TeamDetail>('/teams', json('POST', { name })),
  rename: (id: string, name: string) => apiJson<TeamDetail>(`/teams/${encodeURIComponent(id)}`, json('PATCH', { name })),
  delete: (id: string) => apiJson<void>(`/teams/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  membership: (id: string, userId: string, role: TeamRole | null) => apiJson<void>(`/teams/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, role === null ? { method: 'DELETE' } : json('PUT', { role })),
  invitations: (id: string, signal?: AbortSignal) => apiJson<TeamInvitation[]>(`/teams/${encodeURIComponent(id)}/invitations`, { signal }),
  invite: (id: string, email: string, role: 'MEMBER' | 'READER') => apiJson<{ message: string }>(`/teams/${encodeURIComponent(id)}/invitations`, json('POST', { email, role })),
  revoke: (id: string, invitationId: string) => apiJson<void>(`/teams/${encodeURIComponent(id)}/invitations/${encodeURIComponent(invitationId)}`, { method: 'DELETE' }),
  preview: (token: string, signal?: AbortSignal) => apiJson<InvitationPreview>('/team-invitations/preview', json('POST', { token }, signal)),
  accept: (token: string) => apiJson<{ teamId: string }>('/team-invitations/accept', json('POST', { token })),
  share: (projectId: string, teamId: string) => apiJson<void>(`/projects/${encodeURIComponent(projectId)}/team`, json('PUT', { teamId })),
};
export const teamRoleLabel: Record<TeamRole, string> = { ADMIN: 'Administrateur', MEMBER: 'Membre', READER: 'Lecture seule' };
