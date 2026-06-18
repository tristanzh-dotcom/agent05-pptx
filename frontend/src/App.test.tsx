import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'

import App from './App'

vi.mock('axios')

type WsMessage = Record<string, unknown>

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static OPEN = 1
  readyState = MockWebSocket.OPEN
  sent: WsMessage[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: (() => void) | null = null
  constructor(public url: string) {
    MockWebSocket.instances.push(this)
    queueMicrotask(() => this.onopen?.())
  }
  send(value: string) {
    this.sent.push(JSON.parse(value))
  }
  close() {
    this.onclose?.()
  }
  emit(value: WsMessage) {
    this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent)
  }
}

const mockedAxios = vi.mocked(axios, true)

const pdfReferencePayload = {
  schema: 'ppt-maker-reference-analysis/v1',
  ref_id: 'ref_pdf123',
  file_name: '季度报告.pdf',
  file_type: 'pdf',
  page_count: 12,
  text_chars: 3200,
  extracted_text: '季度报告正文',
  dominant_colors: ['#1F3A93', '#FFFFFF', '#E74C3C', '#2C3E70', '#485275'],
  color_style_hint: '深蓝+白色主调，红色点缀',
  recommended_templates: ['architecture-deck', 'report-savior'],
  screenshot_url: '/api/reference/ref_pdf123/screenshot.png',
  extraction_errors: []
}

const imageReferencePayload = {
  schema: 'ppt-maker-reference-analysis/v1',
  ref_id: 'ref_img123',
  file_name: '参考图.png',
  file_type: 'image',
  page_count: null,
  text_chars: 0,
  extracted_text: '',
  dominant_colors: ['#1F3A93', '#FFFFFF', '#E74C3C'],
  color_style_hint: '深蓝+白色主调，红色点缀',
  recommended_templates: ['architecture-deck'],
  screenshot_url: '/api/reference/ref_img123/screenshot.png',
  extraction_errors: ['ocr_unavailable']
}

const defaultGeneratedFile = {
  file_id: '20260603-211700_abcd/output.pptx',
  file_name: 'output.pptx',
  generated_at: '2026-06-03T21:17:00',
  page_count: 2,
  has_preview: true
}

function mockGeneratedFiles(files = [defaultGeneratedFile]) {
  mockedAxios.get.mockImplementation((url: string) => {
    const normalizedUrl = url.replace(/^\/agent05/, '')
    if (normalizedUrl === '/api/generate/status') {
      return Promise.resolve({ data: { schema: 'ppt-maker-generation-status/v1', in_progress: false } })
    }
    if (normalizedUrl === '/api/files') {
      return Promise.resolve({ data: { schema: 'ppt-maker-files/v1', files } })
    }
    if (normalizedUrl === '/api/files/20260603-211700_abcd/output.pptx/preview') {
      return Promise.resolve({
        data: {
          slide_count: 2,
          slides: [
            { slide_number: 1, title: '封面', bullets: ['主题'] },
            { slide_number: 2, title: '目录', bullets: ['市场', '计划'], role: 'agenda' }
          ]
        }
      })
    }
    if (normalizedUrl === '/api/files/20260603-211700_abcd/output.pptx/visual-preview') {
      return Promise.resolve({
        data: {
          schema: 'ppt-maker-visual-preview/v1',
          file_id: '20260603-211700_abcd/output.pptx',
          preview_url: '/api/files/20260603-211700_abcd/output.pptx/visual-preview/index.html',
          mode: 'quicklook_html'
        }
      })
    }
    if (url === '/api/agent05/status') {
      return Promise.resolve({
        data: {
          backend: {
            available: true,
            baseUrl: 'http://127.0.0.1:8000',
            identity: 'ppt-maker'
          }
        }
      })
    }
    return Promise.resolve({ data: {} })
  })
}

