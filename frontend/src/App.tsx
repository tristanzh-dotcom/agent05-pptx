import { Check, ChevronDown, ChevronRight, Download, FileText, Loader2, Play, RotateCcw, Trash2, Upload, X } from 'lucide-react'
import type { DragEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { agentAssetUrl, analyzeReference, deleteFile, downloadUrl, getPreview, getVisualPreview, uploadTemplate } from './api'
import { QualityGateError } from './QualityGateError'
import { usePptGeneration } from './usePptGeneration'
import type { GeneratedFile, GeneratePayload, PreviewPayload, ReferenceAnalysisPayload, SlidePreview, SourceAnalysisSlide, TemplateCandidate, VisualPreviewPayload } from './types'

const modeASteps = [
  { stage: 'selecting_template', label: '选择模板' },
  { stage: 'generating_outline', label: '生成大纲' },
  { stage: 'building_pptx', label: '构建 PPTX' },
  { stage: 'quality_check', label: '质检完成' }
] as const

const modeAReferenceSteps = [
  { stage: 'analyzing_reference', label: '分析参考文件' },
  { stage: 'selecting_template', label: '选择模板' },
  { stage: 'generating_outline', label: '生成大纲' },
  { stage: 'building_pptx', label: '构建 PPTX' },
  { stage: 'quality_check', label: '质检完成' }
] as const

const modeBSteps = [
  { stage: 'analyzing_source', label: '分析源文件' },
  { stage: 'editing_pptx', label: '编辑内容' },
  { stage: 'quality_check', label: '质检完成' }
] as const

const FORM_STORAGE_KEY = 'ppt-maker:generation-form:v1'

interface PersistedGenerationForm {
  prompt: string
  pageCount: number
}

interface SourceFileState {
  name: string
  size: number
  relativePath: string
}

interface ReferenceFileState {
  name: string
  size: number
  analysis: ReferenceAnalysisPayload
}

const defaultGenerationForm: PersistedGenerationForm = {
  prompt: '',
  pageCount: 10
}

const PAGE_COUNT_OPTIONS = [5, 8, 10, 12, 15, 20] as const
const HISTORY_META_STORAGE_KEY = 'ppt-maker:generation-history-meta:v1'

type HistoryModeLabel = '模板生成' | '保留编辑' | '参考增强'

interface HistoryPresentationMeta {
  promptPrefix: string
  modeLabel: HistoryModeLabel
}

type HistoryMetaMap = Record<string, HistoryPresentationMeta>

function loadGenerationForm(): PersistedGenerationForm {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FORM_STORAGE_KEY) ?? 'null')
    return {
      prompt: typeof parsed?.prompt === 'string' ? parsed.prompt : defaultGenerationForm.prompt,
      pageCount: Number.isInteger(parsed?.pageCount) && parsed.pageCount > 0 ? parsed.pageCount : defaultGenerationForm.pageCount
    }
  } catch {
    return defaultGenerationForm
  }
}

function loadHistoryMeta(): HistoryMetaMap {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HISTORY_META_STORAGE_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as HistoryMetaMap
  } catch {
    return {}
  }
}

