import { useEffect, useState } from 'react';
import { getAppVersions, type AppVersionSummary } from '../api.js';
import '../styles/version-history.css';

export interface VersionHistoryProps {
  sessionId: string;
  /** Bumped by the parent after a build/refine/revert to force a re-fetch of the list. */
  refreshKey: number;
  onRevert: (version: number) => void;
  reverting: boolean;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/**
 * Version list + revert UI (Epic 5.6): "version list with timestamps +
 * change summary" and "one-click revert" — the current version is clearly
 * marked, and reverting calls the dedicated revert endpoint (which only
 * repoints the active version, never consumes a refinement round).
 */
export function VersionHistory({
  sessionId,
  refreshKey,
  onRevert,
  reverting,
}: VersionHistoryProps) {
  const [open, setOpen] = useState(false);
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const [versions, setVersions] = useState<AppVersionSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    getAppVersions(sessionId).then((result) => {
      if (!cancelled) {
        setActiveVersion(result.activeVersion);
        setVersions(result.versions);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, refreshKey]);

  if (versions.length <= 1) {
    return null;
  }

  return (
    <div className="version-history">
      <button
        type="button"
        className="version-history__toggle"
        onClick={() => setOpen((prev) => !prev)}
      >
        Version history ({versions.length})
      </button>
      {open && (
        <ul className="version-history__list">
          {versions.map((v) => (
            <li key={v.version} className="version-history__item">
              <div className="version-history__meta">
                <span className="version-history__version">
                  v{v.version}
                  {v.version === activeVersion && (
                    <span className="version-history__current"> (current)</span>
                  )}
                </span>
                <span className="version-history__timestamp">{formatTimestamp(v.createdAt)}</span>
              </div>
              <p className="version-history__summary">{v.changeSummary}</p>
              {v.version !== activeVersion && (
                <button
                  type="button"
                  className="version-history__revert"
                  disabled={reverting}
                  onClick={() => onRevert(v.version)}
                >
                  Revert to this version
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
