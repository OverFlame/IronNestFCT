(() => {
  'use strict';

  const tauri = window.__TAURI__;
  const invoke = tauri?.core?.invoke;
  const listen = tauri?.event?.listen;
  const appWindow = tauri?.window?.getCurrentWindow?.();

  window.overlay = {
    hide: () => {
      if (invoke) return invoke('hide_overlay');
      return Promise.resolve();
    },
    quit: () => {
      if (invoke) return invoke('quit');
      return Promise.resolve();
    }
  };

  window.masterPlan = {
    publish: plan => {
      if (invoke) return invoke('update_master_plan', { plan });
      return Promise.resolve();
    },
    get: () => {
      if (invoke) return invoke('get_master_plan');
      return Promise.resolve([]);
    },
    onUpdate: callback => {
      if (listen) return listen('master-plan:update', event => callback(event.payload));
      return Promise.resolve(() => {});
    },
    destroyTarget: targetId => {
      if (invoke) return invoke('destroy_target', { targetId: String(targetId) });
      return Promise.resolve();
    },
    onDestroyTarget: callback => {
      if (listen) return listen('master-plan:destroy-target', event => callback(event.payload));
      return Promise.resolve(() => {});
    }
  };

  window.desktop = {
    ready: () => {
      if (invoke) return invoke('desktop_ready');
      return Promise.resolve();
    },
    getShortcuts: () => {
      if (invoke) return invoke('get_shortcuts');
      return Promise.resolve({ mapShortcut: 'Alt+C', planShortcut: 'Alt+P', toggleShortcut: 'Alt+Q' });
    },
    setShortcuts: bindings => {
      if (invoke) return invoke('set_shortcuts', { bindings });
      return Promise.resolve(bindings);
    }
  };

  document.addEventListener('mousedown', event => {
    if (!appWindow || event.button !== 0) return;
    const region = event.target.closest?.('[data-tauri-drag-region]');
    if (!region || region.getAttribute('data-tauri-drag-region') === 'false') return;
    if (event.target.closest?.('button,input,select,textarea')) return;
    appWindow.startDragging?.();
  });
})();
