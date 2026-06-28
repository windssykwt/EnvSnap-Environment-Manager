import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { KeyboardEvent, DragEvent } from 'react'
import type { Variable } from '../../shared/types'
import { isValidEnvKey } from '../lib/validation'
import { v4 as uuidv4 } from 'uuid'

interface VariableTableProps {
  variables: Variable[]
  onChange: (variables: Variable[]) => void
  readOnly?: boolean
}

/** Ensure every variable has a stable _uid for React key tracking. */
function ensureUids(vars: Variable[]): Variable[] {
  let changed = false
  const result = vars.map(v => {
    if (v._uid) return v
    changed = true
    return { ...v, _uid: uuidv4() }
  })
  return changed ? result : vars
}

// Names containing any of these tokens will be auto-detected as sensitive
const SENSITIVE_TOKENS = ['SECRET', 'TOKEN', 'PASSWORD', 'PASSWD', 'API_KEY', 'APIKEY', 'PRIVATE_KEY', 'CREDENTIAL']

function looksSensitive(key: string): boolean {
  if (!key) return false
  const upper = key.toUpperCase()
  return SENSITIVE_TOKENS.some(t => upper.includes(t))
}

function shouldMask(v: Variable): boolean {
  if (v.isSecret !== undefined) return v.isSecret
  return looksSensitive(v.key)
}

function isDuplicateKey(key: string, index: number, all: Variable[]): boolean {
  if (!key.trim()) return false
  return all.some((v, i) => i !== index && v.key.trim().toLowerCase() === key.trim().toLowerCase())
}

