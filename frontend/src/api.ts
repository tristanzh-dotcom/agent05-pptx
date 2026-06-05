import axios from 'axios'

import type { GeneratedFile, GenerationStatus, PreviewPayload, ReferenceAnalysisPayload, VisualPreviewPayload } from './types'

const BASE = '/agent05'

export async function getStatus(): Promise<GenerationStatus> {
  const response = await axios.get(`${BASE}/api/generate/status`)
  return response.data
}

export async function getFiles(): Promise<GeneratedFile[]> {
  const response = await axios.get(`${BASE}/api/files`)
  return response.data.files ?? []
}

export async function getPreview(fileId: string): Promise<PreviewPayload> {
  const response = await axios.get(`${BASE}/api/files/${fileId}/preview`)
  return response.data
}

export async function getVisualPreview(fileId: string): Promise<VisualPreviewPayload> {
  const response = await axios.get(`${BASE}/api/files/${fileId}/visual-preview`)
  return response.data
}

export async function cancelGeneration(): Promise<void> {
  await axios.post(`${BASE}/api/generate/cancel`)
}

export async function deleteFile(fileId: string): Promise<void> {
  await axios.delete(`${BASE}/api/files/${fileId}`)
}

export async function uploadTemplate(file: File): Promise<{ relative_path: string }> {
  const data = new FormData()
  data.append('file', file)
  const response = await axios.post(`${BASE}/api/templates/upload`, data)
  return response.data
}

export async function analyzeReference(file: File): Promise<ReferenceAnalysisPayload> {
  const data = new FormData()
  data.append('file', file)
  const response = await axios.post(`${BASE}/api/reference/analyze`, data)
  return response.data
}

export function downloadUrl(fileId: string): string {
  return `${BASE}/api/files/${fileId}/download`
}

export function agentAssetUrl(url: string): string {
  if (/^https?:\/\//.test(url) || url.startsWith(`${BASE}/`)) {
    return url
  }
  if (url.startsWith('/api/')) {
    return `${BASE}${url}`
  }
  return url
}
