import { createRouter, createWebHistory } from 'vue-router';
import ProjectsListView from './views/ProjectsListView.vue';
import ProjectCreateView from './views/ProjectCreateView.vue';
import ProjectDetailView from './views/ProjectDetailView.vue';
import ProjectEditView from './views/ProjectEditView.vue';
import HomeView from './views/HomeView.vue';
import AnalysisDetailView from './views/AnalysisDetailView.vue';
import AuthView from './views/AuthView.vue';
import ProfileView from './views/ProfileView.vue';
import AnalysisComparisonView from './views/AnalysisComparisonView.vue';
import { restoreSession } from './auth';
import { authState } from './auth-state';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: AuthView, meta: { public: true } },
    { path: '/register', name: 'register', component: AuthView, meta: { public: true } },
    { path: '/profile', name: 'profile', component: ProfileView },
    { path: '/', name: 'dashboard', component: HomeView },
    { path: '/analyses/:id', name: 'analysis-detail', component: AnalysisDetailView },
    { path: '/analyses/:id/compare', name: 'analysis-comparison', component: AnalysisComparisonView },
    { path: '/projects', name: 'projects', component: ProjectsListView },
    { path: '/projects/new', name: 'project-create', component: ProjectCreateView },
    { path: '/projects/:id/edit', name: 'project-edit', component: ProjectEditView },
    { path: '/projects/:id', name: 'project-detail', component: ProjectDetailView },
    { path: '/:pathMatch(.*)*', redirect: '/projects' },
  ],
});
router.beforeEach(async (to) => {
  try { await restoreSession(); } catch { if (!to.meta.public) return { name: 'login', query: { redirect: to.fullPath } }; }
  if (!to.meta.public && !authState.user.value) return { name: 'login', query: { redirect: to.fullPath } };
  if (to.meta.public && authState.user.value) return '/';
});
window.addEventListener('codeaudit-session-expired', () => {
  if (!router.currentRoute.value.meta.public) void router.replace({ name: 'login', query: { reason: 'expired', redirect: router.currentRoute.value.fullPath } });
});