export function VariableTable({ variables: rawVariables, onChange, readOnly }: VariableTableProps) {
  const variables = useMemo(() => ensureUids(rawVariables), [rawVariables])

  useEffect(() => {
    if (variables !== rawVariables) {
      onChange(variables)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [filter, setFilter] = useState('')
  const lastKeyInputRef = useRef<HTMLInputElement | null>(null)
  const justAddedRef = useRef(false)

  // Drag-and-drop state
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  useEffect(() => {
    if (justAddedRef.current && lastKeyInputRef.current) {
      lastKeyInputRef.current.focus()
      justAddedRef.current = false
    }
  }, [variables.length])

  const handleAdd = () => {
    justAddedRef.current = true
    onChange([...variables, { key: '', value: '', isSecret: false, _uid: uuidv4() }])
  }

  const handleUpdate = (index: number, field: 'key' | 'value', val: string) => {
    onChange(variables.map((v, i) => (i === index ? { ...v, [field]: val } : v)))
  }

  const handleToggleSecret = (index: number) => {
    onChange(variables.map((v, i) => {
      if (i !== index) return v
      const currentlySecret = shouldMask(v)
      return { ...v, isSecret: !currentlySecret }
    }))
  }

  const handleDelete = (index: number) => {
    const uid = variables[index]._uid!
    onChange(variables.filter((_, i) => i !== index))
    setRevealed(prev => {
      const next = { ...prev }
      delete next[uid]
      return next
    })
  }

  const toggleReveal = (uid: string) => {
    setRevealed(prev => ({ ...prev, [uid]: !prev[uid] }))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, index: number, field: 'key' | 'value') => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (field === 'key') {
        const valueInput = (e.currentTarget.parentElement?.querySelector('[data-field="value"]') as HTMLInputElement | null)
        valueInput?.focus()
        return
      }
      if (index === variables.length - 1) {
        handleAdd()
      }
    }
  }

  // --- Drag and Drop ---
  const handleDragStart = useCallback((e: DragEvent<HTMLDivElement>, index: number) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
    if (e.currentTarget) {
      e.currentTarget.style.opacity = '0.5'
    }
  }, [])

  const handleDragEnd = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.currentTarget.style.opacity = '1'
    setDragIndex(null)
    setDragOverIndex(null)
  }, [])

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }, [])

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>, dropIndex: number) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null)
      setDragOverIndex(null)
      return
    }
    const newVars = [...variables]
    const [moved] = newVars.splice(dragIndex, 1)
    newVars.splice(dropIndex, 0, moved)
    onChange(newVars)
    setDragIndex(null)
    setDragOverIndex(null)
  }, [dragIndex, variables, onChange])

  // Compute per-row issues
  const rowIssues = useMemo(() => {
    return variables.map((v, i) => {
      const trimmed = v.key.trim()
      if (!trimmed) return null
      if (!isValidEnvKey(trimmed)) return 'Invalid name. Letters, digits and underscores recommended; "=" and null chars are not allowed.'
      if (isDuplicateKey(v.key, i, variables)) return 'Duplicate name. The last occurrence will win when applied.'
      return null
    })
  }, [variables])

  const invalidCount = rowIssues.filter(Boolean).length

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return variables.map((v, i) => ({ v, i }))
    return variables
      .map((v, i) => ({ v, i }))
      .filter(({ v }) => v.key.toLowerCase().includes(q) || v.value.toLowerCase().includes(q))
  }, [variables, filter])

  const isFiltering = filter.trim().length > 0

  return (
    <section className="vt" aria-label="Environment variables">
      <header className="vt-toolbar">
        <div className="vt-toolbar-meta">
          <span className="vt-count">
            {variables.length} {variables.length === 1 ? 'variable' : 'variables'}
          </span>
          {invalidCount > 0 && (
            <span className="vt-badge vt-badge-warn" title="Rows with validation issues">
              {invalidCount} need attention
            </span>
          )}
        </div>
        {variables.length > 4 && (
          <input
            className="vt-filter"
            type="text"
            placeholder="Filter by name or value"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            aria-label="Filter variables"
          />
        )}
      </header>

      {variables.length === 0 ? (
        <div className="vt-empty">
          <div className="vt-empty-title">No variables yet</div>
          <div className="vt-empty-sub">
            Add a key and value, then press Activate to apply this preset to Windows.
          </div>
          {!readOnly && (
            <button className="btn vt-add-first" onClick={handleAdd}>
              <span className="vt-add-plus">+</span>
              Add your first variable
            </button>
          )}
        </div>
      ) : (
        <>
          <div className={`vt-grid${!readOnly && !isFiltering ? ' vt-grid-draggable' : ''}`} role="table">
            <div className="vt-row vt-head" role="row">
              {!readOnly && !isFiltering && <span role="columnheader" aria-label="Drag handle" />}
              <span role="columnheader">Name</span>
              <span role="columnheader">Value</span>
              <span role="columnheader" aria-label="Actions" />
            </div>

            {visible.length === 0 && (
              <div className="vt-no-match">No variables match "{filter}"</div>
            )}

            {visible.map(({ v, i }) => {
              const issue = rowIssues[i]
              const sensitive = shouldMask(v)
              const uid = v._uid!
              const isRevealed = revealed[uid] ?? false
              const showAsPassword = sensitive && !isRevealed
              const isLast = i === variables.length - 1
              const isDragTarget = dragOverIndex === i && dragIndex !== i

              return (
                <div
                  key={uid}
                  className={`vt-row vt-row-data${issue ? ' is-invalid' : ''}${sensitive ? ' is-secret' : ''}${isDragTarget ? ' is-drag-over' : ''}`}
                  role="row"
                  onDragOver={e => handleDragOver(e, i)}
                  onDrop={e => handleDrop(e, i)}
                >
                  {!readOnly && !isFiltering && (
                    <div
                      className="vt-cell vt-cell-drag"
                      aria-label="Drag to reorder"
                      draggable
                      onDragStart={e => handleDragStart(e, i)}
                      onDragEnd={handleDragEnd}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="vt-drag-handle">
                        <line x1="8" y1="6" x2="8" y2="6" />
                        <line x1="16" y1="6" x2="16" y2="6" />
                        <line x1="8" y1="12" x2="8" y2="12" />
                        <line x1="16" y1="12" x2="16" y2="12" />
                        <line x1="8" y1="18" x2="8" y2="18" />
                        <line x1="16" y1="18" x2="16" y2="18" />
                      </svg>
                    </div>
                  )}
                  <div className="vt-cell vt-cell-key">
                    <input
                      ref={isLast ? lastKeyInputRef : undefined}
                      className="vt-input vt-input-key"
                      type="text"
                      placeholder="VARIABLE_NAME"
                      value={v.key}
                      spellCheck={false}
                      autoCapitalize="characters"
                      autoCorrect="off"
                      onChange={e => handleUpdate(i, 'key', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, i, 'key')}
                      disabled={readOnly}
                      aria-invalid={Boolean(issue)}
                      aria-describedby={issue ? `vt-issue-${i}` : undefined}
                    />
                  </div>
                  <div className="vt-cell vt-cell-value">
                    <input
                      data-field="value"
                      className="vt-input vt-input-value"
                      type={showAsPassword ? 'password' : 'text'}
                      placeholder="value"
                      value={v.value}
                      spellCheck={false}
                      autoCorrect="off"
                      onChange={e => handleUpdate(i, 'value', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, i, 'value')}
                      disabled={readOnly}
                    />
                    {sensitive && (
                      <button
                        type="button"
                        className="vt-icon-btn vt-reveal-toggle"
                        onClick={() => toggleReveal(uid)}
                        title={isRevealed ? 'Hide value' : 'Reveal value'}
                        aria-label={isRevealed ? 'Hide value' : 'Reveal value'}
                        tabIndex={-1}
                      >
                        {isRevealed ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                  <div className="vt-cell vt-cell-actions">
                    {!readOnly && (
                      <>
                        <button
                          type="button"
                          className={`vt-icon-btn vt-secret-toggle${sensitive ? ' is-active' : ''}`}
                          onClick={() => handleToggleSecret(i)}
                          title={sensitive ? 'Mark as non-secret' : 'Mark as secret'}
                          aria-label={sensitive ? 'Mark as non-secret' : 'Mark as secret'}
                          aria-pressed={sensitive}
                          tabIndex={-1}
                        >
                          {sensitive ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                            </svg>
                          )}
                        </button>
                        <button
                          type="button"
                          className="vt-icon-btn vt-delete"
                          onClick={() => handleDelete(i)}
                          title="Delete variable"
                          aria-label={`Delete ${v.key || 'variable'}`}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                  {issue && (
                    <div id={`vt-issue-${i}`} className="vt-issue" role="alert">
                      {issue}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {!readOnly && (
            <button
              type="button"
              className="vt-add"
              onClick={handleAdd}
              aria-label="Add another variable"
            >
              <span className="vt-add-plus">+</span>
              <span>Add variable</span>
            </button>
          )}
        </>
      )}
    </section>
  )
}
