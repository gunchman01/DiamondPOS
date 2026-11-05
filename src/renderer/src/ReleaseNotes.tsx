import Markdown from './Markdown'

/** Release notes (a CHANGELOG.md section). hideServerNote drops the "Update the Store Server first" line when a warning is shown elsewhere. */
export default function ReleaseNotes({ text, hideServerNote }: { text: string; hideServerNote?: boolean }) {
  if (!text.trim()) return <p className="muted small">No release notes for this version.</p>
  const shown = hideServerNote
    ? text
        .split(/\r?\n/)
        .filter((l) => !(/^\s*>/.test(l) && /update the store server/i.test(l)))
        .join('\n')
    : text
  return (
    <div className="release-notes">
      <Markdown text={shown} />
    </div>
  )
}
