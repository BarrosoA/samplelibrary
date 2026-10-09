import React, { useState } from 'react';
import { FolderKanban, Plus, ExternalLink, FolderInput, UploadCloud, Loader2 } from 'lucide-react';
import { postJson } from './studioUtils';

export default function StudioHeader({ notify, onNewPack, onImportFolder, onPublished }) {
  const [isPublishing, setIsPublishing] = useState(false);

  const handlePublish = async () => {
    if (isPublishing) return;
    setIsPublishing(true);
    try {
      const data = await postJson('publish', {}, 'Failed to publish');
      if (!data.success) throw new Error(data.error || 'Failed to publish');
      notify(data.message || 'Pushed to GitHub successfully!');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setIsPublishing(false);
      onPublished();
    }
  };

  return (
    <header className="studio-topbar">
      <div className="studio-topbar-left">
        <div className="studio-logo-wrap">
          <FolderKanban size={18} />
          <span className="studio-logo-text">NO LUV - STUDIO WORKSPACE</span>
        </div>
        <span className="studio-badge-dev">LOCAL MANAGER</span>
      </div>

      <div className="studio-topbar-right">
        <button
          className="studio-btn-publish"
          onClick={handlePublish}
          disabled={isPublishing}
          title="Commit and push all changes to GitHub for live Vercel deployment"
        >
          {isPublishing ? <Loader2 size={14} className="spin-icon" /> : <UploadCloud size={14} />}
          <span>{isPublishing ? 'PUBLISHING...' : 'PUBLISH TO LIVE'}</span>
        </button>

        <button className="studio-btn-import" onClick={onNewPack} title="Create blank pack with default cover">
          <Plus size={15} />
          <span>NEW PACK</span>
        </button>

        <button className="studio-btn-subtle" onClick={onImportFolder} title="Import existing folder with WAVs and cover">
          <FolderInput size={14} />
          <span>IMPORT FOLDER</span>
        </button>

        <a href="#/" className="studio-btn-preview-site" title="Open visitor library view">
          <ExternalLink size={14} />
          <span>VIEW VISITOR SITE</span>
        </a>
      </div>
    </header>
  );
}
