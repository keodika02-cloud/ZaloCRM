import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router/index';
import { vuetify } from './plugins/vuetify';
import './assets/tokens.css';
import './assets/main.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(vuetify);
app.mount('#app');

// Force CSS recalculation on viewport/orientation changes to prevent stale styles
const forceRecalc = () => {
  const root = document.documentElement;
  root.style.setProperty('--_force-recalc', Math.random().toString());
  // Trigger layout recalculation
  void root.offsetHeight;
};

window.addEventListener('resize', forceRecalc);
window.addEventListener('orientationchange', forceRecalc);

// TODO: Re-enable PWA when vite-plugin-pwa supports vite 8
// if ('serviceWorker' in navigator) {
//   import('virtual:pwa-register').then(({ registerSW }) => {
//     registerSW({ immediate: true });
//   });
// }
