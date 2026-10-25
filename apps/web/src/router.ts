import { createRouter, createWebHistory } from 'vue-router';
import ProjectsListView from './views/ProjectsListView.vue';
import ProjectCreateView from './views/ProjectCreateView.vue';
import ProjectDetailView from './views/ProjectDetailView.vue';
import ProjectEditView from './views/ProjectEditView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/projects' },
    { path: '/projects', name: 'projects', component: ProjectsListView },
    { path: '/projects/new', name: 'project-create', component: ProjectCreateView },
    { path: '/projects/:id/edit', name: 'project-edit', component: ProjectEditView },
    { path: '/projects/:id', name: 'project-detail', component: ProjectDetailView },
    { path: '/:pathMatch(.*)*', redirect: '/projects' },
  ],
});
