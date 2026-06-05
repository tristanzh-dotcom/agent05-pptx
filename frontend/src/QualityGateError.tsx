import { AlertTriangle, CircleX, RotateCcw, Zap } from 'lucide-react'
import type { ReactNode } from 'react'

interface QualityGateErrorProps {
  errors: string[]
  warnings: string[]
  onRetry: () => void
}

export function QualityGateError({ errors, warnings, onRetry }: QualityGateErrorProps) {
  return (
    <section className="max-w-full overflow-hidden rounded-ui border border-border bg-surface p-4 shadow-panel" role="alert" aria-label="生成质检未通过">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-foreground">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-warning bg-background text-warning">
            <AlertTriangle size={17} aria-hidden />
          </span>
          <h2 className="text-base font-semibold">生成质检未通过</h2>
        </div>

        <IssueGroup
          icon={<CircleX size={16} aria-hidden />}
          label={`${errors.length} 项错误`}
          items={errors}
          tone="danger"
        />

        {warnings.length > 0 && (
          <IssueGroup
            icon={<Zap size={16} aria-hidden />}
            label={`${warnings.length} 项提醒`}
            items={warnings}
            tone="warning"
          />
        )}

        <div className="flex justify-end border-t border-border pt-3">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center justify-center gap-2 rounded-control bg-primary px-4 py-2 text-sm text-primaryForeground transition hover:opacity-90"
          >
            <RotateCcw size={16} aria-hidden />
            修改参数重试
          </button>
        </div>
      </div>
    </section>
  )
}

function IssueGroup({ icon, label, items, tone }: { icon: ReactNode; label: string; items: string[]; tone: 'danger' | 'warning' }) {
  const labelToneClass = tone === 'danger' ? 'text-danger' : 'text-warning'
  const itemBorderClass = tone === 'danger' ? 'border-l-danger' : 'border-l-warning'
  return (
    <div className="flex flex-col gap-2">
      <div className={`inline-flex items-center gap-2 text-sm font-semibold ${labelToneClass}`}>
        {icon}
        {label}
      </div>
      <div className="grid gap-2">
        {items.map((item, index) => (
          <div key={`${tone}-${index}`} className={`break-words rounded-ui border border-border border-l-4 bg-background px-3 py-2 text-sm leading-relaxed text-foreground ${itemBorderClass}`}>
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}
