import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AnalysisProgress from '../src/components/AnalysisProgress.vue';
import AnalysisStatus from '../src/components/AnalysisStatus.vue';
import type { AnalysisStatus as Status } from '@codeaudit/contracts';

describe('États du traitement', () => {
  it.each<Status>(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED'])('décrit %s sans inventer de pourcentage', (status) => {
    const wrapper = mount(AnalysisProgress, { props: { status } });
    expect(wrapper.findAll('li')).toHaveLength(3);
    expect(wrapper.findAll('[aria-current="step"]')).toHaveLength(1);
    expect(wrapper.text()).not.toContain('%');
    if (status === 'FAILED') expect(wrapper.get('[aria-current="step"]').text()).toContain('Traitement en échec');
    else expect(wrapper.text()).toContain('Rapport');
    wrapper.unmount();
  });
  it('distingue la réussite du traitement de la présence de diagnostics', () => {
    const wrapper = mount(AnalysisStatus, { props: { status: 'SUCCEEDED' } });
    expect(wrapper.text()).toBe('Terminée'); expect(wrapper.text()).not.toContain('Sans erreur');
    wrapper.unmount();
  });
});
