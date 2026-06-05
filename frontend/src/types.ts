export type Stage =
  | 'idle'
  | 'analyzing_reference'
  | 'selecting_template'
  | 'analyzing_source'
  | 'editing_pptx'
  | 'generating_outline'
  | 'building_pptx'
  | 'quality_check'
  | 'complete'
  | 'error'
  | 'cancelled'

export interface GenerationStatus {
  schema: string
  in_progress: boolean
  task_id?: string
  stage?: Stage
  message?: string
  work_dir?: string
}

export interface GeneratedFile {
  file_id: string
  file_name: string
  generated_at?: string | null
  page_count?: number | null
  has_preview?: boolean
}

export interface SlidePreview {
  slide_number: number
  title?: string
  role?: string
  bullets?: string[]
  texts?: Array<{ text: string }>
}

export interface PreviewPayload {
  slide_count?: number
  slides?: SlidePreview[]
}

export interface VisualPreviewPayload {
  schema: string
  file_id: string
  preview_url?: string
  mode?: string
  error?: string
  message?: string
}

export interface TemplateCandidate {
  slug: string
  name: string
  style_description?: string
  page_count?: number
  preview_url?: string
}

export interface GeneratePayload {
  mode?: 'prompt_to_ppt' | 'template_preserving_edit'
  prompt: string
  page_count: number | null
  style: string | null
  purpose?: string
  custom_template_path?: string
  source_pptx_path?: string
  reference_analysis?: ReferenceAnalysisPayload
}

export interface CompleteResult {
  file_name: string
  file_id: string
  preview: PreviewPayload
  task_dir?: string
}

export interface SourceAnalysisSlide {
  slide_number: number
  role?: string
  texts?: string[]
}

export interface ReferenceAnalysisPayload {
  schema: string
  ref_id: string
  file_name: string
  file_type: 'pptx' | 'pdf' | 'image' | string
  page_count: number | null
  text_chars: number
  extracted_text: string
  dominant_colors: string[]
  color_style_hint: string
  recommended_templates: string[]
  screenshot_url?: string | null
  extraction_errors: string[]
}
