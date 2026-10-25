import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { Project } from '@codeaudit/contracts';
import { ProjectApiError, projectsApi } from '../src/api/projects';
import ProjectsListView from '../src/views/ProjectsListView.vue';
import ProjectCreateView from '../src/views/ProjectCreateView.vue';
import ProjectDetailView from '../src/views/ProjectDetailView.vue';
import ProjectEditView from '../src/views/ProjectEditView.vue';

// Jeux de tests uniquement : aucune donnée de démonstration dans les écrans.
const project: Project = {
  id: 'a0467b83-7961-4ec3-b003-d91ec82f82c0',
  name: 'Projet de test', description: 'Description de test',
  createdAt: '2026-10-30T08:00:00.000Z', updatedAt: '2026-10-30T08:00:00.000Z',
};
const wrappers: VueWrapper[] = [];

async function screen(path = '/projects') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/projects', component: ProjectsListView },
      { path: '/projects/new', component: ProjectCreateView },
      { path: '/projects/:id/edit', component: ProjectEditView },
      { path: '/projects/:id', component: ProjectDetailView },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } });
  wrappers.push(wrapper);
  return { wrapper, router };
}

beforeEach(() => {
  vi.spyOn(projectsApi, 'list').mockResolvedValue([]);
  vi.spyOn(projectsApi, 'get').mockResolvedValue(project);
  vi.spyOn(projectsApi, 'create').mockResolvedValue(project);
  vi.spyOn(projectsApi, 'update').mockResolvedValue(project);
  vi.spyOn(projectsApi, 'delete').mockResolvedValue(undefined);
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
});

describe('Liste des projets', () => {
  it('affiche le chargement puis uniquement les données reçues', async () => {
    let resolve!: (value: Project[]) => void;
    vi.mocked(projectsApi.list).mockReturnValue(new Promise((done) => { resolve = done; }));
    const { wrapper } = await screen();
    expect(wrapper.get('[role="status"]').text()).toContain('Chargement');
    resolve([project]);
    await flushPromises();
    expect(wrapper.get(`a[href="/projects/${project.id}"]`).text()).toBe(project.name);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });

  it('explique la liste vide sans inventer de projets', async () => {
    const { wrapper } = await screen();
    await flushPromises();
    expect(wrapper.text()).toContain('Aucun projet pour le moment');
    expect(wrapper.findAll('li')).toHaveLength(0);
  });

  it('propose une nouvelle tentative après une erreur serveur', async () => {
    vi.mocked(projectsApi.list).mockRejectedValueOnce(new Error('Base indisponible.')).mockResolvedValueOnce([project]);
    const { wrapper } = await screen();
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Base indisponible.');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain(project.name);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
});

describe('Ajout de projet', () => {
  it('valide les espaces avant d’appeler le serveur', async () => {
    const { wrapper } = await screen('/projects/new');
    await wrapper.get('#project-name').setValue('   ');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.get('[role="alert"]').text()).toContain('Le nom doit contenir');
    expect(projectsApi.create).not.toHaveBeenCalled();
  });

  it('envoie le formulaire, bloque le double envoi et annonce le succès', async () => {
    let resolve!: (value: Project) => void;
    vi.mocked(projectsApi.create).mockReturnValue(new Promise((done) => { resolve = done; }));
    const { wrapper, router } = await screen('/projects/new');
    await wrapper.get('#project-name').setValue('  Projet de test  ');
    await wrapper.get('#project-description').setValue(' Description de test ');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined();
    expect(projectsApi.create).toHaveBeenCalledExactlyOnceWith({ name: project.name, description: project.description });
    resolve(project);
    await flushPromises();
    expect(router.currentRoute.value.path).toBe(`/projects/${project.id}`);
    expect(wrapper.text()).toContain('Projet créé.');
  });

  it('préserve le formulaire lorsque l’API refuse la création', async () => {
    vi.mocked(projectsApi.create).mockRejectedValue(new ProjectApiError('Données invalides.', 400, 'VALIDATION_ERROR'));
    const { wrapper } = await screen('/projects/new');
    await wrapper.get('#project-name').setValue('Mon projet');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Données invalides.');
    expect((wrapper.get('#project-name').element as HTMLInputElement).value).toBe('Mon projet');
    expect(wrapper.get('fieldset').attributes('disabled')).toBeUndefined();
  });
});

describe('Détail et modification', () => {
  it('affiche une ressource absente et ne propose aucune modification', async () => {
    vi.mocked(projectsApi.get).mockRejectedValue(new ProjectApiError('Projet introuvable.', 404, 'PROJECT_NOT_FOUND'));
    const { wrapper } = await screen(`/projects/${project.id}`);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Projet introuvable.');
    expect(wrapper.find('a[href$="/edit"]').exists()).toBe(false);
  });

  it('modifie les données chargées et permet d’effacer la description', async () => {
    const updated = { ...project, name: 'Nouveau nom', description: null };
    vi.mocked(projectsApi.update).mockResolvedValue(updated);
    vi.mocked(projectsApi.get).mockResolvedValueOnce(project).mockResolvedValue(updated);
    const { wrapper, router } = await screen(`/projects/${project.id}/edit`);
    await flushPromises();
    expect((wrapper.get('#project-name').element as HTMLInputElement).value).toBe(project.name);
    await wrapper.get('#project-name').setValue('Nouveau nom');
    await wrapper.get('#project-description').setValue('');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(projectsApi.update).toHaveBeenCalledExactlyOnceWith(project.id, { name: 'Nouveau nom', description: null });
    expect(router.currentRoute.value.path).toBe(`/projects/${project.id}`);
    expect(wrapper.text()).toContain('Projet modifié.');
    expect(wrapper.get('h1').text()).toBe('Nouveau nom');
  });

  it('ignore une ancienne réponse après changement de projet', async () => {
    let resolve!: (value: Project) => void;
    const second = { ...project, id: 'second', name: 'Second projet' };
    vi.mocked(projectsApi.get)
      .mockReturnValueOnce(new Promise((done) => { resolve = done; }))
      .mockResolvedValueOnce(second);
    const { wrapper, router } = await screen(`/projects/${project.id}`);
    await router.push('/projects/second');
    await flushPromises();
    resolve(project);
    await flushPromises();
    expect(wrapper.get('h1').text()).toBe(second.name);
  });
});

describe('Suppression', () => {
  it('permet d’annuler avant tout appel API', async () => {
    const { wrapper } = await screen(`/projects/${project.id}`);
    await flushPromises();
    await wrapper.get('button').trigger('click');
    const cancel = wrapper.findAll('button').find((button) => button.text() === 'Annuler');
    await cancel!.trigger('click');
    expect(projectsApi.delete).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain('Confirmer la suppression');
  });

  it('préserve le projet en conflit, puis confirme une suppression réussie', async () => {
    vi.mocked(projectsApi.delete)
      .mockRejectedValueOnce(new ProjectApiError('Une analyse est en cours.', 409, 'PROJECT_BUSY'))
      .mockResolvedValueOnce(undefined);
    const { wrapper, router } = await screen(`/projects/${project.id}`);
    await flushPromises();
    await wrapper.get('button').trigger('click');
    const confirm = () => wrapper.findAll('button').find((button) => button.text() === 'Confirmer la suppression')!;
    await confirm().trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Une analyse est en cours.');
    expect(wrapper.get('h1').text()).toBe(project.name);
    await confirm().trigger('click');
    await flushPromises();
    expect(projectsApi.delete).toHaveBeenCalledWith(project.id);
    expect(router.currentRoute.value.path).toBe('/projects');
    expect(wrapper.text()).toContain('Projet supprimé.');
  });
});
