import { ref } from 'vue';
// Keep the email capability in memory, never in a query string or persistent storage.
export const invitationToken = ref('');
