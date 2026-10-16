// components/SharedBanner.jsx — Across the top of a notebook opened from a link: it isn't one
// of yours until it's saved. Once it is, the same place says so for a moment.
import React from "react"

const LinkIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <path d="M6.5 9.5l3-3M7 11l-1.5 1.5a2.1 2.1 0 0 1-3-3L4 8M9 5l1.5-1.5a2.1 2.1 0 0 1 3 3L12 8" />
  </svg>
)

const CheckIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 8.5l3 3 7-7" />
  </svg>
)

export default function SharedBanner({ saved, onSave, onClose, onDismiss }) {
  if (saved) {
    return (
      <div className="shared-banner shared-banner-saved" role="status">
        <span className="shared-banner-icon">
          <CheckIcon />
        </span>
        <span className="shared-banner-text">
          <strong>Saved to your notebooks</strong> as {saved}.
        </span>
        <div className="shared-banner-actions">
          <button type="button" className="shared-btn" onClick={onDismiss}>
            OK
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="shared-banner" role="region" aria-label="Shared notebook">
      <span className="shared-banner-icon">
        <LinkIcon />
      </span>
      <span className="shared-banner-text">
        <strong>Shared with you.</strong> It isn't in your notebooks. Editing it saves it there.
      </span>
      <div className="shared-banner-actions">
        <button type="button" className="shared-btn shared-btn-primary" onClick={onSave}>
          Save to my notebooks
        </button>
        <button type="button" className="shared-btn" onClick={onClose} title="Back to your notebooks, without saving this one">
          Close
        </button>
      </div>
    </div>
  )
}
