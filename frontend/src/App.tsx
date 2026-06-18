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

interface UploadQueueItem {
  id: string
  name: string
  size: number
  typeLabel: 'PPTX源文件' | 'PDF参考' | '图片参考'
  pageCount?: number | null
  textChars?: number | null
  dominantColors?: string[]
  extractionErrors?: string[]
}

const defaultGenerationForm: PersistedGenerationForm = {
  prompt: ''
}

const HISTORY_META_STORAGE_KEY = 'ppt-maker:generation-history-meta:v1'
const WORKBENCH_TABS_BREAKPOINT = 860

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
      prompt: typeof parsed?.prompt === 'string' ? parsed.prompt : defaultGenerationForm.prompt
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
  const [sourceFile, setSourceFile] = useState<SourceFileState | null>(null)
  const [referenceFile, setReferenceFile] = useState<ReferenceFileState | null>(null)
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([])
  const [submittedReferenceAnalysis, setSubmittedReferenceAnalysis] = useState<ReferenceAnalysisPayload | null>(null)
  const [submittedPrompt, setSubmittedPrompt] = useState('')
  const [lastSubmittedMeta, setLastSubmittedMeta] = useState<HistoryPresentationMeta | null>(null)
  const [historyMeta, setHistoryMeta] = useState<HistoryMetaMap>(() => loadHistoryMeta())
  const [sourceUploadState, setSourceUploadState] = useState<'idle' | 'uploading' | 'error'>('idle')
  const [sourceUploadError, setSourceUploadError] = useState('')
  const [isNarrowLayout, setIsNarrowLayout] = useState(() => window.innerWidth < WORKBENCH_TABS_BREAKPOINT)
  const [activePanel, setActivePanel] = useState<'generate' | 'preview' | 'history'>('generate')
  const [workspaceFocus, setWorkspaceFocus] = useState<'compose' | 'result'>('compose')
  const isModeB = sourceFile !== null
  const isReferenceEnhanced = referenceFile !== null
  const backendUnavailable = generation.backendAvailable === false
  const hasLoadedResult = Boolean(generation.result?.file_id)

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
            page_count: null,
            style: '',
            reference_analysis: referenceFile?.analysis
          },
    [isModeB, prompt, referenceFile, sourceFile]
  )

  useEffect(() => {
    window.localStorage.setItem(
      FORM_STORAGE_KEY,
      JSON.stringify({
        prompt
      })
    )
  }, [prompt])

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
      setIsNarrowLayout(window.innerWidth < WORKBENCH_TABS_BREAKPOINT)
    }

    window.addEventListener('resize', updateLayoutMode)
    return () => window.removeEventListener('resize', updateLayoutMode)
  }, [])

  useEffect(() => {
    if (isNarrowLayout && generation.stage === 'complete') {
      setActivePanel('preview')
    }
  }, [generation.stage, isNarrowLayout])

  useEffect(() => {
    if (generation.isRunning) {
      setWorkspaceFocus('compose')
      return
    }
    if (hasLoadedResult && generation.stage === 'complete') {
      setWorkspaceFocus('result')
    }
  }, [generation.isRunning, generation.stage, hasLoadedResult])

  async function handleSourceUpload(files?: File | File[] | FileList) {
    const selectedFiles = files instanceof File ? [files] : Array.from(files ?? [])
    if (!selectedFiles.length) return
    setSourceUploadState('uploading')
    setSourceUploadError('')
    try {
      const uploadedItems: UploadQueueItem[] = []
      for (const file of selectedFiles) {
        if (isPptxFile(file)) {
          const result = await uploadTemplate(file)
          setSourceFile({ name: file.name, size: file.size, relativePath: result.relative_path })
          setReferenceFile(null)
          uploadedItems.push({
            id: `${file.name}-${file.size}-${file.lastModified}`,
            name: file.name,
            size: file.size,
            typeLabel: 'PPTX源文件'
          })
        } else {
          const analysis = await analyzeReference(file)
          setReferenceFile({ name: file.name, size: file.size, analysis })
          setSourceFile(null)
          uploadedItems.push({
            id: `${file.name}-${file.size}-${file.lastModified}`,
            name: file.name,
            size: file.size,
            typeLabel: inferReferenceTypeLabel(file),
            pageCount: analysis.page_count,
            textChars: analysis.text_chars,
            dominantColors: analysis.dominant_colors,
            extractionErrors: analysis.extraction_errors
          })
        }
      }
      setUploadQueue(uploadedItems)
      setSourceUploadState('idle')
    } catch (error) {
      setSourceUploadState('error')
      setSourceUploadError(formatUploadError(error))
    }
  }

  function removeSourceFile() {
    setSourceFile(null)
    setReferenceFile(null)
    setUploadQueue([])
    setSourceUploadState('idle')
    setSourceUploadError('')
  }

  function handleRetry() {
    generation.clearError()
    promptRef.current?.focus()
  }

  function showComposeStage() {
    setWorkspaceFocus('compose')
    if (isNarrowLayout) setActivePanel('generate')
  }

  function showResultStage() {
    setWorkspaceFocus('result')
    if (isNarrowLayout) setActivePanel('preview')
  }

  function showHistoryStage() {
    if (isNarrowLayout) {
      setHistoryOpen(false)
      setActivePanel('history')
      return
    }
    setHistoryOpen(true)
  }

  function handleGenerateClick() {
    const modeLabel: HistoryModeLabel = isModeB ? '保留编辑' : isReferenceEnhanced ? '参考增强' : '模板生成'
    setSubmittedReferenceAnalysis(isReferenceEnhanced ? referenceFile?.analysis ?? null : null)
    setSubmittedPrompt(prompt.trim())
    setLastSubmittedMeta({ modeLabel, promptPrefix: prompt.trim().slice(0, 40) || '生成记录' })
    savedHistoryFileIdRef.current = ''
    showComposeStage()
    if (backendUnavailable) return
    generation.generate(payload)
  }

  const runtimeStatus = (
    <div className="grid min-h-0 gap-3" aria-live="polite">
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
      ) : backendUnavailable ? (
        <BackendUnavailableNotice baseUrl={generation.backendBaseUrl} detail={generation.backendError} />
      ) : generation.error ? (
        <section className="max-w-full overflow-hidden rounded-ui border border-border bg-background p-4 text-sm text-danger" role="alert">
          {generation.error}
        </section>
      ) : null}
    </div>
  )

  const generationConsole = (
    <section className="grid min-h-0 grid-rows-[auto_auto_auto_minmax(12rem,1fr)] gap-3 overflow-hidden rounded-ui border border-border bg-surface p-4 shadow-panel" aria-label="生成控制台">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="text-base font-semibold text-foreground">生成控制台</h2>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <ModeBadge mode={isModeB ? 'template_preserving_edit' : isReferenceEnhanced ? 'reference_enhanced' : 'prompt_to_ppt'} />
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => (generation.isRunning ? generation.cancel() : handleGenerateClick())}
              disabled={!generation.isRunning && (!prompt.trim() || backendUnavailable)}
              className="inline-flex items-center justify-center gap-2 rounded-control bg-primary px-4 py-2 text-primaryForeground transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generation.isRunning ? <X size={16} aria-hidden /> : <Play size={16} aria-hidden />}
              {generation.isRunning ? 'Cancel' : 'Generate PPT'}
            </button>
          </div>
        </div>
      </div>
      <SourceFilePanel
        sourceFile={sourceFile}
        referenceFile={referenceFile}
        uploadQueue={uploadQueue}
        uploadState={sourceUploadState}
        error={sourceUploadError}
        disabled={backendUnavailable}
        onUpload={(file) => void handleSourceUpload(file)}
        onRemove={removeSourceFile}
      />
      {runtimeStatus}
      <div className="grid min-h-0">
        <label className="sr-only" htmlFor="prompt-input">
          Prompt
        </label>
        <textarea
          ref={promptRef}
          id="prompt-input"
          aria-label="Prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          className="box-border h-full min-h-48 w-full max-w-full resize-none rounded-ui border border-border bg-background px-4 py-3 text-foreground outline-none transition focus:border-primary focus:shadow-focus"
          placeholder="输入 Prompt，例如：为销售团队生成一份商务深蓝风的季度经营复盘，重点分析渠道增长和客户留存。"
        />
      </div>
    </section>
  )

  const previewWorkspace = (
    <section className="grid h-full min-h-0 overflow-hidden" aria-label="PPT 结果工作区">
      <PreviewPanel preview={generation.preview} visualPreview={generation.visualPreview} resultFileId={generation.result?.file_id} referenceAnalysis={submittedReferenceAnalysis} submittedPrompt={submittedPrompt} />
    </section>
  )

  const historyWorkspace = (
    <HistoryPanel
      files={generation.files}
      historyMeta={historyMeta}
      open={historyOpen}
      onToggle={() => setHistoryOpen((value) => !value)}
      onPreview={async (file) => {
        const preview = await getPreview(file.file_id)
        const visualPreview = await getVisualPreview(file.file_id)
        setSubmittedPrompt('')
        generation.setPreview(preview, { file_name: file.file_name, file_id: file.file_id, preview }, visualPreview)
        showResultStage()
        setHistoryOpen(false)
      }}
      onDelete={async (file) => {
        await deleteFile(file.file_id)
        await generation.refreshFiles()
      }}
    />
  )

  const historyDrawer = historyOpen && !isNarrowLayout && (
    <div className="fixed inset-0 z-50 grid bg-black/20 p-4" role="dialog" aria-modal="true" aria-label="历史记录">
      <div className="ml-auto grid h-full w-full max-w-3xl min-h-0 rounded-ui border border-border bg-background shadow-panel">
        <HistoryPanel
          files={generation.files}
          historyMeta={historyMeta}
          open
          ariaLabel="历史记录列表"
          toggleLabel="关闭"
          onToggle={() => setHistoryOpen(false)}
          onPreview={async (file) => {
            const preview = await getPreview(file.file_id)
            const visualPreview = await getVisualPreview(file.file_id)
            setSubmittedPrompt('')
            generation.setPreview(preview, { file_name: file.file_name, file_id: file.file_id, preview }, visualPreview)
            showResultStage()
            setHistoryOpen(false)
          }}
          onDelete={async (file) => {
            await deleteFile(file.file_id)
            await generation.refreshFiles()
          }}
        />
      </div>
    </div>
  )

  const resultActionRail = workspaceFocus === 'result' && hasLoadedResult && !generation.isRunning
  const secondaryActionClass = resultActionRail ? 'rounded-control border border-border px-3 py-1.5 text-sm text-muted' : 'rounded-control border border-border px-3 py-2 text-sm text-muted'

  const workbenchActions = (
    <div className={['flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-ui border border-border bg-background px-3', resultActionRail ? 'py-1' : 'py-2'].join(' ')}>
      <div className={resultActionRail ? 'flex min-w-0 items-center gap-2' : 'min-w-0'}>
        <span className="text-xs font-semibold uppercase text-muted">{generation.isRunning ? 'Generating' : workspaceFocus === 'result' && hasLoadedResult ? 'Result' : 'Compose'}</span>
        <p className={resultActionRail ? 'truncate text-xs text-muted' : 'truncate text-sm text-foreground'}>
          {generation.isRunning ? generation.message || '正在生成 PPT' : workspaceFocus === 'result' && hasLoadedResult ? '检查生成结果、下载 PPTX 或查看文本提取' : '输入生成意图，上传参考文件并开始生成'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {hasLoadedResult && workspaceFocus === 'result' && (
          <button type="button" onClick={showComposeStage} className={secondaryActionClass}>
            新建 PPT
          </button>
        )}
        {hasLoadedResult && workspaceFocus === 'compose' && (
          <button type="button" onClick={showResultStage} className={secondaryActionClass}>
            查看结果
          </button>
        )}
        {hasLoadedResult && workspaceFocus === 'result' && generation.result?.file_id && (
          <a href={downloadUrl(generation.result.file_id)} className="inline-flex items-center gap-2 rounded-control bg-primary px-3 py-1.5 text-sm text-primaryForeground">
            <Download size={16} aria-hidden />
            下载 .pptx
          </a>
        )}
        <button type="button" onClick={showHistoryStage} className={secondaryActionClass}>
          历史记录
        </button>
      </div>
    </div>
  )

  const desktopWorkspace =
    workspaceFocus === 'result' && hasLoadedResult && !generation.isRunning ? (
      <section className="grid min-h-0 overflow-hidden" aria-label="PPT 检查结果">
        {previewWorkspace}
      </section>
    ) : (
      <section className="grid min-h-0 overflow-hidden" aria-label={generation.isRunning ? 'PPT 生成进度' : 'PPT 生成输入'}>
        {generationConsole}
      </section>
    )

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <div
        className={[
          'mx-4 grid h-screen max-w-full gap-3 pb-4 pt-4 xl:mx-auto xl:w-full xl:max-w-screen-xl',
          isNarrowLayout ? 'grid-rows-[auto_auto_minmax(0,1fr)]' : 'grid-rows-[auto_minmax(0,1fr)]'
        ].join(' ')}
      >
        {workbenchActions}
        {historyDrawer}
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
          <div className="h-full min-h-0 overflow-hidden">
            {activePanel === 'generate' && generationConsole}
            {activePanel === 'preview' && previewWorkspace}
            {activePanel === 'history' && historyWorkspace}
          </div>
        ) : (
          desktopWorkspace
        )}

      </div>
    </main>
  )
}

