import { mount, unmount } from 'svelte';
import App from './App.svelte';
import { logo } from './lib/store.js';
import { getSetting } from './lib/db.js';

// Load the custom app logo (if set) before/while UI mounts
getSetting('logo', null).then((v) => logo.set(v)).catch(() => {});
import Confirm from './lib/components/Confirm.svelte';
import ToastHost from './lib/components/ToastHost.svelte';
import Celebrate from './lib/components/Celebrate.svelte';
import { initSparks } from './lib/motion.js';

const app = mount(App, { target: document.getElementById('app') });

document.querySelector('.boot-splash')?.remove();
initSparks(); // position-aware click sparks on every interactive element

const confirmHost = document.createElement('div');
document.body.appendChild(confirmHost);
mount(Confirm, { target: confirmHost });

const toastHost = document.createElement('div');
document.body.appendChild(toastHost);
mount(ToastHost, { target: toastHost });

const celebrateHost = document.createElement('div');
document.body.appendChild(celebrateHost);
mount(Celebrate, { target: celebrateHost });

export default app;
