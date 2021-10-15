import {
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  MenuItemConstructorOptions,
  shell,
} from 'electron';
import { assertSome } from '../util';
import { createWindow } from './index';

type ShortcutMap = Record<string, string>;
export const menuMap: Record<number, { menu: Menu; accelerators: ShortcutMap }> = {};

function onMac(
  mac: MenuItemConstructorOptions[],
  otherPlatforms: MenuItemConstructorOptions[] = []
): MenuItemConstructorOptions[] {
  return process.platform === 'darwin' ? mac : otherPlatforms;
}

type PatchType = { click?: string; submenu?: MenuItemConstructorOptionsIpc[] };
export type MenuItemConstructorOptionsIpc = Exclude<MenuItemConstructorOptions, PatchType> &
  PatchType;

export function setMenu(window: BrowserWindow, args: MenuItemConstructorOptionsIpc[]): void {
  const transformMenuTemplate = (
    x: MenuItemConstructorOptionsIpc[]
  ): [MenuItemConstructorOptions[], ShortcutMap] => {
    const accelerators: ShortcutMap = {};

    const transformMenuTemplateInner = (
      x: MenuItemConstructorOptionsIpc[]
    ): MenuItemConstructorOptions[] => {
      return x.map((x) => {
        if (x.accelerator && x.click) {
          accelerators[x.accelerator.toString()] = x.click.toString();
        }
        return {
          ...x,
          click: () => {
            x.click && window.webContents.send('menu-click', x.click);
          },
          registerAccelerator: false,
          submenu: x.submenu && transformMenuTemplateInner(x.submenu),
        };
      });
    };

    const template = transformMenuTemplateInner(x);
    return [template, accelerators];
  };

  const [templateInner, accelerators] = transformMenuTemplate(args);
  const template = [
    ...onMac([
      {
        role: 'appMenu',
      },
    ]),
    ...templateInner,
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        {
          label: window.isMaximized() ? 'Un-Maximize' : 'Maximize',
          click: async function () {
            if (window.isMaximized()) {
              window.unmaximize();
            } else {
              window.maximize();
            }
          },
        },
        { role: 'togglefullscreen' },
        ...onMac(
          [{ type: 'separator' }, { role: 'front' }, { type: 'separator' }],
          [{ role: 'close' }]
        ),
        { role: 'toggleDevTools', accelerator: 'CommandOrControl+Alt+I' },
        {
          label: 'New Window',
          click: function () {
            createWindow();
          },
          accelerator: 'CommandOrControl+N',
        },
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: async () => {
            await shell.openExternal('https://github.com/audapolis/audapolis');
          },
        },
      ],
    },
  ] as MenuItemConstructorOptions[];

  menuMap[window.id] = {
    menu: Menu.buildFromTemplate(template),
    accelerators,
  };
  applyMenu(window);
}

export function applyMenu(window: BrowserWindow): void {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (focusedWindow?.id == window.id) {
    const menu = menuMap[focusedWindow.id];
    Menu.setApplicationMenu(menu.menu);
    unregisterAccelerators();
    Object.entries(menu.accelerators).forEach(([accelerator, uuid]) => {
      globalShortcut.register(accelerator, () => {
        window.webContents.send('menu-click', uuid);
      });
    });
  }
}

export function unregisterAccelerators(): void {
  globalShortcut.unregisterAll();
}

ipcMain.on('set-menu', (event, args) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  assertSome(win);
  setMenu(win, args);
});

ipcMain.on('show-menu', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  assertSome(win);
  menuMap[win.id].menu.popup({
    x: 0,
    y: 55,
  });
});