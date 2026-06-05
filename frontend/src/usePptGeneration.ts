import { useCallback, useEffect, useRef, useState } from 'react'

import { cancelGeneration, getFiles, getPreview, getStatus, getVisualPreview } from './api'
import { tryParseQualityGate } from './qualityGate'
import type { QualityGateErrorPayload } from './qualityGate'
import type { CompleteResult, GeneratedFile, GeneratePayload, PreviewPayload, SourceAnalysisSlide, Stage, TemplateCandidate, VisualPreviewPayload } from './types'

interface GenerationState {
  stage: Stage
  message: string
  candidates: TemplateCandidate[]
  result: CompleteResult | null
  preview: PreviewPayload | null
  visualPreview: VisualPreviewPayload | null
  files: GeneratedFile[]
  isRunning: boolean
  error: string
  qualityGateError: QualityGateErrorPayload | null
  mode: GeneratePayload['mode']
  sourceAnalysis: SourceAnalysisSlide[]
}

const initialState: GenerationState = {
  stage: 'idle',
  message: '',
  candidates: [],
  result: null,
  preview: null,
  visualPreview: null,
  files: [],
  isRunning: false,
  error: '',
  qualityGateError: null,
  mode: 'prompt_to_ppt',
  sourceAnalysis: []
}

const RESTORED_STATUS_POLL_MS = 2000

function wsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/agent05/ws/generate`
}

export function usePptGeneration() {
  const [state, setState] = useState<GenerationState>(initialState)
  const socketRef = useRef<WebSocket | null>(null)

  const refreshFiles = useCallback(async () => {
    const files = await getFiles()
    setState((current) => ({ ...current, files }))
  }, [])

  const loadVisualPreview = useCallback(async (fileId: string) => {
    const visualPreview = await getVisualPreview(fileId)
    setState((current) => ({ ...current, visualPreview }))
    return visualPreview
  }, [])

  useEffect(() => {
    let active = true
    async function loadInitialState() {
      const [status, files] = await Promise.all([getStatus(), getFiles()])
      if (!active) return
      setState((current) => ({
        ...current,
        files,
        isRunning: status.in_progress,
        stage: status.in_progress ? status.stage ?? 'generating_outline' : current.stage,
        message: status.message ?? current.message
      }))
    }
    void loadInitialState()
    return () => {
      active = false
      socketRef.current?.close()
    }
  }, [])

  useEffect(() => {
    if (!state.isRunning || socketRef.current) return
    let active = true

    async function pollRestoredStatus() {
      const status = await getStatus()
      if (!active) return
      if (status.in_progress) {
        setState((current) => ({
          ...current,
          isRunning: true,
          stage: status.stage ?? current.stage,
          message: status.message ?? current.message
        }))
        return
      }

      const files = await getFiles()
      if (!active) return
      const latest = files[0]
      const preview = latest?.has_preview ? await getPreview(latest.file_id) : null
      const visualPreview = latest ? await getVisualPreview(latest.file_id) : null
      if (!active) return
      setState((current) => ({
        ...current,
        files,
        isRunning: false,
        stage: latest ? 'complete' : 'idle',
        message: latest ? '生成完成' : '',
        candidates: [],
        visualPreview,
        preview: preview ?? current.preview,
        result:
          latest && preview
            ? {
                file_name: latest.file_name,
                file_id: latest.file_id,
                preview
              }
            : current.result
      }))
    }

    const timer = window.setInterval(() => {
      void pollRestoredStatus()
    }, RESTORED_STATUS_POLL_MS)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [state.isRunning])

  const generate = useCallback((payload: GeneratePayload) => {
    const socket = new WebSocket(wsUrl())
    socketRef.current = socket
    const mode = payload.mode ?? 'prompt_to_ppt'
    setState((current) => ({
      ...current,
      isRunning: true,
      mode,
      stage: mode === 'template_preserving_edit' ? 'analyzing_source' : 'selecting_template',
      message: '正在连接生成通道...',
      error: '',
      qualityGateError: null,
      candidates: [],
      result: null,
      preview: null,
      visualPreview: null,
      sourceAnalysis: []
    }))

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'generate', payload }))
    }

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.type === 'template_candidates') {
        setState((current) => ({
          ...current,
          ...(current.mode === 'template_preserving_edit'
            ? { candidates: [] }
            : {
                stage: 'selecting_template' as Stage,
                message: message.message ?? '已匹配模板候选，等待用户选择...',
                candidates: message.candidates ?? []
              })
        }))
      }
      if (message.type === 'source_analysis') {
        setState((current) => ({
          ...current,
          sourceAnalysis: Array.isArray(message.slides) ? message.slides : []
        }))
      }
      if (message.type === 'progress') {
        setState((current) => ({
          ...current,
          stage: message.stage,
          message: message.message,
          candidates: message.stage === 'selecting_template' ? current.candidates : []
        }))
      }
      if (message.type === 'complete') {
        const result = message.result as CompleteResult
        socketRef.current = null
        setState((current) => ({
          ...current,
          stage: 'complete',
          message: '生成完成',
          isRunning: false,
          candidates: [],
          qualityGateError: null,
          result,
          preview: result.preview,
          visualPreview: null
        }))
        void loadVisualPreview(result.file_id)
        void refreshFiles()
      }
      if (message.type === 'error') {
        const rawError = String(message.message ?? '')
        socketRef.current = null
        setState((current) => ({
          ...current,
          stage: 'error',
          message: rawError,
          error: rawError,
          isRunning: false,
          qualityGateError: tryParseQualityGate(rawError),
          visualPreview: null,
          candidates: [],
          sourceAnalysis: []
        }))
      }
      if (message.type === 'cancelled') {
        socketRef.current = null
        setState((current) => ({
          ...current,
          stage: 'cancelled',
          message: message.message,
          isRunning: false,
          visualPreview: null,
          candidates: [],
          sourceAnalysis: []
        }))
      }
    }

    socket.onerror = () => {
      socketRef.current = null
      setState((current) => ({
        ...current,
        stage: 'error',
        message: 'WebSocket 连接失败',
        error: 'WebSocket 连接失败',
        qualityGateError: null,
        isRunning: false,
        visualPreview: null,
        candidates: [],
        sourceAnalysis: []
      }))
    }
  }, [loadVisualPreview, refreshFiles])

  const selectTemplate = useCallback((slug: string) => {
    socketRef.current?.send(JSON.stringify({ type: 'select_template', template_slug: slug }))
    setState((current) => ({ ...current, candidates: [] }))
  }, [])

  const cancel = useCallback(async () => {
    socketRef.current?.send(JSON.stringify({ type: 'cancel' }))
    await cancelGeneration()
    setState((current) => ({
      ...current,
      stage: 'cancelled',
      message: '任务已终止',
      isRunning: false,
      qualityGateError: null,
      visualPreview: null,
      candidates: [],
      sourceAnalysis: []
    }))
  }, [])

  const clearError = useCallback(() => {
    setState((current) => ({
      ...current,
      stage: 'idle',
      message: '',
      error: '',
      qualityGateError: null,
      isRunning: false,
      visualPreview: null,
      candidates: []
    }))
  }, [])

  return {
    ...state,
    generate,
    cancel,
    selectTemplate,
    clearError,
    refreshFiles,
    setPreview: (preview: PreviewPayload, result?: CompleteResult, visualPreview?: VisualPreviewPayload | null) =>
      setState((current) => ({ ...current, preview, result: result ?? current.result, visualPreview: visualPreview ?? current.visualPreview }))
  }
}
