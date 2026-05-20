import type { ReactNode } from 'react'
import type { ThemeMode } from '../../shared/types'

interface ThemeSwitcherProps {
  value: ThemeMode
  onChange: (mode: ThemeMode) => void
}

function DarkPreview() {
  return (
    <svg className="theme-card-preview" viewBox="0 0 120 80" fill="none" aria-hidden="true">
      <rect width="120" height="80" rx="6" fill="#121e18" />
      <rect x="4" y="4" width="30" height="72" rx="4" fill="#1a2a22" />
      <rect x="7" y="10" width="24" height="5" rx="2" fill="#3f9b6c" opacity="0.4" />
      <rect x="7" y="19" width="24" height="4" rx="2" fill="#ffffff" opacity="0.15" />
      <rect x="7" y="26" width="24" height="4" rx="2" fill="#ffffff" opacity="0.1" />
      <rect x="7" y="33" width="24" height="4" rx="2" fill="#ffffff" opacity="0.1" />
      <rect x="38" y="4" width="78" height="72" rx="4" fill="#14201a" opacity="0.75" />
      <rect x="44" y="12" width="40" height="5" rx="2" fill="#ffffff" opacity="0.2" />
      <rect x="44" y="22" width="66" height="3" rx="1.5" fill="#ffffff" opacity="0.08" />
      <rect x="44" y="28" width="66" height="3" rx="1.5" fill="#ffffff" opacity="0.08" />
      <rect x="44" y="34" width="66" height="3" rx="1.5" fill="#ffffff" opacity="0.08" />
      <rect x="44" y="62" width="22" height="8" rx="3" fill="#3f9b6c" />
    </svg>
  )
}

function LightPreview() {
  return (
    <svg className="theme-card-preview" viewBox="0 0 120 80" fill="none" aria-hidden="true">
      <rect width="120" height="80" rx="6" fill="#f0f5f2" />
      <rect x="4" y="4" width="30" height="72" rx="4" fill="#f8fbf9" stroke="#d2ebdc" strokeWidth="0.5" />
      <rect x="7" y="10" width="24" height="5" rx="2" fill="#3f9b6c" opacity="0.25" />
      <rect x="7" y="19" width="24" height="4" rx="2" fill="#2c3e35" opacity="0.15" />
      <rect x="7" y="26" width="24" height="4" rx="2" fill="#2c3e35" opacity="0.1" />
      <rect x="7" y="33" width="24" height="4" rx="2" fill="#2c3e35" opacity="0.1" />
      <rect x="38" y="4" width="78" height="72" rx="4" fill="#ffffff" stroke="#d2ebdc" strokeWidth="0.5" />
      <rect x="44" y="12" width="40" height="5" rx="2" fill="#2c3e35" opacity="0.2" />
      <rect x="44" y="22" width="66" height="3" rx="1.5" fill="#2c3e35" opacity="0.08" />
      <rect x="44" y="28" width="66" height="3" rx="1.5" fill="#2c3e35" opacity="0.08" />
      <rect x="44" y="34" width="66" height="3" rx="1.5" fill="#2c3e35" opacity="0.08" />
      <rect x="44" y="62" width="22" height="8" rx="3" fill="#3f9b6c" />
    </svg>
  )
}

function SystemPreview() {
  return (
    <svg className="theme-card-preview" viewBox="0 0 120 80" fill="none" aria-hidden="true">
      {/* Left half: light */}
      <clipPath id="left-half">
        <rect x="0" y="0" width="60" height="80" />
      </clipPath>
      <clipPath id="right-half">
        <rect x="60" y="0" width="60" height="80" />
      </clipPath>
      <g clipPath="url(#left-half)">
        <rect width="120" height="80" rx="6" fill="#f0f5f2" />
        <rect x="4" y="4" width="30" height="72" rx="4" fill="#f8fbf9" />
        <rect x="7" y="10" width="24" height="5" rx="2" fill="#3f9b6c" opacity="0.25" />
        <rect x="7" y="19" width="24" height="4" rx="2" fill="#2c3e35" opacity="0.12" />
        <rect x="7" y="26" width="24" height="4" rx="2" fill="#2c3e35" opacity="0.08" />
        <rect x="38" y="4" width="78" height="72" rx="4" fill="#ffffff" />
        <rect x="44" y="12" width="40" height="5" rx="2" fill="#2c3e35" opacity="0.15" />
        <rect x="44" y="62" width="22" height="8" rx="3" fill="#3f9b6c" />
      </g>
      {/* Right half: dark */}
      <g clipPath="url(#right-half)">
        <rect width="120" height="80" rx="6" fill="#121e18" />
        <rect x="4" y="4" width="30" height="72" rx="4" fill="#1a2a22" />
        <rect x="7" y="10" width="24" height="5" rx="2" fill="#3f9b6c" opacity="0.4" />
        <rect x="7" y="19" width="24" height="4" rx="2" fill="#ffffff" opacity="0.12" />
        <rect x="7" y="26" width="24" height="4" rx="2" fill="#ffffff" opacity="0.08" />
        <rect x="38" y="4" width="78" height="72" rx="4" fill="#14201a" opacity="0.75" />
        <rect x="44" y="12" width="40" height="5" rx="2" fill="#ffffff" opacity="0.15" />
        <rect x="44" y="62" width="22" height="8" rx="3" fill="#3f9b6c" />
      </g>
      {/* Divider */}
      <line x1="60" y1="0" x2="60" y2="80" stroke="#3f9b6c" strokeWidth="1" opacity="0.5" />
    </svg>
  )
}

const options: { mode: ThemeMode; label: string; preview: ReactNode }[] = [
  { mode: 'light', label: 'Light', preview: <LightPreview /> },
  { mode: 'dark', label: 'Dark', preview: <DarkPreview /> },
  { mode: 'system', label: 'System', preview: <SystemPreview /> },
]

export function ThemeSwitcher({ value, onChange }: ThemeSwitcherProps) {
  return (
    <div className="theme-cards" role="radiogroup" aria-label="Theme">
      {options.map(opt => (
        <button
          key={opt.mode}
          type="button"
          role="radio"
          aria-checked={value === opt.mode}
          className={`theme-card${value === opt.mode ? ' active' : ''}`}
          onClick={() => onChange(opt.mode)}
        >
          {opt.preview}
          <span className="theme-card-label">{opt.label}</span>
        </button>
      ))}
    </div>
  )
}
