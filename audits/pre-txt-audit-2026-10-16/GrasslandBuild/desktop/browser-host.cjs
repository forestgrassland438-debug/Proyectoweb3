'use strict';
const path = require('node:path');
const LOGIN_URL = 'https://app.grasslandforest.com/';
function installedBrowsers(platform, env, exists) {
  const candidates = [];
  const add = (id, name, locations) => {
    const executable = locations.find(p => p && exists(p));
    if (executable) candidates.push({ id, name, path: executable });
  };
  if (platform === 'win32') {
    const roots = [env.ProgramFiles || 'C:/Program Files', env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', env.LOCALAPPDATA];
    const paths = suffix => roots.filter(Boolean).map(root => path.join(root, suffix));
    add('brave', 'Brave', paths('BraveSoftware/Brave-Browser/Application/brave.exe'));
    add('chrome', 'Google Chrome', paths('Google/Chrome/Application/chrome.exe'));
    add('edge', 'Microsoft Edge', paths('Microsoft/Edge/Application/msedge.exe'));
    add('firefox', 'Firefox', paths('Mozilla Firefox/firefox.exe'));
    const programs = env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs');
    const operaRoots = [...roots, programs].filter(Boolean);
    add('opera', 'Opera', operaRoots.map(root => path.join(root, 'Opera/launcher.exe')));
    add('opera-gx', 'Opera GX', operaRoots.map(root => path.join(root, 'Opera GX/launcher.exe')));
  } else if (platform === 'darwin') {
    add('brave', 'Brave', ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser']);
    add('chrome', 'Google Chrome', ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']);
    add('edge', 'Microsoft Edge', ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']);
    add('firefox', 'Firefox', ['/Applications/Firefox.app/Contents/MacOS/firefox']);
    add('opera', 'Opera', ['/Applications/Opera.app/Contents/MacOS/Opera']);
    add('opera-gx', 'Opera GX', ['/Applications/Opera GX.app/Contents/MacOS/Opera GX']);
  } else if (platform === 'linux') {
    add('brave', 'Brave', ['/usr/bin/brave-browser', '/opt/brave.com/brave/brave-browser']);
    add('chrome', 'Google Chrome', ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome']);
    add('edge', 'Microsoft Edge', ['/usr/bin/microsoft-edge-stable', '/usr/bin/microsoft-edge']);
    add('chromium', 'Chromium', ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium']);
    add('firefox', 'Firefox', ['/usr/bin/firefox', '/snap/bin/firefox']);
    add('opera', 'Opera', ['/usr/bin/opera', '/usr/bin/opera-stable']);
  }
  return candidates;
}
function launchArguments(browserId) {
  // Ventana normal para conservar los popups de captcha/OAuth/wallets.
  return browserId === 'firefox' ? ['-new-window', LOGIN_URL] : ['--new-window', LOGIN_URL];
}
module.exports = { LOGIN_URL, installedBrowsers, launchArguments };
