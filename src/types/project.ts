export interface ProjectMeta {
  id: string
  name: string
  genre: string
  description: string
  status: string
  target_words: number
  created_at: string
  updated_at: string
}

export interface CreateProjectInput {
  name: string
  genre: string
  description: string
  target_words: number
}

export interface UpdateProjectInput {
  projectId: string
  name?: string
  genre?: string
  description?: string
  status?: string
  targetWords?: number
}
