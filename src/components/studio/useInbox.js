import { useState, useEffect, useCallback } from 'react';
import { postJson } from './studioUtils';

// loops exported to the compositions folder that are not in the library yet
export default function useInbox({ notify, onLibraryChanged }) {
  const [inbox, setInbox] = useState({ enabled: false, items: [] });
  const [busy, setBusy] = useState({});

  const fetchInbox = useCallback(() => {
    postJson('inbox')
      .then((data) => data && Array.isArray(data.items) && setInbox(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchInbox();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') fetchInbox();
    }, 5000);
    return () => clearInterval(timer);
  }, [fetchInbox]);

  const request = async (endpoint, item, payload, busyLabel) => {
    setBusy((prev) => ({ ...prev, [item.path]: busyLabel }));
    try {
      return await postJson(endpoint, { path: item.path, ...payload });
    } finally {
      setBusy((prev) => {
        const next = { ...prev };
        delete next[item.path];
        return next;
      });
      fetchInbox();
    }
  };

  const addToPack = async (item, targetPack) => {
    if (item.writing || busy[item.path]) return;
    try {
      await request('inbox-add', item, { packId: targetPack.id }, 'adding');
      notify(`Added "${item.title}" to ${targetPack.name}`);
      onLibraryChanged();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const update = async (item) => {
    const names = item.updates.map((t) => `"${t.title}" (${t.packName})`).join(', ');
    if (!window.confirm(`Replace ${names} with this new export? The site will get the new version when you publish.`)) return;
    try {
      await request('inbox-update', item, {}, 'updating');
      notify(`Updated ${names}`);
      onLibraryChanged();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const dismiss = async (item) => {
    try {
      await request('inbox-dismiss', item, {}, 'dismissing');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return { inbox, busy, addToPack, update, dismiss };
}
