import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Variable } from '../../shared/types'
import { isValidEnvKey } from '../lib/validation'

interface VariableTableProps {
  variables: Variable[]
  onChange: (variables: Variable[]) => void
  readOnly?: boolean
}

// Names containing any of these tokens will have their value masked by
// default. Users can still toggle visibility per-row.
const SENSITIVE_TOKENS = ['SECRET', 'TOKEN', 'PASSWORD', 'PASSWD', 'API_KEY', 'APIKEY', 'PRIVATE_KEY', 'CREDENTIAL']

function looksSensitive(key: string): boolean {
  if (!key) return false
  const upper = key.toUpperCase()
  return SENSITIVE_TOKENS.some(t => upper.includes(t))
}

function isDuplicateKey(key: string, index: number, all: Variable[]): boolean {
  if (!key.trim()) return false
  return all.some((v, i) => i !== index && v.key.trim().toLowerCase() === key.trim().toLowerCase())
}

export function VariableTable({ variables, onChange, readOnly }: VariableTableProps) {
  const [revealed, setRevealed] = useState<Record<number, boolean>>({})
  const [filter, setFilter] = useState('')
  const lastKeyInputRef = useRef<HTMLInputElement | null>(null)
  const justAddedRef = useRef(false)

  // Autofocus the new row's key input after add.
  useEffect(() => {
    if (justAddedRef.current && lastKeyInputRef.current) {
      lastKeyInputRef.current.focus()
      justAddedRef.current = false
    }
  }, [variables.length])

  const handleAdd = () => {
    justAddedRef.current = true
    onChange([...variables, { key: '', value: '' }])
  }

  const handleUpdate = (index: number, field: 'key' | 'value', val: string) => {
    onChange(variables.map((v, i) => (i === index ? { ...v, [field]: val } : v)))
  }

  const handleDelete = (index: number) => {
    onChange(variables.filter((_, i) => i !== index))
    setRevealed(prev => {
      const next: Record<number, boolean> = {}
      Object.entries(prev).forEach(([k, v]) => {
        const i = Number(k)
        if (i < index) next[i] = v
        else if (i > index) next[i - 1] = v
      })
      return next
    })
  }

  const toggleReveal = (index: number) => {
    setRevealed(prev => ({ ...prev, [index]: !prev[index] }))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, index: number, field: 'key' | 'value') => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (field === 'key') {
        // Move from key to value on the same row.
        const valueInput = (e.currentTarget.parentElement?.querySelector('[data-field="value"]') as HTMLInputElement | null)
        valueInput?.focus()
        return
      }
      // Enter on value: append a new row if we're on the last one.
      if (index === variables.length - 1) {
        handleAdd()
      }
    }
  }

  // Compute per-row issues once for the whole list.
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

  // Filter applies to the displayed slice, but we keep the underlying index
  // so edits/deletes hit the right element.
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return variables.map((v, i) => ({ v, i }))
    return variables
      .map((v, i) => ({ v, i }))
      .filter(({ v }) => v.key.toLowerCase().includes(q) || v.value.toLowerCase().includes(q))
  }, [variables, filter])

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
            <button className="btn btn-primary" onClick={handleAdd}>
              Add your first variable
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="vt-grid" role="table">
            <div className="vt-row vt-head" role="row">
              <span role="columnheader">Name</span>
              <span role="columnheader">Value</span>
              <span role="columnheader" aria-label="Actions" />
            </div>

            {visible.length === 0 && (
              <div className="vt-no-match">No variables match "{filter}"</div>
            )}

            {visible.map(({ v, i }) => {
              const issue = rowIssues[i]
              const sensitive = looksSensitive(v.key)
              const isRevealed = revealed[i] ?? false
              const showAsPassword = sensitive && !isRevealed
              const isLast = i === variables.length - 1

              return (
                <div
                  key={i}
                  className={`vt-row vt-row-data${issue ? ' is-invalid' : ''}`}
                  role="row"
                >
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
                        className="vt-icon-btn"
                        onClick={() => toggleReveal(i)}
                        title={isRevealed ? 'Hide value' : 'Reveal value'}
                        aria-label={isRevealed ? 'Hide value' : 'Reveal value'}
                        tabIndex={-1}
                      >
                        {isRevealed ? '🔒' : '👁'}
                      </button>
                    )}
                  </div>
                  <div className="vt-cell vt-cell-actions">
                    {!readOnly && (
                      <button
                        type="button"
                        className="vt-icon-btn vt-delete"
                        onClick={() => handleDelete(i)}
                        title="Delete variable"
                        aria-label={`Delete ${v.key || 'variable'}`}
                      >
                        ×
                      </button>
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
