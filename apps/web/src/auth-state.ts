import { ref, shallowRef } from 'vue';
import type { AuthProfile, AuthUser } from '@codeaudit/contracts';
export const authState = { user: shallowRef<AuthUser | null>(null), csrf: ref(''), expiresAt: ref(''), ready: ref(false), error: ref(''), version: 0 };
export function acceptProfile(profile: AuthProfile) { authState.version++; authState.user.value = profile.user; authState.csrf.value = profile.csrfToken; authState.expiresAt.value = profile.expiresAt; authState.ready.value = true; authState.error.value = ''; }
export function clearSession() { authState.version++; authState.user.value = null; authState.csrf.value = ''; authState.expiresAt.value = ''; authState.ready.value = true; authState.error.value = ''; }
