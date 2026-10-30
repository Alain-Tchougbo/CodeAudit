import { createRouter, createWebHistory } from 'vue-router';
import ProjectsListView from './views/ProjectsListView.vue';
import ProjectCreateView from './views/ProjectCreateView.vue';
import ProjectDetailView from './views/ProjectDetailView.vue';
import ProjectEditView from './views/ProjectEditView.vue';
import HomeView from './views/HomeView.vue';
import AnalysisDetailView from './views/AnalysisDetailView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: HomeView },
    { path: '/analyses/:id', name: 'analysis-detail', component: AnalysisDetailView },
    { path: '/projects', name: 'projects', component: ProjectsListView },
    { path: '/projects/new', name: 'project-create', component: ProjectCreateView },
    { path: '/projects/:id/edit', name: 'project-edit', component: ProjectEditView },
    { path: '/projects/:id', name: 'project-detail', component: ProjectDetailView },
    { path: '/:pathMatch(.*)*', redirect: '/projects' },
  ],
});
