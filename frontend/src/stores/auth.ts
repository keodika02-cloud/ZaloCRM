import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '@/api/index';

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  orgId: string;
  orgName: string;
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const needsSetup = ref(false);
  const setupChecked = ref(false);
  const initialized = ref(false);

  const isAuthenticated = computed(() => !!user.value);
  const isOwner = computed(() => user.value?.role === 'owner');
  const isAdmin = computed(() => ['owner', 'admin'].includes(user.value?.role || ''));

  async function checkSetup() {
    if (setupChecked.value) {
      return needsSetup.value;
    }
    const res = await api.get('/setup/status');
    needsSetup.value = res.data.needsSetup;
    setupChecked.value = true;
    return res.data.needsSetup;
  }

  async function setup(data: { orgName: string; fullName: string; email: string; password: string }) {
    const res = await api.post('/setup', data);
    user.value = res.data.user;
    initialized.value = true;
    needsSetup.value = false;
    setupChecked.value = true;
  }

  async function login(email: string, password: string) {
    const res = await api.post('/auth/login', { email, password });
    user.value = res.data.user;
    initialized.value = true;
  }

  async function fetchProfile() {
    try {
      const res = await api.get('/profile');
      user.value = res.data;
    } catch {
      logout();
    }
  }

  async function logout() {
    try {
      if (user.value) {
        await api.post('/auth/logout');
      }
    } catch {
      // Ignore errors on logout
    }
    user.value = null;
    initialized.value = false;
  }

  async function init() {
    if (initialized.value) return;
    await fetchProfile();
    initialized.value = true;
  }

  return { user, needsSetup, isAuthenticated, isOwner, isAdmin, checkSetup, setup, login, fetchProfile, logout, init };
});