function SourceFilePanel({
  uploadQueue,
  uploadState,
  error,
  disabled,
  onUpload,
  onRemove
}: {
  sourceFile: SourceFileState | null
  referenceFile: ReferenceFileState | null
  uploadQueue: UploadQueueItem[]
  uploadState: 'idle' | 'uploading' | 'error'
  error: string
  disabled?: boolean
  onUpload: (files?: FileList | File[]) => void
  onRemove: () => void
}) {
  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    onUpload(event.dataTransfer.files)
  }

  return (
    <section className="rounded-ui border border-border bg-background px-3 py-2" aria-label="参考文件上传">
      <div className="flex items-center justify-between gap-3">
        <label
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1 text-sm text-muted transition hover:text-foreground"
        >
          <span className="inline-flex items-center gap-2 font-semibold text-foreground">
            <Upload size={16} aria-hidden />
            参考文件
          </span>
          <span className="truncate text-xs text-muted">支持多文件 · .pptx 编辑 · .pdf/.png 取风格</span>
          <input
            aria-label="上传参考文件"
            type="file"
            accept=".pptx,.pdf,.png,.jpg,.jpeg"
            multiple
            className="sr-only"
            disabled={disabled || uploadState === 'uploading'}
            onChange={(event) => onUpload(event.target.files ?? undefined)}
          />
        </label>
        {uploadQueue.length > 0 && (
          <button type="button" aria-label="移除源文件" onClick={onRemove} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-border text-muted transition hover:text-foreground">
            <X size={16} aria-hidden />
          </button>
        )}
      </div>
      {uploadQueue.length > 0 && (
        <div className="mt-2 grid max-h-28 grid-cols-1 gap-2 overflow-auto sm:grid-cols-2 xl:grid-cols-3" aria-label="已选择文件">
          {uploadQueue.map((file) => (
            <div key={file.id} className="min-w-0 rounded-control border border-border bg-elevated px-2 py-1">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold text-foreground">{file.name}</span>
                <span className="shrink-0 rounded-control border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted">{file.typeLabel}</span>
              </div>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1 text-[11px] text-muted">
                {file.pageCount ? <span>{file.pageCount}页</span> : null}
                {file.textChars ? <span>{file.textChars}字</span> : null}
                {file.dominantColors?.length ? (
                  <span className="inline-flex gap-1" aria-label="参考配色">
                    {file.dominantColors.slice(0, 3).map((color) => (
                      <span key={`${file.id}-${color}`} data-testid="inline-reference-color-swatch" className="h-3 w-5 rounded-control border border-border" style={{ backgroundColor: color }} title={color} />
                    ))}
                  </span>
                ) : null}
                {file.extractionErrors?.length ? <span className="truncate">{file.extractionErrors.join(' / ')}</span> : null}
                <span>{formatBytes(file.size)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {uploadState === 'error' && error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </section>
  )
}

function BackendUnavailableNotice({ baseUrl, detail }: { baseUrl: string; detail: string }) {
  return (
    <section className="rounded-ui border border-danger bg-background p-4 text-sm" role="alert">
      <h3 className="text-base font-semibold text-foreground">PPT Maker 后端未启动</h3>
      <p className="mt-2 text-muted">当前发布页已加载，但生成服务没有响应。请先启动 PPT Maker 后端，然后刷新当前 Agent05 页面。</p>
      {baseUrl && <p className="mt-2 font-mono text-xs text-muted">{baseUrl}</p>}
      {detail && <p className="mt-2 text-xs text-muted">诊断：{detail}</p>}
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

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function isPptxFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.pptx')
}

function inferReferenceTypeLabel(file: File): 'PDF参考' | '图片参考' {
  return file.name.toLowerCase().endsWith('.pdf') ? 'PDF参考' : '图片参考'
}

function formatUploadError(error: unknown): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) {
    return `文件上传或分析失败：${detail.trim()}`
  }
  return '文件上传或分析失败'
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
  referenceAnalysis,
  submittedPrompt
}: {
  preview: PreviewPayload | null
  visualPreview: VisualPreviewPayload | null
  resultFileId?: string
  referenceAnalysis: ReferenceAnalysisPayload | null
  submittedPrompt: string
}) {
  const [textOpen, setTextOpen] = useState(false)
  const [constraintsOpen, setConstraintsOpen] = useState(false)
  const slides = preview?.slides ?? []
  const enhancementSummary = buildEnhancementSummary(referenceAnalysis)
  const constraintChecks = evaluateDeterministicConstraints(submittedPrompt, slides)
  const hasText = slides.length > 0 && totalTextFragments(slides) > 0
  const hasEmptyText = slides.length > 0 && totalTextFragments(slides) === 0
  const hasDiagnostics = Boolean(enhancementSummary || constraintChecks.length > 0 || hasText || hasEmptyText)
  return (
    <section className="grid h-full min-h-0 max-w-full grid-rows-[minmax(0,1fr)_auto] gap-2 overflow-hidden" aria-label="PPT 成品最大预览">
      <h2 className="sr-only">PPT 成品预览</h2>
      {!resultFileId ? (
        <div className="ppt-preview-stage-shell flex h-full min-h-0 items-center justify-center overflow-hidden">
          <div data-testid="ppt-preview-stage" className="ppt-preview-stage-frame flex aspect-video items-center justify-center rounded-ui border border-dashed border-border bg-background text-muted">
            输入 Prompt 并点击 Generate
          </div>
        </div>
      ) : (
        <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-2">
          {visualPreview?.preview_url ? (
            <div className="ppt-preview-stage-shell flex h-full min-h-0 items-center justify-center overflow-hidden">
              <div data-testid="ppt-preview-stage" className="ppt-preview-stage-frame aspect-video overflow-hidden rounded-ui border border-border bg-background">
                <iframe className="block h-full w-full overflow-hidden border-0" title="PPT 成品预览" src={agentAssetUrl(visualPreview.preview_url)} scrolling="no" />
              </div>
            </div>
          ) : visualPreview?.error ? (
            <div className="ppt-preview-stage-shell flex h-full min-h-0 items-center justify-center overflow-hidden">
              <div data-testid="ppt-preview-stage" className="ppt-preview-stage-frame flex aspect-video flex-col items-center justify-center gap-2 rounded-ui border border-dashed border-border bg-background px-4 text-center text-sm text-muted">
                <span>{visualPreview.message || '预览生成失败，但 PPTX 可下载'}</span>
                <span className="rounded-control border border-border bg-elevated px-2 py-1 text-xs text-muted">渲染预览不可用</span>
              </div>
            </div>
          ) : (
            <div className="ppt-preview-stage-shell flex h-full min-h-0 items-center justify-center overflow-hidden">
              <div data-testid="ppt-preview-stage" className="ppt-preview-stage-frame flex aspect-video items-center justify-center rounded-ui border border-dashed border-border bg-background text-sm text-muted">
                正在生成预览...
              </div>
            </div>
          )}

          {hasDiagnostics && (
            <div className="grid max-h-24 gap-1 overflow-auto rounded-ui border border-border bg-background px-2 py-1" aria-label="结果诊断">
              <div className="flex flex-wrap items-center gap-2">
                {enhancementSummary && <span className="rounded-control border border-border bg-elevated px-2 py-0.5 text-xs text-muted">{enhancementSummary}</span>}
                {constraintChecks.length > 0 && (
                  <button type="button" onClick={() => setConstraintsOpen((value) => !value)} className="inline-flex items-center gap-2 rounded-control border border-border px-2 py-0.5 text-xs text-muted">
                    约束核验
                    <span className={constraintChecks.some((check) => check.status === 'failed') ? 'text-danger' : 'text-success'}>
                      {constraintChecks.some((check) => check.status === 'failed') ? '未满足' : '已满足'}
                    </span>
                    {constraintsOpen ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                  </button>
                )}
                {hasText && (
                <button
                  type="button"
                  onClick={() => setTextOpen((value) => !value)}
                    className="inline-flex items-center gap-2 rounded-control border border-border px-2 py-0.5 text-xs text-muted"
                >
                  文本提取结果
                    {textOpen ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                </button>
                )}
                {hasEmptyText && <span className="rounded-control border border-border bg-elevated px-2 py-0.5 text-xs text-muted">未提取到可读文本</span>}
              </div>
              {constraintsOpen && constraintChecks.length > 0 && <ConstraintVerificationPanel checks={constraintChecks} />}
              {textOpen && hasText && <TextExtractionPanel slides={slides} />}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

interface ConstraintCheck {
  slideNumber: number
  status: 'passed' | 'failed'
  summary: string
  detail: string
}

function ConstraintVerificationPanel({ checks }: { checks: ConstraintCheck[] }) {
  const hasFailures = checks.some((check) => check.status === 'failed')
  return (
    <section className="rounded-ui border border-border bg-background p-3" aria-label="约束核验">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">约束核验</h3>
        <span className={['rounded-control px-2 py-1 text-xs font-semibold', hasFailures ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'].join(' ')}>
          {hasFailures ? '未满足' : '已满足'}
        </span>
      </div>
      <div className="mt-2 grid gap-2">
        {checks.map((check) => (
          <div key={check.slideNumber} className="rounded-control border border-border bg-elevated px-3 py-2 text-sm">
            <p className="font-semibold text-foreground">{check.summary}</p>
            <p className="mt-1 text-xs text-muted">{check.detail}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function TextExtractionPanel({ slides }: { slides: SlidePreview[] }) {
  const [fullTextOpen, setFullTextOpen] = useState(false)
  const totalFragments = slides.reduce((total, slide) => total + textItemsForSlide(slide).length, 0)
  return (
    <div className="grid max-h-80 gap-3 overflow-auto border-t border-border p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">文本摘要</h3>
          <p className="text-xs text-muted">
            {slides.length} 页 · {totalFragments} 个文本片段
          </p>
        </div>
        <button type="button" onClick={() => setFullTextOpen((value) => !value)} className="rounded-control border border-border px-3 py-2 text-sm text-muted">
          {fullTextOpen ? '收起完整文本' : '查看完整文本'}
        </button>
      </div>
      {!fullTextOpen ? (
        <div className="grid gap-2">
          {slides.map((slide) => (
            <SlideTextSummary key={slide.slide_number} slide={slide} />
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          {slides.map((slide) => (
            <SlideOutline key={slide.slide_number} slide={slide} />
          ))}
        </div>
      )}
    </div>
  )
}

function SlideTextSummary({ slide }: { slide: SlidePreview }) {
  const fragments = textItemsForSlide(slide)
  return (
    <article className="grid gap-2 rounded-ui border border-border bg-background p-3 text-sm sm:grid-cols-[auto_1fr_auto] sm:items-center">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-control border border-border px-2 py-1 text-xs text-muted">Slide {slide.slide_number}</span>
        {slide.role && <span className="rounded-control bg-elevated px-2 py-1 text-xs text-muted">{slide.role}</span>}
      </div>
      <h4 className="min-w-0 truncate font-semibold text-foreground">{slide.title || fragments[0] || `Slide ${slide.slide_number}`}</h4>
      <span className="text-xs text-muted">{fragments.length} 个文本片段</span>
    </article>
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
  const bullets = textItemsForSlide(slide)
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

function textItemsForSlide(slide: SlidePreview): string[] {
  const items = slide.bullets ?? slide.texts?.map((item) => item.text) ?? []
  return items.map((item) => item.trim()).filter(Boolean)
}

function totalTextFragments(slides: SlidePreview[]): number {
  return slides.reduce((total, slide) => total + textItemsForSlide(slide).length, 0)
}

function evaluateDeterministicConstraints(prompt: string, slides: SlidePreview[]): ConstraintCheck[] {
  const constrainedSlides = extractBackupOnlySlideNumbers(prompt)
  if (!constrainedSlides.length) return []
  return constrainedSlides.map((slideNumber) => {
    const slide = slides.find((item) => item.slide_number === slideNumber)
    if (!slide) {
      return {
        slideNumber,
        status: 'failed',
        summary: `Slide ${slideNumber} 应只包含“备用”`,
        detail: '未找到对应页面'
      }
    }
    const fragments = meaningfulSlideFragments(slide)
    const nonBackupFragments = fragments.filter((fragment) => normalizeConstraintText(fragment) !== '备用')
    if (fragments.length > 0 && nonBackupFragments.length === 0) {
      return {
        slideNumber,
        status: 'passed',
        summary: `Slide ${slideNumber} 应只包含“备用”`,
        detail: '已满足备用页约束'
      }
    }
    return {
      slideNumber,
      status: 'failed',
      summary: `Slide ${slideNumber} 应只包含“备用”`,
      detail: nonBackupFragments.length > 0 ? `检测到非备用文本：${nonBackupFragments.join(' / ')}` : '未检测到备用文本'
    }
  })
}

function extractBackupOnlySlideNumbers(prompt: string): number[] {
  const normalizedPrompt = toAsciiDigits(prompt).replace(/\s+/g, '')
  const matches = normalizedPrompt.matchAll(/第([0-9/、,，和及]+)页[^。；;]*只(?:放|写|保留)[“"']?备用/g)
  const numbers = Array.from(matches).flatMap((match) => match[1].match(/[0-9]+/g)?.map(Number) ?? [])
  return Array.from(new Set(numbers)).filter((value) => Number.isInteger(value) && value > 0)
}

function meaningfulSlideFragments(slide: SlidePreview): string[] {
  return [slide.title, ...textItemsForSlide(slide)]
    .map((item) => item?.trim() ?? '')
    .filter(Boolean)
}

function normalizeConstraintText(value: string): string {
  return value.replace(/[“”"'\s]/g, '')
}

function toAsciiDigits(value: string): string {
  return value.replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - '０'.charCodeAt(0)))
}

function HistoryPanel({
  files,
  historyMeta,
  open,
  ariaLabel = '最近历史',
  variant = 'panel',
  onToggle,
  onPreview,
  onDelete,
  toggleLabel
}: {
  files: GeneratedFile[]
  historyMeta: HistoryMetaMap
  open: boolean
  ariaLabel?: string
  variant?: 'panel' | 'strip'
  onToggle: () => void
  onPreview: (file: GeneratedFile) => void
  onDelete: (file: GeneratedFile) => void
  toggleLabel?: string
}) {
  const latestFiles = files.slice(0, 3)
  const isStrip = variant === 'strip'
  const showSummary = isStrip || !open
  const actionLabel = toggleLabel ?? '更多历史'
  return (
    <section
      className={[
        'max-w-full rounded-ui border border-border bg-background',
        isStrip ? 'relative z-40 isolate grid overflow-visible shadow-panel md:grid-cols-[auto_minmax(0,1fr)_auto]' : 'grid max-h-full min-h-0 overflow-hidden'
      ].join(' ')}
      aria-label={ariaLabel}
    >
      <div className={isStrip ? 'flex items-center border-b border-border px-3 py-2 md:border-b-0 md:border-r' : 'flex items-center justify-between gap-3 px-3 py-2'}>
        <div>
          <h2 className="text-sm font-semibold text-foreground">最近生成</h2>
          <p className="text-xs text-muted">历史生成 ({files.length})</p>
        </div>
      </div>
      {showSummary && (
        <div className={isStrip ? 'grid min-w-0 gap-0 md:grid-cols-3' : 'min-h-0 border-t border-border'} aria-label="最近生成摘要">
          {latestFiles.length > 0 ? (
            latestFiles.map((file) => <HistorySummaryRow key={file.file_id} file={file} meta={historyMeta[file.file_id]} onPreview={onPreview} />)
          ) : (
            <p className="px-3 py-3 text-sm text-muted">暂无历史</p>
          )}
        </div>
      )}
      <div className={isStrip ? 'flex items-center justify-end border-t border-border px-3 py-2 md:border-l md:border-t-0' : 'flex items-center justify-end border-t border-border px-3 py-2'}>
        <button type="button" onClick={onToggle} className="inline-flex items-center gap-1 rounded-control border border-border px-2 py-1 text-xs text-muted">
          {actionLabel}
          {actionLabel === '关闭' ? <X size={14} aria-hidden /> : open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
        </button>
      </div>
      {open && (
        <div
          aria-label="完整历史"
          className={isStrip ? 'absolute bottom-full left-0 right-0 z-50 mb-2 max-h-80 overflow-auto rounded-ui border border-border bg-background shadow-panel' : 'min-h-0 overflow-auto border-t border-border'}
        >
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
      <span className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 rounded-control border border-border bg-elevated px-2 py-0.5 text-xs text-muted">{label}</span>
        <span className="truncate font-semibold text-foreground">{promptLabel}</span>
      </span>
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