function App() {
  const generation = usePptGeneration()
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const savedHistoryFileIdRef = useRef('')
  const [formReady] = useState(() => loadGenerationForm())
  const [prompt, setPrompt] = useState(formReady.prompt)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [pageCount, setPageCount] = useState(formReady.pageCount)
  const [pageCountMode, setPageCountMode] = useState(PAGE_COUNT_OPTIONS.includes(formReady.pageCount as (typeof PAGE_COUNT_OPTIONS)[number]) ? String(formReady.pageCount) : 'custom')
  const [sourceFile, setSourceFile] = useState<SourceFileState | null>(null)
  const [referenceFile, setReferenceFile] = useState<ReferenceFileState | null>(null)
  const [submittedReferenceAnalysis, setSubmittedReferenceAnalysis] = useState<ReferenceAnalysisPayload | null>(null)
  const [lastSubmittedMeta, setLastSubmittedMeta] = useState<HistoryPresentationMeta | null>(null)
  const [historyMeta, setHistoryMeta] = useState<HistoryMetaMap>(() => loadHistoryMeta())
  const [sourceUploadState, setSourceUploadState] = useState<'idle' | 'uploading' | 'error'>('idle')
  const [sourceUploadError, setSourceUploadError] = useState('')
  const [isNarrowLayout, setIsNarrowLayout] = useState(() => window.innerWidth < 960)
  const [activePanel, setActivePanel] = useState<'generate' | 'preview' | 'history'>('generate')
  const isModeB = sourceFile !== null
  const isReferenceEnhanced = referenceFile !== null

  const payload: GeneratePayload = useMemo(
    () =>
      isModeB
        ? {
            mode: 'template_preserving_edit',
            prompt,
            source_pptx_path: sourceFile?.relativePath ?? '',
            page_count: null,
            style: null
          }
        : {
            mode: 'prompt_to_ppt',
            prompt,
            page_count: pageCount,
            style: '',
            reference_analysis: referenceFile?.analysis
          },
    [isModeB, pageCount, prompt, referenceFile, sourceFile]
  )

  useEffect(() => {
    window.localStorage.setItem(
      FORM_STORAGE_KEY,
      JSON.stringify({
        prompt,
        pageCount
      })
    )
  }, [pageCount, prompt])

  useEffect(() => {
    const resultFileId = generation.result?.file_id ?? ''
    if (generation.stage !== 'complete' || !resultFileId || !lastSubmittedMeta || savedHistoryFileIdRef.current === resultFileId) return
    savedHistoryFileIdRef.current = resultFileId
    setHistoryMeta((current) => {
      const next = { ...current, [resultFileId]: lastSubmittedMeta }
      window.localStorage.setItem(HISTORY_META_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [generation.result?.file_id, generation.stage, lastSubmittedMeta])

  useEffect(() => {
    function updateLayoutMode() {
      setIsNarrowLayout(window.innerWidth < 960)
    }

    window.addEventListener('resize', updateLayoutMode)
    return () => window.removeEventListener('resize', updateLayoutMode)
  }, [])

  useEffect(() => {
    if (isNarrowLayout && generation.stage === 'complete') {
      setActivePanel('preview')
    }
  }, [generation.stage, isNarrowLayout])

  async function handleSourceUpload(file?: File) {
    if (!file) return
    setSourceUploadState('uploading')
    setSourceUploadError('')
    try {
      if (isPptxFile(file)) {
        const result = await uploadTemplate(file)
        setSourceFile({ name: file.name, size: file.size, relativePath: result.relative_path })
        setReferenceFile(null)
      } else {
        const analysis = await analyzeReference(file)
        setReferenceFile({ name: file.name, size: file.size, analysis })
        setSourceFile(null)
      }
      setSourceUploadState('idle')
    } catch {
      setSourceUploadState('error')
      setSourceUploadError('文件上传或分析失败')
    }
  }

  function removeSourceFile() {
    setSourceFile(null)
    setReferenceFile(null)
    setSourceUploadState('idle')
    setSourceUploadError('')
  }

  function handleRetry() {
    generation.clearError()
    promptRef.current?.focus()
  }

  function handlePageCountModeChange(value: string) {
    setPageCountMode(value)
    if (value !== 'custom') {
      setPageCount(Number(value))
    }
  }

  function handleGenerateClick() {
    const modeLabel: HistoryModeLabel = isModeB ? '保留编辑' : isReferenceEnhanced ? '参考增强' : '模板生成'
    setSubmittedReferenceAnalysis(isReferenceEnhanced ? referenceFile?.analysis ?? null : null)
    setLastSubmittedMeta({ modeLabel, promptPrefix: prompt.trim().slice(0, 40) || '生成记录' })
    savedHistoryFileIdRef.current = ''
    generation.generate(payload)
  }

  const generationConsole = (
    <section className="flex min-h-0 flex-col gap-3 overflow-auto rounded-ui border border-border bg-surface p-4 shadow-panel" aria-label="生成控制台">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-foreground">Prompt</h2>
        <ModeBadge mode={isModeB ? 'template_preserving_edit' : isReferenceEnhanced ? 'reference_enhanced' : 'prompt_to_ppt'} />
      </div>
      <SourceFilePanel
        sourceFile={sourceFile}
        referenceFile={referenceFile}
        uploadState={sourceUploadState}
        error={sourceUploadError}
        onUpload={(file) => void handleSourceUpload(file)}
        onRemove={removeSourceFile}
      />
      <label className="sr-only" htmlFor="prompt-input">
        Prompt
      </label>
      <textarea
        ref={promptRef}
        id="prompt-input"
        aria-label="Prompt"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        rows={4}
        className="box-border max-h-56 min-h-24 w-full max-w-full resize-y rounded-ui border border-border bg-background px-4 py-3 text-foreground outline-none transition focus:border-primary focus:shadow-focus"
        placeholder="输入 Prompt，例如：为销售团队生成一份商务深蓝风的季度经营复盘，重点分析渠道增长和客户留存。"
      />
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageCountControl pageCount={pageCount} pageCountMode={pageCountMode} disabled={isModeB} onModeChange={handlePageCountModeChange} onPageCountChange={setPageCount} />
        <button
          type="button"
          onClick={() => (generation.isRunning ? generation.cancel() : handleGenerateClick())}
          disabled={!generation.isRunning && !prompt.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-control bg-primary px-4 py-2 text-primaryForeground transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {generation.isRunning ? <X size={16} aria-hidden /> : <Play size={16} aria-hidden />}
          {generation.isRunning ? 'Cancel' : 'Generate PPT'}
        </button>
      </div>

      {!isModeB && generation.candidates.length > 0 && <TemplateBanner candidates={generation.candidates} onSelect={generation.selectTemplate} />}

      {generation.isRunning && (
        <ProgressSteps
          currentStage={generation.stage}
          message={generation.message}
          mode={isModeB ? 'template_preserving_edit' : 'prompt_to_ppt'}
          hasReference={referenceFile !== null}
          sourceAnalysis={generation.sourceAnalysis}
        />
      )}

      {generation.error && generation.qualityGateError ? (
        <QualityGateError errors={generation.qualityGateError.errors} warnings={generation.qualityGateError.warnings} onRetry={handleRetry} />
      ) : generation.error ? (
        <section className="max-w-full overflow-hidden rounded-ui border border-border bg-background p-4 text-sm text-danger" role="alert">
          {generation.error}
        </section>
      ) : null}

      <HistoryPanel
        files={generation.files}
        historyMeta={historyMeta}
        open={historyOpen}
        onToggle={() => setHistoryOpen((value) => !value)}
        onPreview={async (file) => {
          const preview = await getPreview(file.file_id)
          const visualPreview = await getVisualPreview(file.file_id)
          generation.setPreview(preview, { file_name: file.file_name, file_id: file.file_id, preview }, visualPreview)
          if (isNarrowLayout) setActivePanel('preview')
        }}
        onDelete={async (file) => {
          await deleteFile(file.file_id)
          await generation.refreshFiles()
        }}
      />
    </section>
  )

  const previewWorkspace = (
    <section className="min-h-0 overflow-auto" aria-label="PPT 结果工作区">
      <PreviewPanel preview={generation.preview} visualPreview={generation.visualPreview} resultFileId={generation.result?.file_id} referenceAnalysis={submittedReferenceAnalysis} />
    </section>
  )

  const historyWorkspace = (
    <HistoryPanel
      files={generation.files}
      historyMeta={historyMeta}
      open
      onToggle={() => setHistoryOpen((value) => !value)}
      onPreview={async (file) => {
        const preview = await getPreview(file.file_id)
        const visualPreview = await getVisualPreview(file.file_id)
        generation.setPreview(preview, { file_name: file.file_name, file_id: file.file_id, preview }, visualPreview)
        if (isNarrowLayout) setActivePanel('preview')
      }}
      onDelete={async (file) => {
        await deleteFile(file.file_id)
        await generation.refreshFiles()
      }}
    />
  )

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="mx-4 flex max-w-full flex-col gap-3 pb-6 pt-4 xl:mx-auto xl:w-full xl:max-w-screen-xl">
        <header className="flex flex-col gap-2 rounded-ui border border-border bg-surface px-4 py-3 shadow-panel sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-muted">项目名称 / 可视化编辑</p>
            <h1 className="text-2xl font-semibold text-foreground">PPT生成</h1>
          </div>
          <div className="inline-flex items-center gap-2 text-sm text-muted">
            <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
            后端已连接
          </div>
        </header>

        {isNarrowLayout && (
          <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="PPT Maker 工作区">
            <button type="button" role="tab" aria-selected={activePanel === 'generate'} onClick={() => setActivePanel('generate')} className="rounded-control border border-border px-3 py-2 text-sm">
              生成
            </button>
            <button type="button" role="tab" aria-selected={activePanel === 'preview'} onClick={() => setActivePanel('preview')} className="rounded-control border border-border px-3 py-2 text-sm">
              预览
            </button>
            <button type="button" role="tab" aria-selected={activePanel === 'history'} onClick={() => setActivePanel('history')} className="rounded-control border border-border px-3 py-2 text-sm">
              历史
            </button>
          </div>
        )}

        {isNarrowLayout ? (
          <div className="min-h-0">
            {activePanel === 'generate' && generationConsole}
            {activePanel === 'preview' && previewWorkspace}
            {activePanel === 'history' && historyWorkspace}
          </div>
        ) : (
          <div className="grid min-h-[calc(100vh-9rem)] grid-cols-[minmax(300px,380px)_minmax(0,1fr)] gap-4">
            {generationConsole}
            {previewWorkspace}
          </div>
        )}

        <p className="border-t border-border pt-2 text-center text-xs leading-snug text-muted">内置模板仅供个人学习，企业商用请替换自定义模板</p>
      </div>
    </main>
  )
}

function SourceFilePanel({
  sourceFile,
  referenceFile,
  uploadState,
  error,
  onUpload,
  onRemove
}: {
  sourceFile: SourceFileState | null
  referenceFile: ReferenceFileState | null
  uploadState: 'idle' | 'uploading' | 'error'
  error: string
  onUpload: (file?: File) => void
  onRemove: () => void
}) {
  const uploadedFile = sourceFile ?? referenceFile
  const uploadKind = sourceFile ? '源文件' : referenceFile?.analysis.file_type === 'pdf' ? 'PDF参考' : referenceFile ? '图片参考' : ''

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    onUpload(event.dataTransfer.files?.[0])
  }

  return (
    <section className="rounded-ui border border-border bg-background px-3 py-2" aria-label="参考文件上传">
      {uploadedFile ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <FileText size={16} aria-hidden className="shrink-0 text-muted" />
            <span className="max-w-64 truncate text-sm font-semibold text-foreground">{uploadedFile.name}</span>
            {referenceFile?.analysis.page_count ? <span className="text-xs text-muted">{referenceFile.analysis.page_count}页</span> : null}
            {referenceFile?.analysis.text_chars ? <span className="text-xs text-muted">{referenceFile.analysis.text_chars}字</span> : null}
            {referenceFile?.analysis.dominant_colors.length ? (
              <span className="inline-flex gap-1" aria-label="参考配色">
                {referenceFile.analysis.dominant_colors.slice(0, 3).map((color) => (
                  <span key={color} data-testid="inline-reference-color-swatch" className="h-4 w-6 rounded-control border border-border" style={{ backgroundColor: color }} title={color} />
                ))}
              </span>
            ) : null}
            {referenceFile && !referenceFile.analysis.page_count && !referenceFile.analysis.text_chars && !referenceFile.analysis.dominant_colors.length && uploadKind ? (
              <span className="rounded-control border border-border bg-elevated px-2 py-0.5 text-xs text-muted">{uploadKind}</span>
            ) : null}
            {referenceFile?.analysis.extraction_errors.length ? <span className="text-xs text-muted">{referenceFile.analysis.extraction_errors.join(' / ')}</span> : null}
            <span className="text-xs text-muted">{formatBytes(uploadedFile.size)}</span>
          </div>
          <button type="button" aria-label="移除源文件" onClick={onRemove} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-border text-muted transition hover:text-foreground">
            <X size={16} aria-hidden />
          </button>
        </div>
      ) : (
        <label
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          className="flex cursor-pointer flex-col gap-1 text-sm text-muted transition hover:text-foreground sm:flex-row sm:items-center sm:gap-3"
        >
          <span className="inline-flex items-center gap-2 font-semibold text-foreground">
            <Upload size={16} aria-hidden />
            上传参考文件
          </span>
          <span className="text-xs text-muted">.pptx → 保留模板编辑内容 · .pdf .png → 提取风格配色</span>
          <input
            aria-label="上传参考文件"
            type="file"
            accept=".pptx,.pdf,.png,.jpg,.jpeg"
            className="sr-only"
            disabled={uploadState === 'uploading'}
            onChange={(event) => onUpload(event.target.files?.[0])}
          />
        </label>
      )}
      {uploadState === 'error' && error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </section>
  )
}

function ModeBadge({ mode }: { mode: 'prompt_to_ppt' | 'reference_enhanced' | 'template_preserving_edit' }) {
  const isModeB = mode === 'template_preserving_edit'
  const isReferenceEnhanced = mode === 'reference_enhanced'
  return (
    <span
      className={[
        'inline-flex shrink-0 items-center justify-center rounded-control border px-3 py-2 text-xs font-semibold',
        isModeB || isReferenceEnhanced ? 'border-primary bg-elevated text-primary' : 'border-border bg-surface text-muted'
      ].join(' ')}
    >
      {isModeB ? '保留模板编辑内容' : isReferenceEnhanced ? '从模板生成（参考增强）' : '从模板生成'}
    </span>
  )
}

function PageCountControl({
  pageCount,
  pageCountMode,
  disabled,
  onModeChange,
  onPageCountChange
}: {
  pageCount: number
  pageCountMode: string
  disabled: boolean
  onModeChange: (value: string) => void
  onPageCountChange: (value: number) => void
}) {
  if (disabled) {
    return <div className="text-sm text-muted">页数保留源文件</div>
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="inline-flex items-center gap-2 text-sm text-muted">
        页面
        <select
          aria-label="页面"
          disabled={disabled}
          value={pageCountMode}
          onChange={(event) => onModeChange(event.target.value)}
          className="rounded-control border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-primary disabled:opacity-60"
        >
          {PAGE_COUNT_OPTIONS.map((value) => (
            <option key={value} value={String(value)}>
              {value}
            </option>
          ))}
          <option value="custom">自定义</option>
        </select>
      </label>
      {pageCountMode === 'custom' && (
        <input
          aria-label="自定义页面数量"
          type="number"
          min={1}
          max={60}
          disabled={disabled}
          value={pageCount}
          onChange={(event) => onPageCountChange(Number(event.target.value))}
          className="w-24 rounded-control border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-primary disabled:opacity-60"
        />
      )}
    </div>
  )
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function isPptxFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.pptx')
}

function TemplateBanner({ candidates, onSelect }: { candidates: TemplateCandidate[]; onSelect: (slug: string) => void }) {
  const [startIndex, setStartIndex] = useState(0)
  const visibleCandidates = candidates.slice(startIndex, startIndex + 3)
  const canCycle = candidates.length > 3

  useEffect(() => {
    setStartIndex(0)
  }, [candidates])

  function cycleCandidates() {
    setStartIndex((current) => {
      const next = current + 3
      return next >= candidates.length ? 0 : next
    })
  }

  return (
    <section className="max-w-full overflow-hidden rounded-ui border border-border bg-surface p-4 shadow-panel" aria-label="模板选择">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">模板选择</h2>
        {canCycle && (
          <button type="button" onClick={cycleCandidates} className="inline-flex items-center gap-2 rounded-control border border-border px-3 py-2 text-sm text-muted">
            <RotateCcw size={16} aria-hidden />
            换一批
          </button>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {visibleCandidates.map((candidate) => (
          <article key={candidate.slug} className="overflow-hidden rounded-ui border border-border bg-background">
            {candidate.preview_url && <img className="aspect-video w-full object-cover" src={agentAssetUrl(candidate.preview_url)} alt={`${candidate.name} preview`} />}
            <div className="flex flex-col gap-2 p-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{candidate.name}</h3>
                <p className="line-clamp-2 text-xs text-muted">{candidate.style_description}</p>
              </div>
              <button type="button" onClick={() => onSelect(candidate.slug)} className="rounded-control bg-primary px-3 py-2 text-sm text-primaryForeground">
                选择 {candidate.name}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function ProgressSteps({
  currentStage,
  message,
  mode,
  hasReference,
  sourceAnalysis
}: {
  currentStage: string
  message: string
  mode: 'prompt_to_ppt' | 'template_preserving_edit'
  hasReference: boolean
  sourceAnalysis: SourceAnalysisSlide[]
}) {
  const steps = mode === 'template_preserving_edit' ? modeBSteps : hasReference ? modeAReferenceSteps : modeASteps
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.stage === currentStage)
  )
  return (
    <section className="max-w-full overflow-hidden rounded-ui border border-border bg-surface p-4 shadow-panel" aria-label="生成进度">
      <div className={mode === 'template_preserving_edit' ? 'grid grid-cols-3 gap-2' : hasReference ? 'grid grid-cols-5 gap-2' : 'grid grid-cols-4 gap-2'}>
        {steps.map((step, index) => {
          const completed = index < activeIndex
          const active = index === activeIndex
          return (
            <div key={step.stage} className="flex items-center gap-2">
              <span
                className={[
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs',
                  completed || active ? 'border-primary bg-primary text-primaryForeground' : 'border-border bg-background text-muted'
                ].join(' ')}
              >
                {completed ? <Check size={14} aria-hidden /> : active ? <Loader2 size={14} aria-hidden className="animate-spin" /> : index + 1}
              </span>
              <span className={active ? 'text-sm font-semibold text-foreground' : 'text-sm text-muted'}>{step.label}</span>
            </div>
          )
        })}
      </div>
      {message && <p className="mt-3 border-t border-border pt-3 text-sm text-muted">{message}</p>}
      {mode === 'template_preserving_edit' && sourceAnalysis.length > 0 && <SourceAnalysisOverview slides={sourceAnalysis} />}
    </section>
  )
}

function SourceAnalysisOverview({ slides }: { slides: SourceAnalysisSlide[] }) {
  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="grid gap-2">
        {slides.map((slide) => (
          <div key={slide.slide_number} className="grid gap-2 rounded-ui border border-border bg-background px-3 py-2 text-sm sm:grid-cols-[auto_auto_1fr] sm:items-center">
            <span className="text-xs font-semibold text-foreground">Slide {slide.slide_number}</span>
            <span className="text-xs text-muted">{slide.role || 'content'}</span>
            <span className="truncate text-xs text-muted">{(slide.texts ?? []).slice(0, 3).join(' / ')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PreviewPanel({
  preview,
  visualPreview,
  resultFileId,
  referenceAnalysis
}: {
  preview: PreviewPayload | null
  visualPreview: VisualPreviewPayload | null
  resultFileId?: string
  referenceAnalysis: ReferenceAnalysisPayload | null
}) {
  const [textOpen, setTextOpen] = useState(false)
  const slides = preview?.slides ?? []
  const enhancementSummary = buildEnhancementSummary(referenceAnalysis)
  return (
    <section className="min-h-72 max-w-full overflow-hidden rounded-ui border border-border bg-surface p-4 shadow-panel" aria-label="PPT 成品预览">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">PPT 成品预览</h2>
          {resultFileId && enhancementSummary && <p className="mt-1 text-xs text-muted">{enhancementSummary}</p>}
        </div>
        {resultFileId && (
          <a href={downloadUrl(resultFileId)} className="inline-flex items-center gap-2 rounded-control bg-primary px-3 py-2 text-sm text-primaryForeground">
            <Download size={16} aria-hidden />
            下载 .pptx
          </a>
        )}
      </div>
      {!resultFileId ? (
        <div className="flex min-h-48 items-center justify-center rounded-ui border border-dashed border-border bg-background text-muted">
          输入 Prompt 并点击 Generate
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visualPreview?.preview_url ? (
            <div className="aspect-video w-full overflow-hidden rounded-ui border border-border bg-background">
              <iframe className="h-full w-full border-0" title="PPT 成品预览" src={agentAssetUrl(visualPreview.preview_url)} />
            </div>
          ) : visualPreview?.error ? (
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-ui border border-dashed border-border bg-background px-4 text-center text-sm text-muted">
              <span>{visualPreview.message || '预览生成失败，但 PPTX 可下载'}</span>
              <span className="rounded-control border border-border bg-elevated px-2 py-1 text-xs text-muted">渲染预览不可用</span>
            </div>
          ) : (
            <div className="flex aspect-video w-full items-center justify-center rounded-ui border border-dashed border-border bg-background text-sm text-muted">
              正在生成预览...
            </div>
          )}

          {slides.length > 0 && (
            <div className="rounded-ui border border-border bg-background">
              <button
                type="button"
                onClick={() => setTextOpen((value) => !value)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-foreground"
              >
                文本提取结果
                {textOpen ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
              </button>
              {textOpen && (
                <div className="flex flex-col gap-3 border-t border-border p-3">
                  {slides.map((slide) => (
                    <SlideOutline key={slide.slide_number} slide={slide} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function buildEnhancementSummary(referenceAnalysis: ReferenceAnalysisPayload | null): string {
  if (!referenceAnalysis) return ''
  const segments = [`参考 ${referenceAnalysis.file_name}`]
  const color = referenceAnalysis.dominant_colors[0]
  const template = referenceAnalysis.recommended_templates[0]
  if (color) segments.push(`配色 ${color}`)
  if (template) segments.push(`推荐模板 ${template}`)
  return `Prompt 已增强：${segments.join(' · ')}`
}

function SlideOutline({ slide }: { slide: SlidePreview }) {
  const bullets = slide.bullets ?? slide.texts?.map((item) => item.text).filter(Boolean) ?? []
  return (
    <article className="rounded-ui border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-control border border-border px-2 py-1 text-xs text-muted">Slide {slide.slide_number}</span>
        {slide.role && <span className="rounded-control bg-elevated px-2 py-1 text-xs text-muted">{slide.role}</span>}
      </div>
      <h3 className="mt-2 text-sm font-semibold text-foreground">{slide.title || bullets[0] || `Slide ${slide.slide_number}`}</h3>
      {bullets.length > 0 && (
        <ul className="mt-2 grid gap-1 text-sm text-muted">
          {bullets.map((bullet, index) => (
            <li key={`${slide.slide_number}-${index}`}>{bullet}</li>
          ))}
        </ul>
      )}
    </article>
  )
}

function HistoryPanel({
  files,
  historyMeta,
  open,
  onToggle,
  onPreview,
  onDelete
}: {
  files: GeneratedFile[]
  historyMeta: HistoryMetaMap
  open: boolean
  onToggle: () => void
  onPreview: (file: GeneratedFile) => void
  onDelete: (file: GeneratedFile) => void
}) {
  const latestFiles = files.slice(0, 3)
  return (
    <section className="max-w-full overflow-hidden rounded-ui border border-border bg-background" aria-label="最近历史">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">最近生成</h2>
          <p className="text-xs text-muted">历史生成 ({files.length})</p>
        </div>
        <button type="button" onClick={onToggle} className="inline-flex items-center gap-1 rounded-control border border-border px-2 py-1 text-xs text-muted">
          更多历史
          {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
        </button>
      </div>
      <div className="border-t border-border">
        {latestFiles.length > 0 ? (
          latestFiles.map((file) => <HistorySummaryRow key={file.file_id} file={file} meta={historyMeta[file.file_id]} onPreview={onPreview} />)
        ) : (
          <p className="px-3 py-3 text-sm text-muted">暂无历史</p>
        )}
      </div>
      {open && (
        <div className="border-t border-border">
          {files.map((file) => (
            <HistoryRow key={file.file_id} file={file} meta={historyMeta[file.file_id]} onPreview={onPreview} onDelete={onDelete} />
          ))}
        </div>
      )}
    </section>
  )
}

function HistorySummaryRow({
  file,
  meta,
  onPreview
}: {
  file: GeneratedFile
  meta?: HistoryPresentationMeta
  onPreview: (file: GeneratedFile) => void
}) {
  const label = meta?.modeLabel ?? '模板生成'
  const promptLabel = meta?.promptPrefix ?? '生成记录'
  return (
    <button type="button" onClick={() => onPreview(file)} className="grid w-full gap-1 border-b border-border px-3 py-2 text-left text-sm transition hover:bg-elevated">
      <span className="truncate font-semibold text-foreground">[{label}] {promptLabel}</span>
      <span className="text-xs text-muted">{`${file.generated_at || '未知时间'} · ${file.page_count ?? '-'}页`}</span>
    </button>
  )
}

function HistoryRow({
  file,
  meta,
  onPreview,
  onDelete
}: {
  file: GeneratedFile
  meta?: HistoryPresentationMeta
  onPreview: (file: GeneratedFile) => void
  onDelete: (file: GeneratedFile) => void
}) {
  const label = meta?.modeLabel ?? '模板生成'
  const promptLabel = meta?.promptPrefix ?? '生成记录'
  return (
    <div className="grid gap-3 border-b border-border px-4 py-3 md:grid-cols-[1fr_auto] md:items-center">
              <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
                  <FileText size={16} aria-hidden className="shrink-0 text-muted" />
          <span className="shrink-0 rounded-control border border-border bg-elevated px-2 py-0.5 text-xs text-muted">{label}</span>
          <p className="truncate text-sm font-semibold text-foreground">{promptLabel}</p>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {file.generated_at || '未知时间'} · {file.page_count ?? '-'} 页
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => onPreview(file)} className="rounded-control border border-border px-3 py-2 text-sm text-foreground">
          预览
                </button>
                <a href={downloadUrl(file.file_id)} className="inline-flex items-center gap-2 rounded-control border border-border px-3 py-2 text-sm text-foreground">
                  <Download size={16} aria-hidden />
                  下载
                </a>
                <button
                  type="button"
                  aria-label={`删除 ${file.file_name}`}
                  onClick={() => onDelete(file)}
                  className="inline-flex items-center gap-2 rounded-control border border-border px-3 py-2 text-sm text-muted"
                >
                  <Trash2 size={16} aria-hidden />
                  删除
                </button>
              </div>
            </div>
  )
}

export default App