beforeEach(() => {
  MockWebSocket.instances = []
  window.localStorage.clear()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
  vi.clearAllMocks()
  vi.stubGlobal('WebSocket', MockWebSocket)
  mockedAxios.get.mockImplementation((url: string) => {
    const normalizedUrl = url.replace(/^\/agent05/, '')
    if (normalizedUrl === '/api/generate/status') {
      return Promise.resolve({ data: { schema: 'ppt-maker-generation-status/v1', in_progress: false } })
    }
    if (normalizedUrl === '/api/files') {
      return Promise.resolve({
        data: {
          schema: 'ppt-maker-files/v1',
          files: []
        }
      })
    }
    if (normalizedUrl === '/api/files/20260603-211700_abcd/output.pptx/preview') {
      return Promise.resolve({
        data: {
          slide_count: 2,
          slides: [
            { slide_number: 1, title: '封面', bullets: ['主题'] },
            { slide_number: 2, title: '目录', bullets: ['市场', '计划'], role: 'agenda' }
          ]
        }
      })
    }
    if (normalizedUrl === '/api/files/20260603-211700_abcd/output.pptx/visual-preview') {
      return Promise.resolve({
        data: {
          schema: 'ppt-maker-visual-preview/v1',
          file_id: '20260603-211700_abcd/output.pptx',
          preview_url: '/api/files/20260603-211700_abcd/output.pptx/visual-preview/index.html',
          mode: 'quicklook_html'
        }
      })
    }
    if (normalizedUrl === '/api/files/20260604-110000_restore/output.pptx/visual-preview') {
      return Promise.resolve({
        data: {
          schema: 'ppt-maker-visual-preview/v1',
          file_id: '20260604-110000_restore/output.pptx',
          preview_url: '/api/files/20260604-110000_restore/output.pptx/visual-preview/index.html',
          mode: 'quicklook_html'
        }
      })
    }
    if (url === '/api/agent05/status') {
      return Promise.resolve({
        data: {
          backend: {
            available: true,
            baseUrl: 'http://127.0.0.1:8000',
            identity: 'ppt-maker'
          }
        }
      })
    }
    return Promise.resolve({ data: {} })
  })
  mockedAxios.post.mockResolvedValue({ data: { cancelled: true } })
  mockedAxios.delete.mockResolvedValue({ data: { deleted: true } })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('PPT maker frontend', () => {
  it('starts in a single-focus compose workspace when no deck is loaded', async () => {
    render(<App />)

    expect(await screen.findByLabelText('PPT 生成输入')).toBeInTheDocument()
    expect(screen.getByLabelText('生成控制台')).toBeInTheDocument()
    expect(screen.queryByLabelText('PPT 结果工作区')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('PPT 检查结果')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('最近生成')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '历史记录' })).toBeInTheDocument()
  })

  it('restores a completed deck into a single-focus result workspace', async () => {
    mockGeneratedFiles()

    render(<App />)

    expect(await screen.findByLabelText('PPT 检查结果')).toBeInTheDocument()
    expect(screen.getByLabelText('PPT 成品最大预览')).toBeInTheDocument()
    expect(screen.getByTitle('PPT 成品预览')).toBeInTheDocument()
    expect(screen.queryByLabelText('生成控制台')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('最近生成')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建 PPT' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '历史记录' })).toBeInTheDocument()
  })

  it('opens history as an overlay instead of a permanent bottom strip', async () => {
    mockGeneratedFiles()
    render(<App />)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: '历史记录' }))

    const historyDrawer = await screen.findByLabelText('历史记录')
    expect(historyDrawer).toHaveClass('fixed')
    expect(within(historyDrawer).getByText('历史生成 (1)')).toBeInTheDocument()
    expect(screen.queryByLabelText('最近生成')).not.toBeInTheDocument()
  })

  it('renders release workbench regions without development routing fields', async () => {
    render(<App />)

    expect(await screen.findByLabelText('生成控制台')).toBeInTheDocument()
    expect(screen.queryByText('http://127.0.0.1:8000')).not.toBeInTheDocument()
    expect(screen.queryByText('/agent05/index.html')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'PPT生成工作台' })).not.toBeInTheDocument()
    expect(screen.queryByText('生成意图在左，成品检查在右')).not.toBeInTheDocument()
    expect(screen.queryByText('后端已连接')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '模板库' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '设置' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('PPT 生成输入')).toBeInTheDocument()
    expect(screen.queryByLabelText('PPT 结果工作区')).not.toBeInTheDocument()
    expect(screen.queryByText('项目名称 / 可视化编辑')).not.toBeInTheDocument()
  })

  it('shows a user-facing backend unavailable state instead of loading generation APIs', async () => {
    mockedAxios.get.mockImplementation((url: string) => {
      if (url === '/api/agent05/status') {
        return Promise.resolve({
          data: {
            backend: {
              available: false,
              baseUrl: 'http://127.0.0.1:8000',
              identity: 'unknown',
              error: 'fetch failed'
            }
          }
        })
      }
      return Promise.reject(new Error(`unexpected request ${url}`))
    })

    render(<App />)

    expect(await screen.findByText('PPT Maker 后端未启动')).toBeInTheDocument()
    expect(screen.getByText(/当前发布页已加载，但生成服务没有响应/)).toBeInTheDocument()
    expect(screen.getByText('http://127.0.0.1:8000')).toBeInTheDocument()
    expect(mockedAxios.get).toHaveBeenCalledWith('/api/agent05/status')
    expect(mockedAxios.get).not.toHaveBeenCalledWith('/agent05/api/generate/status')
    expect(mockedAxios.get).not.toHaveBeenCalledWith('/agent05/api/files')
  })

  it('keeps desktop history behind a compact action instead of a bottom strip', async () => {
    mockGeneratedFiles()
    render(<App />)

    await screen.findByLabelText('PPT 检查结果')
    expect(screen.queryByLabelText('最近生成')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('生成控制台')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '历史记录' })).toBeInTheDocument()
  })

  it('opens desktop full history as a fixed drawer that does not resize the focused workspace', async () => {
    mockGeneratedFiles()
    render(<App />)
    const user = userEvent.setup()

    await screen.findByLabelText('PPT 检查结果')
    await user.click(screen.getByRole('button', { name: '历史记录' }))

    const historyDrawer = await screen.findByLabelText('历史记录')
    const fullHistory = within(historyDrawer).getByLabelText('完整历史')
    expect(historyDrawer).toHaveClass('fixed')
    expect(historyDrawer).toHaveClass('inset-0')
    expect(screen.getByLabelText('PPT 检查结果')).toBeInTheDocument()
    expect(fullHistory).toHaveClass('overflow-auto')
  })

  it('gives the desktop history drawer an explicit close action instead of a more-history toggle', async () => {
    mockGeneratedFiles()
    render(<App />)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: '历史记录' }))

    const historyDrawer = await screen.findByLabelText('历史记录')
    expect(within(historyDrawer).getByRole('button', { name: '关闭' })).toBeInTheDocument()
    expect(within(historyDrawer).queryByRole('button', { name: /更多历史/ })).not.toBeInTheDocument()
  })

  it('keeps model capability metadata out of the embedded workbench footer', async () => {
    render(<App />)

    await screen.findByLabelText('生成控制台')

    expect(screen.queryByLabelText('模型配置')).not.toBeInTheDocument()
    expect(screen.queryByText('DeepSeek 中文生成')).not.toBeInTheDocument()
    expect(screen.queryByText('codex-base 英文报告')).not.toBeInTheDocument()
    expect(screen.queryByText('bge-m3 本地语义检索')).not.toBeInTheDocument()
    expect(screen.queryByText('QuickLook 预览')).not.toBeInTheDocument()
    expect(screen.queryByText('Gorden PPTX 构建')).not.toBeInTheDocument()
    expect(screen.queryByText('内置模板仅供个人学习，企业商用请替换自定义模板')).not.toBeInTheDocument()
  })

  it('keeps compact-height desktop workbench bounded to the viewport', async () => {
    const { container } = render(<App />)

    const shell = container.querySelector('main > div')
    expect(shell).toHaveClass('h-screen')

    expect(await screen.findByLabelText('PPT 生成输入')).toHaveClass('overflow-hidden')

    const generationConsole = await screen.findByLabelText('生成控制台')
    expect(generationConsole).toHaveClass('grid-rows-[auto_auto_auto_minmax(12rem,1fr)]')

    expect(await screen.findByLabelText('Prompt')).toHaveClass('min-h-48')
    expect(screen.getByLabelText('Prompt')).not.toHaveClass('min-h-72')
    expect(screen.getByLabelText('参考文件上传')).toHaveClass('py-2')
  })

  it('keeps the primary generate action above the prompt so it cannot be clipped by the textarea', async () => {
    render(<App />)

    const generationConsole = await screen.findByLabelText('生成控制台')
    expect(generationConsole).toHaveClass('grid-rows-[auto_auto_auto_minmax(12rem,1fr)]')

    const prompt = screen.getByLabelText('Prompt')
    const generateButton = screen.getByRole('button', { name: 'Generate PPT' })
    expect(generationConsole.compareDocumentPosition(generateButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(generateButton.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps a standard laptop iframe width in the desktop split instead of hiding preview in tabs', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 })
    window.dispatchEvent(new Event('resize'))
    mockGeneratedFiles()

    render(<App />)

    expect(await screen.findByLabelText('PPT 检查结果')).toBeInTheDocument()
    expect(screen.getByLabelText('PPT 结果工作区')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '生成' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '预览' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '历史' })).not.toBeInTheDocument()
  })

  it('switches to narrow top-level tabs below 860px effective content width', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 820 })
    window.dispatchEvent(new Event('resize'))

    const { container } = render(<App />)

    const tablist = await screen.findByRole('tablist', { name: 'PPT Maker 工作区' })
    expect(tablist.parentElement).toHaveClass('grid-rows-[auto_auto_minmax(0,1fr)]')
    expect(screen.getByRole('tab', { name: '生成' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '预览' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '历史' })).toBeInTheDocument()
    expect(container.querySelector('main > div')).toHaveClass('grid-rows-[auto_auto_minmax(0,1fr)]')
  })

  it('loads status and restores the latest generated deck as the default inspection surface', async () => {
    mockGeneratedFiles()
    render(<App />)

    expect(await screen.findByTitle('PPT 成品预览')).toHaveAttribute(
      'src',
      '/agent05/api/files/20260603-211700_abcd/output.pptx/visual-preview/index.html'
    )
    expect(screen.getByRole('link', { name: '下载 .pptx' })).toHaveAttribute('href', '/agent05/api/files/20260603-211700_abcd/output.pptx/download')
    expect(screen.getByRole('button', { name: '历史记录' })).toBeInTheDocument()
    expect(mockedAxios.get).toHaveBeenCalledWith('/agent05/api/generate/status')
    expect(mockedAxios.get).toHaveBeenCalledWith('/agent05/api/files')
    expect(mockedAxios.get).toHaveBeenCalledWith('/agent05/api/files/20260603-211700_abcd/output.pptx/preview')
    expect(mockedAxios.get).toHaveBeenCalledWith('/agent05/api/files/20260603-211700_abcd/output.pptx/visual-preview')
  })

  it('renders the visual preview in a fixed 16:9 frame without iframe scrollbars', async () => {
    mockGeneratedFiles()
    render(<App />)

    const previewFrame = await screen.findByTitle('PPT 成品预览')
    expect(screen.getByLabelText('PPT 结果工作区')).toHaveClass('h-full')
    expect(screen.getByTestId('ppt-preview-stage').parentElement).toHaveClass('h-full')
    expect(screen.getByTestId('ppt-preview-stage').parentElement?.parentElement).toHaveClass('h-full')
    expect(previewFrame.parentElement).toHaveClass('aspect-video')
    expect(previewFrame).toHaveAttribute('scrolling', 'no')
  })

  it('keeps narrow history compact until more history is requested', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 820 })
    window.dispatchEvent(new Event('resize'))
    mockGeneratedFiles()
    render(<App />)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('tab', { name: '历史' }))

    const historyPanel = await screen.findByLabelText('最近历史')
    expect(within(historyPanel).getByText('历史生成 (1)')).toBeInTheDocument()
    expect(screen.queryByLabelText('完整历史')).not.toBeInTheDocument()

    await user.click(within(historyPanel).getByRole('button', { name: /更多历史/ }))
    const fullHistory = await screen.findByLabelText('完整历史')
    expect(fullHistory).toHaveClass('overflow-auto')
  })

  it('opens the narrow history action as the visible history tab', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 820 })
    window.dispatchEvent(new Event('resize'))
    mockGeneratedFiles()
    render(<App />)
    const user = userEvent.setup()

    await screen.findByTitle('PPT 成品预览')
    await user.click(screen.getByRole('button', { name: '历史记录' }))

    expect(screen.getByRole('tab', { name: '历史' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByLabelText('最近历史')).toBeInTheDocument()
  })

  it('switches narrow new-deck action back to the generate tab', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 820 })
    window.dispatchEvent(new Event('resize'))
    mockGeneratedFiles()
    render(<App />)
    const user = userEvent.setup()

    await screen.findByTitle('PPT 成品预览')
    await user.click(screen.getByRole('button', { name: '新建 PPT' }))

    expect(screen.getByRole('tab', { name: '生成' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('生成控制台')).toBeInTheDocument()
  })

  it('switches narrow view-result action back to the preview tab', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 820 })
    window.dispatchEvent(new Event('resize'))
    mockGeneratedFiles()
    render(<App />)
    const user = userEvent.setup()

    await screen.findByTitle('PPT 成品预览')
    await user.click(screen.getByRole('button', { name: '新建 PPT' }))
    await user.click(screen.getByRole('tab', { name: '历史' }))
    await user.click(screen.getByRole('button', { name: '查看结果' }))

    expect(screen.getByRole('tab', { name: '预览' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('PPT 结果工作区')).toBeInTheDocument()
  })

  it('sends generate payload over websocket and switches action to cancel', async () => {
    render(<App />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Prompt'), '生成一份季度总结')
    await user.click(screen.getByRole('button', { name: 'Generate PPT' }))

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    expect(MockWebSocket.instances[0].url).toContain('/ws/generate')
    expect(MockWebSocket.instances[0].url).toContain('/agent05/ws/generate')
    expect(MockWebSocket.instances[0].sent[0]).toMatchObject({
      type: 'generate',
      payload: { prompt: '生成一份季度总结', page_count: null, style: '' }
    })
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('renders template candidates and sends select_template', async () => {
    render(<App />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Prompt'), '生成产品发布计划')
    await user.click(screen.getByRole('button', { name: 'Generate PPT' }))
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    act(() => {
      MockWebSocket.instances[0].emit({
        type: 'template_candidates',
        stage: 'selecting_template',
        candidates: [
          { slug: 'minimal-business-summary', name: '简约商务总结汇报', style_description: '极简商务', preview_url: '/api/templates/minimal-business-summary/preview.png' }
        ]
      })
    })

    expect(await screen.findByText('简约商务总结汇报')).toBeInTheDocument()
    const templateSelection = screen.getByLabelText('模板选择')
    const prompt = screen.getByLabelText('Prompt')
    expect(templateSelection.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByAltText('简约商务总结汇报 preview')).toHaveAttribute('src', '/agent05/api/templates/minimal-business-summary/preview.png')
    await user.click(screen.getByRole('button', { name: '选择 简约商务总结汇报' }))
    const templateMessages = MockWebSocket.instances[0].sent
    expect(templateMessages[templateMessages.length - 1]).toEqual({ type: 'select_template', template_slug: 'minimal-business-summary' })
  })

  it('cycles template candidates locally and wraps back to the first group', async () => {
    render(<App />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Prompt'), '生成模板轮播测试')
    await user.click(screen.getByRole('button', { name: 'Generate PPT' }))
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    act(() => {
      MockWebSocket.instances[0].emit({
        type: 'template_candidates',
        stage: 'selecting_template',
        candidates: Array.from({ length: 5 }, (_, index) => ({
          slug: `template-${index + 1}`,
          name: `模板 ${index + 1}`,
          style_description: `风格 ${index + 1}`,
          preview_url: `/api/templates/template-${index + 1}/preview.png`
        }))
      })
    })

    expect(await screen.findByText('模板 1')).toBeInTheDocument()
    expect(screen.getByText('模板 3')).toBeInTheDocument()
    expect(screen.queryByText('模板 4')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '换一批' }))
    expect(screen.getByText('模板 4')).toBeInTheDocument()
    expect(screen.getByText('模板 5')).toBeInTheDocument()
    expect(screen.queryByText('模板 1')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '换一批' }))
    expect(screen.getByText('模板 1')).toBeInTheDocument()
    expect(screen.queryByText('模板 4')).not.toBeInTheDocument()
  })

  it('hides template cycling button when there are three or fewer candidates', async () => {
    render(<App />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Prompt'), '生成少量模板测试')
    await user.click(screen.getByRole('button', { name: 'Generate PPT' }))
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    act(() => {
      MockWebSocket.instances[0].emit({
        type: 'template_candidates',
        stage: 'selecting_template',
        candidates: [
          { slug: 'template-1', name: '模板 1', style_description: '风格 1', preview_url: '/api/templates/template-1/preview.png' },
          { slug: 'template-2', name: '模板 2', style_description: '风格 2', preview_url: '/api/templates/template-2/preview.png' },
          { slug: 'template-3', name: '模板 3', style_description: '风格 3', preview_url: '/api/templates/template-3/preview.png' }
        ]
      })
    })

    expect(await screen.findByText('模板 1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '换一批' })).not.toBeInTheDocument()
  })

  it('updates progress and renders completed preview with download action', async () => {
    render(<App />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Prompt'), '生成经营复盘')
    await user.click(screen.getByRole('button', { name: 'Generate PPT' }))
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    act(() => {
      MockWebSocket.instances[0].emit({ type: 'progress', stage: 'building_pptx', message: '正在构建 PPTX...' })
    })
    expect((await screen.findAllByText('正在构建 PPTX...')).length).toBeGreaterThan(0)
    act(() => {
      MockWebSocket.instances[0].emit({
        type: 'complete',
        result: {
          file_name: 'output.pptx',
          file_id: '20260603-211700_abcd/output.pptx',
          preview: {
            slide_count: 1,
            slides: [{ slide_number: 1, title: '经营复盘', bullets: ['收入', '风险'], role: 'summary' }]
          }
        }
      })
    })

    expect(await screen.findByTitle('PPT 成品预览')).toHaveAttribute(
      'src',
      '/agent05/api/files/20260603-211700_abcd/output.pptx/visual-preview/index.html'
    )
    expect(screen.getByTestId('ppt-preview-stage')).toHaveClass('aspect-video')
    expect(screen.getByRole('link', { name: '下载 .pptx' })).toHaveAttribute('href', '/agent05/api/files/20260603-211700_abcd/output.pptx/download')
  })

  it('recovers to result when websocket misses complete but backend has a new file', async () => {
    const user = userEvent.setup()
    let filesCalls = 0
    mockedAxios.get.mockImplementation((url: string) => {
      const normalizedUrl = url.replace(/^\/agent05/, '')
      if (url === '/api/agent05/status') {
        return Promise.resolve({
          data: {
            backend: {
              available: true,
              baseUrl: 'http://127.0.0.1:8000',
              identity: 'ppt-maker'
            }
          }
        })
      }
      if (normalizedUrl === '/api/generate/status') {
        return Promise.resolve({ data: { schema: 'ppt-maker-generation-status/v1', in_progress: false } })
      }
      if (normalizedUrl === '/api/files') {
        filesCalls += 1
        return Promise.resolve({
          data: {
            schema: 'ppt-maker-files/v1',
            files:
              filesCalls === 1
                ? []
                : [
                    {
                      file_id: '20260617-133818_be05f4e0/output.pptx',
                      file_name: 'output.pptx',
                      generated_at: '2026-06-17T13:43:00',
                      page_count: 5,
                      has_preview: true
                    }
                  ]
          }
        })
      }
      if (normalizedUrl === '/api/files/20260617-133818_be05f4e0/output.pptx/preview') {
        return Promise.resolve({
          data: {
            slide_count: 5,
            slides: [{ slide_number: 1, title: 'JLR org status today', bullets: [] }]
          }
        })
      }
      if (normalizedUrl === '/api/files/20260617-133818_be05f4e0/output.pptx/visual-preview') {
        return Promise.resolve({
          data: {
            schema: 'ppt-maker-visual-preview/v1',
            file_id: '20260617-133818_be05f4e0/output.pptx',
            preview_url: '/api/files/20260617-133818_be05f4e0/output.pptx/visual-preview/index.html',
            mode: 'quicklook_html'
          }
        })
      }
      return Promise.resolve({ data: {} })
    })

    render(<App />)
    await user.type(await screen.findByLabelText('Prompt'), '生成一个5页PPT')
    await user.click(screen.getByRole('button', { name: 'Generate PPT' }))
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    act(() => {
      MockWebSocket.instances[0].emit({ type: 'progress', stage: 'generating_outline', message: '正在生成大纲...' })
    })

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 2200))
    })

    expect(await screen.findByTitle('PPT 成品预览')).toHaveAttribute(
      'src',
      '/agent05/api/files/20260617-133818_be05f4e0/output.pptx/visual-preview/index.html'
    )
    expect(screen.getByRole('link', { name: '下载 .pptx' })).toHaveAttribute('href', '/agent05/api/files/20260617-133818_be05f4e0/output.pptx/download')
  })

  it('renders finished PPT visual preview instead of outline as primary completed view', async () => {
    mockedAxios.get.mockImplementation((url: string) => {
      const normalizedUrl = url.replace(/^\/agent05/, '')
      if (normalizedUrl === '/api/generate/status') {
        return Promise.resolve({ data: { schema: 'ppt-maker-generation-status/v1', in_progress: false } })
      }
      if (normalizedUrl === '/api/files') {
        return Promise.resolve({ data: { schema: 'ppt-maker-files/v1', files: [] } })
      }
      if (normalizedUrl === '/api/files/20260603-211700_abcd/output.pptx/visual-preview') {
        return Promise.resolve({
          data: {
            schema: 'ppt-maker-visual-preview/v1',
            file_id: '20260603-211700_abcd/output.pptx',
            preview_url: '/api/files/20260603-211700_abcd/output.pptx/visual-preview/index.html',
            mode: 'quicklook_html'
          }
        })
      }
      return Promise.resolve({ data: {} })
    })
    render(<App />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Prompt'), '生成视觉预览')
    await user.click(screen.getByRole('button', { name: 'Generate PPT' }))
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    act(() => {
      MockWebSocket.instances[0].emit({
        type: 'complete',
        result: {
          file_name: 'output.pptx',
          file_id: '20260603-211700_abcd/output.pptx',
          preview: {
            slide_count: 1,
            slides: [{ slide_number: 1, title: '经营复盘', bullets: ['收入', '风险'], role: 'summary' }]
          }
        }
      })
    })

    expect(await screen.findByText('PPT 成品预览')).toBeInTheDocument()
    expect(await screen.findByTitle('PPT 成品预览')).toHaveAttribute(
      'src',
      '/agent05/api/files/20260603-211700_abcd/output.pptx/visual-preview/index.html'
    )
    expect(screen.getByRole('link', { name: '下载 .pptx' })).toHaveAttribute('href', '/agent05/api/files/20260603-211700_abcd/output.pptx/download')
    expect(screen.queryByText('经营复盘')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '文本提取结果' })).toBeInTheDocument()
  })

  it('shows text extraction summary before exposing full extracted fragments', async () => {
    mockedAxios.get.mockImplementation((url: string) => {
      const normalizedUrl = url.replace(/^\/agent05/, '')
      if (normalizedUrl === '/api/generate/status') {
        return Promise.resolve({ data: { schema: 'ppt-maker-generation-status/v1', in_progress: false } })
      }
      if (normalizedUrl === '/api/files') {
        return Promise.resolve({ data: { schema: 'ppt-maker-files/v1', files: [] } })
      }
      if (normalizedUrl === '/api/files/20260603-211700_abcd/output.pptx/visual-preview') {
        return Promise.resolve({
          data: {
            schema: 'ppt-maker-visual-preview/v1',
            file_id: '20260603-211700_abcd/output.pptx',
            preview_url: '/api/files/20260603-211700_abcd/output.pptx/visual-preview/index.html',
            mode: 'quicklook_html'
          }
        })
      }
      return Promise.resolve({ data: {} })
    })
    render(<App />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Prompt'), '生成文本摘要测试')
    await user.click(screen.getByRole('button', { name: 'Generate PPT' }))
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    act(() => {
      MockWebSocket.instances[0].emit({
        type: 'complete',
        result: {
          file_name: 'output.pptx',
          file_id: '20260603-211700_abcd/output.pptx',
          preview: {
            slide_count: 1,
            slides: [
              {
                slide_number: 1,
                title: '经营复盘',
                role: 'summary',
                bullets: [
                  '第一段很长的 OCR 碎片，包含渠道增长、客户留存、毛利改善和后续行动。',
                  '第二段很长的 OCR 碎片，包含风险、预算、组织协同和供应链节奏。'
                ]
              }
            ]
          }
        }
      })
    })

    await user.click(await screen.findByRole('button', { name: '文本提取结果' }))

    expect(screen.getByText('文本摘要')).toBeInTheDocument()
    expect(screen.getByText('Slide 1')).toBeInTheDocument()
    expect(screen.getByText('经营复盘')).toBeInTheDocument()
    expect(screen.getByText('summary')).toBeInTheDocument()
    expect(screen.getByText('2 个文本片段')).toBeInTheDocument()
    expect(screen.queryByText(/第一段很长的 OCR 碎片/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '查看完整文本' }))

    expect(screen.getByText(/第一段很长的 OCR 碎片/)).toBeInTheDocument()
    expect(screen.getByText(/第二段很长的 OCR 碎片/)).toBeInTheDocument()
  })

  it('flags generated slides that violate deterministic backup-only page constraints', async () => {
    mockedAxios.get.mockImplementation((url: string) => {
      const normalizedUrl = url.replace(/^\/agent05/, '')
      if (normalizedUrl === '/api/generate/status') {
        return Promise.resolve({ data: { schema: 'ppt-maker-generation-status/v1', in_progress: false } })
      }
      if (normalizedUrl === '/api/files') {
        return Promise.resolve({ data: { schema: 'ppt-maker-files/v1', files: [] } })
      }
      if (normalizedUrl === '/api/files/20260603-211700_abcd/output.pptx/visual-preview') {
        return Promise.resolve({
          data: {
            schema: 'ppt-maker-visual-preview/v1',
            file_id: '20260603-211700_abcd/output.pptx',
            preview_url: '/api/files/20260603-211700_abcd/output.pptx/visual-preview/index.html',
            mode: 'quicklook_html'
          }
        })
      }
      return Promise.resolve({ data: {} })
    })
    render(<App />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Prompt'), '请生成 5 页，第 4/5 页只放“备用”。')
    await user.click(screen.getByRole('button', { name: 'Generate PPT' }))
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    act(() => {
      MockWebSocket.instances[0].emit({
        type: 'complete',
        result: {
          file_name: 'output.pptx',
          file_id: '20260603-211700_abcd/output.pptx',
          preview: {
            slide_count: 5,
            slides: [
              { slide_number: 1, title: '封面', bullets: ['经营复盘'] },
              { slide_number: 2, title: '目录', bullets: ['趋势', '行动'] },
              { slide_number: 3, title: '核心结论', bullets: ['增长'] },
              { slide_number: 4, title: '趋势指标', bullets: ['渠道增长', '客户留存'] },
              { slide_number: 5, title: '备用', bullets: ['备用'] }
            ]
          }
        }
      })
    })

    expect(await screen.findByText('约束核验')).toBeInTheDocument()
    expect(screen.getByText('未满足')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /约束核验/ }))
    expect(screen.getByText('Slide 4 应只包含“备用”')).toBeInTheDocument()
    expect(screen.getByText('检测到非备用文本：趋势指标 / 渠道增长 / 客户留存')).toBeInTheDocument()
  })

  it('keeps download action when visual preview generation fails', async () => {
    mockedAxios.get.mockImplementation((url: string) => {
      const normalizedUrl = url.replace(/^\/agent05/, '')
      if (normalizedUrl === '/api/generate/status') {
        return Promise.resolve({ data: { schema: 'ppt-maker-generation-status/v1', in_progress: false } })
      }
      if (normalizedUrl === '/api/files') {
        return Promise.resolve({ data: { schema: 'ppt-maker-files/v1', files: [] } })
      }
      if (normalizedUrl === '/api/files/20260603-211700_abcd/output.pptx/visual-preview') {
        return Promise.resolve({
          data: {
            schema: 'ppt-maker-visual-preview/v1',
            file_id: '20260603-211700_abcd/output.pptx',
            error: 'visual_preview_failed',
            message: '预览生成失败，但 PPTX 可下载'
          }
        })
      }
      return Promise.resolve({ data: {} })
    })
    render(<App />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Prompt'), '生成预览失败测试')
    await user.click(screen.getByRole('button', { name: 'Generate PPT' }))
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    act(() => {
      MockWebSocket.instances[0].emit({
        type: 'complete',
        result: {
          file_name: 'output.pptx',
          file_id: '20260603-211700_abcd/output.pptx',
          preview: {
            slide_count: 1,
            slides: [{ slide_number: 1, title: '经营复盘', bullets: ['收入', '风险'], role: 'summary' }]
          }
        }
      })
    })

    expect(await screen.findByText('预览生成失败，但 PPTX 可下载')).toBeInTheDocument()
    expect(screen.getByText('渲染预览不可用')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '下载 .pptx' })).toHaveAttribute('href', '/agent05/api/files/20260603-211700_abcd/output.pptx/download')
    expect(screen.queryByText('经营复盘')).not.toBeInTheDocument()
  })

  it('does not expose an expandable text extraction panel when no readable text fragments exist', async () => {
    mockedAxios.get.mockImplementation((url: string) => {
      const normalizedUrl = url.replace(/^\/agent05/, '')
      if (normalizedUrl === '/api/generate/status') {
        return Promise.resolve({ data: { schema: 'ppt-maker-generation-status/v1', in_progress: false } })
      }
      if (normalizedUrl === '/api/files') {
        return Promise.resolve({ data: { schema: 'ppt-maker-files/v1', files: [] } })
      }
      if (normalizedUrl === '/api/files/20260603-211700_abcd/output.pptx/visual-preview') {
        return Promise.resolve({
          data: {
            schema: 'ppt-maker-visual-preview/v1',
            file_id: '20260603-211700_abcd/output.pptx',
            preview_url: '/api/files/20260603-211700_abcd/output.pptx/visual-preview/index.html',
            mode: 'quicklook_html'
          }
        })
      }
      return Promise.resolve({ data: {} })
    })
    render(<App />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Prompt'), '生成空文本提取测试')
    await user.click(screen.getByRole('button', { name: 'Generate PPT' }))
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    act(() => {
      MockWebSocket.instances[0].emit({
        type: 'complete',
        result: {
          file_name: 'output.pptx',
          file_id: '20260603-211700_abcd/output.pptx',
          preview: {
            slide_count: 2,
            slides: [
              { slide_number: 1, title: '', bullets: [] },
              { slide_number: 2, texts: [{ text: '' }, { text: '   ' }] }
            ]
          }
        }
      })
    })

    expect(await screen.findByTitle('PPT 成品预览')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '文本提取结果' })).not.toBeInTheDocument()
    expect(screen.getByText('未提取到可读文本')).toBeInTheDocument()
  })

  it('uses canvas-first completed-result chrome so the preview owns the result page', async () => {
    mockGeneratedFiles()
    render(<App />)

    const panel = await screen.findByLabelText('PPT 成品最大预览')
    expect(panel).toHaveClass('grid-rows-[minmax(0,1fr)_auto]')
    expect(panel).not.toHaveClass('rounded-ui')
    expect(panel).not.toHaveClass('border')
    expect(panel).not.toHaveClass('shadow-panel')
    expect(panel).not.toHaveClass('p-2')
    expect(panel).toHaveClass('gap-2')
    expect(screen.getByTestId('ppt-preview-stage').parentElement).toHaveClass('items-center')
    expect(screen.getByRole('link', { name: '下载 .pptx' })).toBeInTheDocument()
    expect(screen.getByLabelText('结果诊断')).toHaveClass('max-h-24')
  })

  it('cancels websocket task and backend task', async () => {
    render(<App />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Prompt'), '生成取消测试')
    await user.click(screen.getByRole('button', { name: 'Generate PPT' }))
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    const cancelMessages = MockWebSocket.instances[0].sent
    expect(cancelMessages[cancelMessages.length - 1]).toEqual({ type: 'cancel' })
    expect(mockedAxios.post).toHaveBeenCalledWith('/agent05/api/generate/cancel')
  })

  it('expands history and previews selected file', async () => {
    mockGeneratedFiles()
    render(<App />)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: '历史记录' }))
    const historyDrawer = await screen.findByLabelText('历史记录')
    await user.click(within(historyDrawer).getByRole('button', { name: '预览' }))

    expect(await screen.findByTitle('PPT 成品预览')).toHaveAttribute(
      'src',
      '/agent05/api/files/20260603-211700_abcd/output.pptx/visual-preview/index.html'
    )
    await user.click(screen.getByRole('button', { name: '文本提取结果' }))
    expect(screen.getByText('目录')).toBeInTheDocument()
    expect(screen.getByText('agenda')).toBeInTheDocument()
  })

  it('deletes selected history item and refreshes files', async () => {
    mockGeneratedFiles()
    render(<App />)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: '历史记录' }))
    const historyDrawer = await screen.findByLabelText('历史记录')
    await user.click(within(historyDrawer).getByRole('button', { name: '删除 output.pptx' }))

    expect(mockedAxios.delete).toHaveBeenCalledWith('/agent05/api/files/20260603-211700_abcd/output.pptx')
    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalledWith('/agent05/api/files'))
  })

  it('converts websocket connection errors into error state', async () => {
    render(<App />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Prompt'), '生成连接错误测试')
    await user.click(screen.getByRole('button', { name: 'Generate PPT' }))
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    act(() => {
      MockWebSocket.instances[0].onerror?.({} as Event)
    })

    expect(await screen.findByText('WebSocket 连接失败')).toBeInTheDocument()
  })

  it('render quality gate error panel when error is valid json with errors array', async () => {
    render(<App />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Prompt'), '生成质量门错误测试')
    await user.click(screen.getByRole('button', { name: 'Generate PPT' }))
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    act(() => {
      MockWebSocket.instances[0].emit({
        type: 'error',
        message: JSON.stringify({
          valid: false,
          errors: [
            'selected_slides length 8 exceeds requested page_count 5',
            'slide 2 slot question_title new_text matches placeholder pattern: Question 1'
          ],
          warnings: ['selected_slides length 6 exceeds requested page_count 5 by 1']
        })
      })
    })

    expect(await screen.findByText('生成质检未通过')).toBeInTheDocument()
    expect(screen.getByText('2 项错误')).toBeInTheDocument()
    expect(screen.getByText('selected_slides length 8 exceeds requested page_count 5')).toBeInTheDocument()
    expect(screen.getByText('slide 2 slot question_title new_text matches placeholder pattern: Question 1')).toBeInTheDocument()
    expect(screen.getByText('1 项提醒')).toBeInTheDocument()
    expect(screen.getByText('selected_slides length 6 exceeds requested page_count 5 by 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '修改参数重试' })).toBeInTheDocument()
  })

  it('keeps issue item text foreground while using tone color for left border', async () => {
    render(<App />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Prompt'), '生成质量门样式测试')
    await user.click(screen.getByRole('button', { name: 'Generate PPT' }))
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    act(() => {
      MockWebSocket.instances[0].emit({
        type: 'error',
        message: JSON.stringify({
          valid: false,
          errors: ['selected_slides length 8 exceeds requested page_count 5'],
          warnings: ['selected_slides length 6 exceeds requested page_count 5 by 1']
        })
      })
    })

    const errorItem = await screen.findByText('selected_slides length 8 exceeds requested page_count 5')
    const warningItem = screen.getByText('selected_slides length 6 exceeds requested page_count 5 by 1')
    expect(errorItem).toHaveClass('text-foreground')
    expect(errorItem).toHaveClass('border-l-danger')
    expect(errorItem).not.toHaveClass('text-danger')
    expect(warningItem).toHaveClass('text-foreground')
    expect(warningItem).toHaveClass('border-l-warning')
    expect(warningItem).not.toHaveClass('text-warning')
  })

  it('shows warning section only when warnings are present', async () => {
    render(<App />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Prompt'), '生成无提醒质量门错误')
    await user.click(screen.getByRole('button', { name: 'Generate PPT' }))
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    act(() => {
      MockWebSocket.instances[0].emit({
        type: 'error',
        message: JSON.stringify({
          valid: false,
          errors: ['selected_slides length 8 exceeds requested page_count 5'],
          warnings: []
        })
      })
    })

    expect(await screen.findByText('生成质检未通过')).toBeInTheDocument()
    expect(screen.getByText('1 项错误')).toBeInTheDocument()
    expect(screen.queryByText(/项提醒/)).not.toBeInTheDocument()
  })

  it('renders plain error text when error is not quality gate json', async () => {
    render(<App />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Prompt'), '生成普通错误测试')
    await user.click(screen.getByRole('button', { name: 'Generate PPT' }))
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    act(() => {
      MockWebSocket.instances[0].emit({ type: 'error', message: 'opencode did not produce edits.json' })
    })

    expect(await screen.findByText('opencode did not produce edits.json')).toBeInTheDocument()
    expect(screen.queryByText('生成质检未通过')).not.toBeInTheDocument()
  })

  it('retry button clears error and returns to prompt input', async () => {
    render(<App />)
    const user = userEvent.setup()

    const promptInput = screen.getByLabelText('Prompt')
    await user.type(promptInput, '保留这个 prompt')
    await user.click(screen.getByRole('button', { name: 'Generate PPT' }))
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    act(() => {
      MockWebSocket.instances[0].emit({
        type: 'error',
        message: JSON.stringify({
          valid: false,
          errors: ['selected_slides length 8 exceeds requested page_count 5'],
          warnings: []
        })
      })
    })
    await user.click(await screen.findByRole('button', { name: '修改参数重试' }))

    expect(screen.queryByText('生成质检未通过')).not.toBeInTheDocument()
    expect(promptInput).toHaveValue('保留这个 prompt')
    expect(promptInput).toHaveFocus()
  })

  it('source file upload switches to mode b', async () => {
    mockedAxios.post.mockImplementation((url: string) => {
      if (url === '/agent05/api/templates/upload') {
        return Promise.resolve({ data: { relative_path: 'uploads/session-a1b2c3d4e5f6/季度复盘初稿.pptx' } })
      }
      return Promise.resolve({ data: { cancelled: true } })
    })
    render(<App />)
    const user = userEvent.setup()
    const file = new File(['pptx bytes'], '季度复盘初稿.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    })

    expect(await screen.findByText('从模板生成')).toBeInTheDocument()
    await user.upload(screen.getByLabelText('上传参考文件'), file)

    expect(await screen.findByText('保留模板编辑内容')).toBeInTheDocument()
    expect(screen.getByText('季度复盘初稿.pptx')).toBeInTheDocument()
    expect(mockedAxios.post).toHaveBeenCalledWith('/agent05/api/templates/upload', expect.any(FormData))
  })

  it('remove source file switches back to mode a', async () => {
    mockedAxios.post.mockImplementation((url: string) => {
      if (url === '/agent05/api/templates/upload') {
        return Promise.resolve({ data: { relative_path: 'uploads/session-a1b2c3d4e5f6/季度复盘初稿.pptx' } })
      }
      return Promise.resolve({ data: { cancelled: true } })
    })
    render(<App />)
    const user = userEvent.setup()
    const file = new File(['pptx bytes'], '季度复盘初稿.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    })

    await user.upload(await screen.findByLabelText('上传参考文件'), file)
    expect(await screen.findByText('保留模板编辑内容')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '移除源文件' }))

    expect(screen.getByText('从模板生成')).toBeInTheDocument()
    expect(screen.queryByText('季度复盘初稿.pptx')).not.toBeInTheDocument()
  })

  it('template banner hidden in mode b', async () => {
    mockedAxios.post.mockImplementation((url: string) => {
      if (url === '/agent05/api/templates/upload') {
        return Promise.resolve({ data: { relative_path: 'uploads/session-a1b2c3d4e5f6/季度复盘初稿.pptx' } })
      }
      return Promise.resolve({ data: { cancelled: true } })
    })
    render(<App />)
    const user = userEvent.setup()
    const file = new File(['pptx bytes'], '季度复盘初稿.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    })

    await user.upload(await screen.findByLabelText('上传参考文件'), file)
    await user.type(screen.getByLabelText('Prompt'), "把所有'去年'改成'上季度'")
    await user.click(screen.getByRole('button', { name: 'Generate PPT' }))

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    expect(MockWebSocket.instances[0].sent[0]).toMatchObject({
      type: 'generate',
      payload: {
        mode: 'template_preserving_edit',
        source_pptx_path: 'uploads/session-a1b2c3d4e5f6/季度复盘初稿.pptx',
        page_count: null,
        style: null
      }
    })
    act(() => {
      MockWebSocket.instances[0].emit({
        type: 'template_candidates',
        stage: 'selecting_template',
        candidates: [
          { slug: 'template-1', name: '模板 1', style_description: '风格 1', preview_url: '/api/templates/template-1/preview.png' }
        ]
      })
    })

    expect(screen.queryByLabelText('模板选择')).not.toBeInTheDocument()
  })

  it('upload pdf shows inline analysis row', async () => {
    mockedAxios.post.mockImplementation((url: string) => {
      if (url === '/agent05/api/reference/analyze') {
        return Promise.resolve({ data: pdfReferencePayload })
      }
      return Promise.resolve({ data: { cancelled: true } })
    })
    render(<App />)
    const user = userEvent.setup()
    const file = new File(['pdf bytes'], '季度报告.pdf', { type: 'application/pdf' })

    await user.upload(await screen.findByLabelText('上传参考文件'), file)

    expect(await screen.findByText('季度报告.pdf')).toBeInTheDocument()
    expect(screen.getByText('12页')).toBeInTheDocument()
    expect(screen.getByText('3200字')).toBeInTheDocument()
    expect(screen.queryByLabelText('参考分析')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('inline-reference-color-swatch')).toHaveLength(3)
  })

  it('upload pdf sets mode label to reference enhanced mode', async () => {
    mockedAxios.post.mockImplementation((url: string) => {
      if (url === '/agent05/api/reference/analyze') {
        return Promise.resolve({ data: pdfReferencePayload })
      }
      return Promise.resolve({ data: { cancelled: true } })
    })
    render(<App />)
    const user = userEvent.setup()
    const file = new File(['pdf bytes'], '季度报告.pdf', { type: 'application/pdf' })

    await user.upload(await screen.findByLabelText('上传参考文件'), file)

    expect(await screen.findByText('从模板生成（参考增强）')).toBeInTheDocument()
  })

  it('no upload shows default template generation mode label', async () => {
    render(<App />)

    expect(await screen.findByText('从模板生成')).toBeInTheDocument()
    expect(screen.queryByText('从模板生成（参考增强）')).not.toBeInTheDocument()
  })

  it('upload image shows inline analysis row', async () => {
    mockedAxios.post.mockImplementation((url: string) => {
      if (url === '/agent05/api/reference/analyze') {
        return Promise.resolve({ data: imageReferencePayload })
      }
      return Promise.resolve({ data: { cancelled: true } })
    })
    render(<App />)
    const user = userEvent.setup()
    const file = new File(['image bytes'], '参考图.png', { type: 'image/png' })

    await user.upload(await screen.findByLabelText('上传参考文件'), file)

    expect(await screen.findByText('参考图.png')).toBeInTheDocument()
    expect(screen.queryByLabelText('参考分析')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('inline-reference-color-swatch')).toHaveLength(3)
    expect(screen.getByText('ocr_unavailable')).toBeInTheDocument()
  })

  it('shows typed reference upload failure reasons from the backend', async () => {
    mockedAxios.post.mockImplementation((url: string) => {
      if (url === '/agent05/api/reference/analyze') {
        return Promise.reject({ response: { data: { detail: 'unsupported_reference_type' } } })
      }
      return Promise.resolve({ data: { cancelled: true } })
    })
    render(<App />)
    const user = userEvent.setup()
    const file = new File(['broken pdf'], 'broken.pdf', { type: 'application/pdf' })

    await user.upload(await screen.findByLabelText('上传参考文件'), file)

    expect(await screen.findByText('文件上传或分析失败：unsupported_reference_type')).toBeInTheDocument()
  })

  it('upload pptx keeps existing source behavior', async () => {
    mockedAxios.post.mockImplementation((url: string) => {
      if (url === '/agent05/api/templates/upload') {
        return Promise.resolve({ data: { relative_path: 'uploads/session-a1b2c3d4e5f6/季度复盘初稿.pptx' } })
      }
      return Promise.resolve({ data: { cancelled: true } })
    })
    render(<App />)
    const user = userEvent.setup()
    const file = new File(['pptx bytes'], '季度复盘初稿.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    })

    await user.upload(await screen.findByLabelText('上传参考文件'), file)

    expect(await screen.findByText('保留模板编辑内容')).toBeInTheDocument()
    expect(screen.queryByText('源文件')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '页面' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('自定义页面数量')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('参考分析')).not.toBeInTheDocument()
    expect(mockedAxios.post).not.toHaveBeenCalledWith('/agent05/api/reference/analyze', expect.any(FormData))
  })

  it('does not render template disclaimer as the primary bottom bar', async () => {
    render(<App />)

    await screen.findByLabelText('生成控制台')
    expect(screen.queryByText('内置模板仅供个人学习，企业商用请替换自定义模板')).not.toBeInTheDocument()
  })

  it('accepts multiple selected files and shows each file name with type', async () => {
    mockedAxios.post.mockImplementation((url: string) => {
      if (url === '/agent05/api/reference/analyze') {
        return Promise.resolve({ data: pdfReferencePayload })
      }
      return Promise.resolve({ data: { cancelled: true } })
    })
    render(<App />)
    const user = userEvent.setup()
    const pdfFile = new File(['pdf bytes'], '季度报告.pdf', { type: 'application/pdf' })
    const imageFile = new File(['image bytes'], '参考图.png', { type: 'image/png' })

    const uploadInput = await screen.findByLabelText('上传参考文件')
    expect(uploadInput).toHaveAttribute('multiple')
    await user.upload(uploadInput, [pdfFile, imageFile])

    const selectedFiles = await screen.findByLabelText('已选择文件')
    expect(within(selectedFiles).getByText('季度报告.pdf')).toBeInTheDocument()
    expect(within(selectedFiles).getByText('PDF参考')).toBeInTheDocument()
    expect(within(selectedFiles).getByText('参考图.png')).toBeInTheDocument()
    expect(within(selectedFiles).getByText('图片参考')).toBeInTheDocument()
  })

  it('no upload shows prompt placeholder without enhancement text', async () => {
    render(<App />)

    const prompt = await screen.findByLabelText('Prompt')
    expect(prompt).toHaveAttribute('placeholder', expect.stringContaining('商务深蓝风的季度经营复盘'))
    expect(prompt).toHaveAttribute('placeholder', expect.not.stringContaining('已上传参考文件'))
  })

  it('page_count is not rendered as a primary compose control', async () => {
    render(<App />)

    await screen.findByLabelText('生成控制台')
    expect(screen.queryByRole('combobox', { name: '页面' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('自定义页面数量')).not.toBeInTheDocument()
  })

  it('reference upload keeps mode a generate payload', async () => {
    mockedAxios.post.mockImplementation((url: string) => {
      if (url === '/agent05/api/reference/analyze') {
        return Promise.resolve({ data: pdfReferencePayload })
      }
      return Promise.resolve({ data: { cancelled: true } })
    })
    render(<App />)
    const user = userEvent.setup()
    const file = new File(['pdf bytes'], '季度报告.pdf', { type: 'application/pdf' })

    await user.upload(await screen.findByLabelText('上传参考文件'), file)
    await user.type(screen.getByLabelText('Prompt'), '根据参考文件生成季度汇报')
    await user.click(screen.getByRole('button', { name: 'Generate PPT' }))

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    expect(MockWebSocket.instances[0].sent[0]).toMatchObject({
      type: 'generate',
      payload: {
        mode: 'prompt_to_ppt',
        prompt: '根据参考文件生成季度汇报',
        page_count: null,
        reference_analysis: pdfReferencePayload
      }
    })
  })

  it('preview shows enhancement summary after generation with reference', async () => {
    mockedAxios.post.mockImplementation((url: string) => {
      if (url === '/agent05/api/reference/analyze') {
        return Promise.resolve({ data: pdfReferencePayload })
      }
      return Promise.resolve({ data: { cancelled: true } })
    })
    render(<App />)
    const user = userEvent.setup()
    const file = new File(['pdf bytes'], '季度报告.pdf', { type: 'application/pdf' })

    await user.upload(await screen.findByLabelText('上传参考文件'), file)
    await user.type(screen.getByLabelText('Prompt'), '根据参考文件生成季度汇报')
    await user.click(screen.getByRole('button', { name: 'Generate PPT' }))
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    act(() => {
      MockWebSocket.instances[0].emit({
        type: 'complete',
        result: {
          file_name: 'output.pptx',
          file_id: '20260604-120000_reference/output.pptx',
          preview: { slide_count: 1, slides: [{ slide_number: 1, title: '季度汇报', bullets: ['渠道增长'] }] }
        }
      })
    })

    const previewPanel = screen.getByLabelText('PPT 成品最大预览')
    expect(await within(previewPanel).findByText(/Prompt 已增强/)).toBeInTheDocument()
    expect(within(previewPanel).getByText(/季度报告.pdf/)).toBeInTheDocument()
    expect(within(previewPanel).getByText(/#1F3A93/)).toBeInTheDocument()
    expect(within(previewPanel).getByText(/architecture-deck/)).toBeInTheDocument()
  })

  it('history item shows prompt prefix instead of output filename', async () => {
    mockedAxios.get.mockImplementation((url: string) => {
      const normalizedUrl = url.replace(/^\/agent05/, '')
      if (normalizedUrl === '/api/generate/status') {
        return Promise.resolve({ data: { schema: 'ppt-maker-generation-status/v1', in_progress: false } })
      }
      if (normalizedUrl === '/api/files') {
        return Promise.resolve({
          data: {
            schema: 'ppt-maker-files/v1',
            files: [
              {
                file_id: '20260604-120000_history/output.pptx',
                file_name: 'output.pptx',
                generated_at: '2026-06-04T12:00:00',
                page_count: 10,
                has_preview: true
              }
            ]
          }
        })
      }
      return Promise.resolve({ data: {} })
    })
    render(<App />)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: '新建 PPT' }))
    await user.type(screen.getByLabelText('Prompt'), '根据参考文件生成季度汇报，重点分析渠道增长和客户留存')
    await user.click(screen.getByRole('button', { name: 'Generate PPT' }))
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    act(() => {
      MockWebSocket.instances[0].emit({
        type: 'complete',
        result: {
          file_name: 'output.pptx',
          file_id: '20260604-120000_history/output.pptx',
          preview: { slide_count: 1, slides: [{ slide_number: 1, title: '季度汇报', bullets: ['渠道增长'] }] }
        }
      })
    })
    await user.click(await screen.findByRole('button', { name: '历史记录' }))

    const historyPanel = within(screen.getByLabelText('历史记录')).getByLabelText('完整历史')
    expect(await within(historyPanel).findByText('模板生成')).toBeInTheDocument()
    expect(within(historyPanel).getAllByText(/根据参考文件生成季度汇报/).length).toBeGreaterThan(0)
    expect(within(historyPanel).queryByText('output.pptx')).not.toBeInTheDocument()
  })

  it('restores in-progress generation status after reload', async () => {
    mockedAxios.get.mockImplementation((url: string) => {
      const normalizedUrl = url.replace(/^\/agent05/, '')
      if (normalizedUrl === '/api/generate/status') {
        return Promise.resolve({
          data: {
            schema: 'ppt-maker-generation-status/v1',
            in_progress: true,
            stage: 'building_pptx',
            message: '正在构建 PPTX...'
          }
        })
      }
      if (normalizedUrl === '/api/files') {
        return Promise.resolve({ data: { schema: 'ppt-maker-files/v1', files: [] } })
      }
      return Promise.resolve({ data: {} })
    })

    render(<App />)

    expect((await screen.findAllByText('正在构建 PPTX...')).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(MockWebSocket.instances).toHaveLength(0)
  })

  it('restores generation form values from local storage', async () => {
    window.localStorage.setItem(
      'ppt-maker:generation-form:v1',
      JSON.stringify({
        prompt: '恢复一份经营复盘',
        pageCount: 7,
        style: '科技蓝',
        purpose: '内部评审',
        customTemplatePath: 'uploads/custom-template.pptx'
      })
    )
    render(<App />)
    const user = userEvent.setup()

    expect(await screen.findByDisplayValue('恢复一份经营复盘')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '页面' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('自定义页面数量')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '高级参数' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('风格偏好')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('用途')).not.toBeInTheDocument()
  })

  it('polls restored generation status and previews latest file after completion', async () => {
    let statusCalls = 0
    mockedAxios.get.mockImplementation((url: string) => {
      const normalizedUrl = url.replace(/^\/agent05/, '')
      if (normalizedUrl === '/api/generate/status') {
        statusCalls += 1
        return Promise.resolve({
          data:
            statusCalls === 1
              ? {
                  schema: 'ppt-maker-generation-status/v1',
                  in_progress: true,
                  stage: 'quality_check',
                  message: '正在进行质量检查...'
                }
              : { schema: 'ppt-maker-generation-status/v1', in_progress: false }
        })
      }
      if (normalizedUrl === '/api/files') {
        return Promise.resolve({
          data: {
            schema: 'ppt-maker-files/v1',
            files: [
              {
                file_id: '20260604-110000_restore/output.pptx',
                file_name: 'output.pptx',
                generated_at: '2026-06-04T11:00:00',
                page_count: 5,
                has_preview: true
              }
            ]
          }
        })
      }
      if (normalizedUrl === '/api/files/20260604-110000_restore/output.pptx/preview') {
        return Promise.resolve({
          data: {
            slide_count: 1,
            slides: [{ slide_number: 1, title: '恢复完成', bullets: ['后台任务继续运行'] }]
          }
        })
      }
      if (normalizedUrl === '/api/files/20260604-110000_restore/output.pptx/visual-preview') {
        return Promise.resolve({
          data: {
            schema: 'ppt-maker-visual-preview/v1',
            file_id: '20260604-110000_restore/output.pptx',
            preview_url: '/api/files/20260604-110000_restore/output.pptx/visual-preview/index.html',
            mode: 'quicklook_html'
          }
        })
      }
      return Promise.resolve({ data: {} })
    })

    render(<App />)

    expect((await screen.findAllByText('正在进行质量检查...')).length).toBeGreaterThan(0)

    expect(await screen.findByTitle('PPT 成品预览', {}, { timeout: 3500 })).toHaveAttribute(
      'src',
      '/agent05/api/files/20260604-110000_restore/output.pptx/visual-preview/index.html'
    )
    expect(screen.getByRole('link', { name: '下载 .pptx' })).toHaveAttribute('href', '/agent05/api/files/20260604-110000_restore/output.pptx/download')
  })
})
