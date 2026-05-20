<template>
  <v-app>
    <OfflineIndicator />

    <!-- Navigation Drawer for mobile menu -->
    <v-navigation-drawer v-model="drawer" temporary width="280">
      <div class="pa-4 d-flex align-center border-b" style="gap: 12px; background: var(--smax-header-bg); color: white;">
        <img src="/brand/zalocrm-logo.png" alt="ZaloCRM" style="width: 32px; height: 32px; object-fit: contain; background: white; border-radius: 6px; padding: 2px;" />
        <span class="font-weight-bold text-h6">Zalo<span style="color: #00F2FF;">CRM</span></span>
      </div>

      <v-list density="compact" nav>
        <!-- General Pages -->
        <v-list-item to="/" prepend-icon="mdi-view-dashboard-outline" title="Tổng quan (Dashboard)" />
        <v-list-item to="/chat" prepend-icon="mdi-message-text-outline" title="Tin nhắn (Chat)" />
        <v-list-item to="/contacts" prepend-icon="mdi-account-group-outline" title="Khách hàng" />
        <v-list-item to="/appointments" prepend-icon="mdi-calendar-clock-outline" title="Lịch hẹn" />
        <v-list-item to="/friends" prepend-icon="mdi-account-multiple-outline" title="Bạn bè" />
        <v-list-item to="/groups" prepend-icon="mdi-account-group-outline" title="Nhóm Zalo" />
        <v-list-item to="/analytics" prepend-icon="mdi-chart-line" title="Phân tích" />
        <v-list-item to="/reports" prepend-icon="mdi-chart-bar" title="Báo cáo" />

        <v-divider class="my-2" />

        <!-- Automation Group -->
        <v-list-group value="automation">
          <template #activator="{ props }">
            <v-list-item v-bind="props" prepend-icon="mdi-lightning-bolt-outline" title="Automation" />
          </template>
          <v-list-item to="/automation" title="Tổng quan" />
          <v-list-item to="/automation?tab=send-message" title="Nhắn tin tự động" />
          <v-list-item to="/automation?tab=add-friend" title="Kết bạn tự động" />
          <v-list-item to="/automation?tab=follow-up" title="Bám đuổi tự động" />
        </v-list-group>

        <!-- Settings Group -->
        <v-list-group value="settings">
          <template #activator="{ props }">
            <v-list-item v-bind="props" prepend-icon="mdi-cog-outline" title="Cài đặt" />
          </template>
          <v-list-item to="/zalo-accounts" title="Tài khoản Zalo" />
          <v-list-item to="/api-settings" title="API & Webhook" />
          <v-list-item to="/integrations" title="Tích hợp" />
          <v-list-item to="/settings" title="Nhân viên" />
          <v-list-item to="/settings?tab=roles" title="Phân quyền" />
          <v-list-item to="/profile" title="Hồ sơ cá nhân" />
        </v-list-group>
      </v-list>
    </v-navigation-drawer>

    <!-- Slim mobile app bar -->
    <v-app-bar density="compact" flat class="border-b">
      <!-- Hamburger menu toggle button -->
      <v-btn icon size="small" variant="text" class="ml-1 mr-1" @click="drawer = !drawer">
        <v-icon size="22">mdi-menu</v-icon>
      </v-btn>

      <!-- Consistent Logo image -->
      <div class="d-flex align-center" style="gap: 8px;">
        <img src="/brand/zalocrm-logo.png" alt="ZaloCRM" style="width: 24px; height: 24px; object-fit: contain; background: white; border-radius: 4px; padding: 1px;" />
        <span class="font-weight-bold text-body-1">Zalo<span style="color: #00F2FF;">CRM</span></span>
      </div>

      <v-spacer />

      <NotificationBell />
      <v-btn icon size="small" variant="text" @click="toggleTheme">
        <v-icon size="20">{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
      </v-btn>
      <v-btn icon size="small" variant="text" @click="logout">
        <v-icon size="20">mdi-logout</v-icon>
      </v-btn>
    </v-app-bar>

    <!-- Main content with padding for bottom nav -->
    <v-main>
      <div style="padding-bottom: 72px;">
        <slot />
      </div>
    </v-main>

    <BottomNav />
  </v-app>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useTheme } from 'vuetify';
import { useAuthStore } from '@/stores/auth';
import { useRouter } from 'vue-router';
import NotificationBell from '@/components/NotificationBell.vue';
import BottomNav from '@/components/BottomNav.vue';
import OfflineIndicator from '@/components/OfflineIndicator.vue';

const theme = useTheme();
const authStore = useAuthStore();
const router = useRouter();

const drawer = ref(false);
const isDark = ref((localStorage.getItem('theme') || 'smax-light') === 'legacy-dark');

onMounted(() => {
  const saved = localStorage.getItem('theme') || 'smax-light';
  theme.global.name.value = saved;
  isDark.value = saved === 'legacy-dark';
});

function toggleTheme() {
  const next = isDark.value ? 'smax-light' : 'legacy-dark';
  isDark.value = !isDark.value;
  theme.global.name.value = next;
  localStorage.setItem('theme', next);
}

function logout() {
  authStore.logout();
  router.push('/login');
}
</script>
