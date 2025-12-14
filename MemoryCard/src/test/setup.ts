import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    show: vi.fn(),
    hide: vi.fn(),
    setFocus: vi.fn(),
  })),
}));

vi.mock('@tauri-apps/api/menu', () => ({
  Menu: {
    new: vi.fn(() => Promise.resolve({
      setAsAppMenu: vi.fn(),
    })),
  },
  MenuItem: {
    new: vi.fn(() => Promise.resolve({})),
  },
  PredefinedMenuItem: {
    new: vi.fn(() => Promise.resolve({})),
  },
  Submenu: {
    new: vi.fn(() => Promise.resolve({})),
  },
}));

vi.mock('@tauri-apps/plugin-store', () => ({
  Store: vi.fn().mockImplementation(() => ({
    get: vi.fn(() => Promise.resolve(null)),
    set: vi.fn(() => Promise.resolve()),
    save: vi.fn(() => Promise.resolve()),
  })),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: vi.fn(() => Promise.resolve(true)),
  requestPermission: vi.fn(() => Promise.resolve('granted')),
  sendNotification: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-autostart', () => ({
  isEnabled: vi.fn(() => Promise.resolve(false)),
  enable: vi.fn(() => Promise.resolve()),
  disable: vi.fn(() => Promise.resolve()),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(() => Promise.resolve()),
}));
