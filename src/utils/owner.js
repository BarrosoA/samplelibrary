// marks this browser as the owner's, which only reveals the STUDIO button; it grants no access
const KEY = 'noluv-owner';

export function readOwnerFlag() {
  try {
    // #/me turns it on for this browser, #/me-off turns it back off
    if (location.hash === '#/me') localStorage.setItem(KEY, '1');
    if (location.hash === '#/me-off') localStorage.removeItem(KEY);
    if (location.hash === '#/me' || location.hash === '#/me-off') history.replaceState(null, '', location.pathname);
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

// registered on the owner's PC by `npm run studio:link`; it runs start-studio.bat
export const STUDIO_LINK = 'noluvstudio://open';
