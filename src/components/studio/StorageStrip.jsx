import React from 'react';
import { formatBytes } from './studioUtils';

function timeAgo(ms) {
  const minutes = Math.round((Date.now() - ms) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function Stat({ label, value, sub, title, children }) {
  return (
    <div className="studio-usage-stat" title={title}>
      <span className="studio-usage-label">{label}</span>
      <span className="studio-usage-value">{value}</span>
      {children}
      {sub && <span className="studio-usage-sub">{sub}</span>}
    </div>
  );
}

// cloudflare doesn't report usage, so these are worked out from what Studio Manager uploaded
function DownloadsStat({ downloads }) {
  if (!downloads) return <Stat label="DOWNLOADS" value="..." sub="checking cloudflare" />;
  if (downloads.error) return <Stat label="DOWNLOADS" value="-" sub="couldn't load" title={downloads.error} />;
  if (!downloads.live) return <Stat label="DOWNLOADS" value="-" sub="starts after next publish" />;

  const samples = Object.values(downloads.tracks).reduce((sum, t) => sum + t.single + t.inPack, 0);
  return (
    <Stat
      label="DOWNLOADS"
      value={samples.toLocaleString()}
      title="Counted by the site since the counter went live. Ad blockers can hide some downloads, and repeat downloads count again."
    />
  );
}

export default function StorageStrip({ storage, downloads }) {
  const shown = storage.live || storage.afterPublish;
  const filePct = Math.min(100, (shown.files / storage.fileLimit) * 100);

  return (
    <div className="studio-usage-strip">
      <DownloadsStat downloads={downloads} />

      <Stat
        label="SAMPLES ON CLOUD"
        value={shown.samples.toLocaleString()}
        sub={
          storage.live && storage.afterPublish.samples !== shown.samples
            ? `${storage.afterPublish.samples.toLocaleString()} after publish`
            : null
        }
        title="Samples stored on Cloudflare. Each sample's preview and WAV count once."
      />

      <Stat label="CLOUD STORAGE" value={formatBytes(shown.bytes)} title="Total size of the live media on Cloudflare Pages. The free plan has no total size limit." />

      <Stat
        label="FILES"
        value={`${shown.files.toLocaleString()} / ${storage.fileLimit.toLocaleString()}`}
        title="Cloudflare Pages allows 20,000 files per deployment on the free plan. Publishing fails past that; nothing is charged."
      >
        <span className="studio-usage-bar">
          <span className="studio-usage-fill" style={{ width: `${filePct}%` }} />
        </span>
      </Stat>

      <Stat
        label="SNAPSHOTS KEPT"
        value={`Last ${storage.keepCount}`}
        title="Older Cloudflare deployments are deleted after each publish. Change with CF_KEEP_DEPLOYMENTS and CF_KEEP_DAYS in .env.local."
      />

      <Stat
        label="LAST PUBLISH"
        value={storage.live ? timeAgo(storage.live.publishedAt) : 'Never'}
        sub={
          storage.live && storage.unpublishedChanges
            ? `pending: ${formatBytes(storage.afterPublish.bytes)} · ${storage.afterPublish.files.toLocaleString()} files`
            : storage.live
              ? 'up to date'
              : 'not published yet'
        }
      />
    </div>
  );
}
