import type { DefiProject, ProjectListItem, ProjectListResponse, StatsResponse, ProjectCategory, CategoryInfo } from '../types'

const BASE_URL = '/api/v1'

async function fetchApi<T>(url: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${url}`)
  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`)
  }
  return response.json()
}

export async function getProjects(params?: {
  category?: ProjectCategory
  risk_level?: string
  page?: number
  page_size?: number
}): Promise<ProjectListResponse> {
  const searchParams = new URLSearchParams()
  if (params?.category) searchParams.set('category', params.category)
  if (params?.risk_level) searchParams.set('risk_level', params.risk_level)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.page_size) searchParams.set('page_size', String(params.page_size))

  const query = searchParams.toString()
  return fetchApi<ProjectListResponse>(`/projects${query ? `?${query}` : ''}`)
}

export async function getProject(slug: string): Promise<DefiProject> {
  return fetchApi<DefiProject>(`/projects/${slug}`)
}

export async function getCategories(): Promise<CategoryInfo[]> {
  const response = await fetchApi<{ categories: CategoryInfo[] }>('/categories')
  return response.categories
}

export async function searchProjects(q: string): Promise<ProjectListItem[]> {
  return fetchApi<ProjectListItem[]>(`/search?q=${encodeURIComponent(q)}`)
}

export async function getStats(): Promise<StatsResponse> {
  return fetchApi<StatsResponse>('/stats')
}
