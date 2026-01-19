export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type ProjectStatus = 'active' | 'inactive' | 'deprecated'
export type ProjectCategory =
  | 'liquid-staking'
  | 'restaking'
  | 'lending'
  | 'dex'
  | 'dex-aggregator'
  | 'yield'
  | 'derivatives'
  | 'stablecoin'
  | 'bridge'
  | 'cdp'

export interface ScoreItem {
  score: number
  weight: number
  factors: string[]
}

export interface ScoreDetails {
  contract_security: ScoreItem
  team: ScoreItem
  tokenomics: ScoreItem
  operation: ScoreItem
}

export interface TokenInfo {
  symbol: string
  address: string
}

export interface SourceLink {
  type: string
  title: string
  url: string
}

export interface DefiProject {
  id: string
  name: string
  slug: string
  category: ProjectCategory
  category_label: string
  logo_url: string | null
  website: string | null
  contract_address: string | null
  description: string | null
  defillama_id: string | null
  tokens: TokenInfo[]
  overall_score: number
  risk_level: RiskLevel
  risk_level_label: string
  risk_level_color: string
  score_details: ScoreDetails
  risk_warnings: string[]
  summary: string | null
  tvl: number | null
  tvl_formatted: string | null
  tvl_updated_at: string | null
  status: ProjectStatus
  is_featured: boolean
  display_order: number
  source_links: SourceLink[]
  created_at: string
  updated_at: string
}

export interface ProjectListItem {
  id: string
  name: string
  slug: string
  category: ProjectCategory
  category_label: string
  logo_url: string | null
  overall_score: number
  risk_level: RiskLevel
  risk_level_label: string
  risk_level_color: string
  tvl: number | null
  tvl_formatted: string | null
  is_featured: boolean
}

export interface ProjectListResponse {
  total: number
  page: number
  page_size: number
  total_pages: number
  items: ProjectListItem[]
}

export interface CategoryInfo {
  id: string
  label: string
  count: number
}

export interface StatsResponse {
  total_projects: number
  published_projects: number
  featured_projects: number
  total_tvl: number | null
  total_tvl_formatted: string | null
  category_stats: CategoryInfo[]
  risk_distribution: Record<RiskLevel, number>
}

export const CATEGORY_LABELS: Record<ProjectCategory, string> = {
  'liquid-staking': '流动性质押',
  'restaking': '再质押',
  'lending': '借贷',
  'dex': 'DEX',
  'dex-aggregator': 'DEX 聚合器',
  'yield': '收益聚合',
  'derivatives': '衍生品',
  'stablecoin': '稳定币',
  'bridge': '跨链桥',
  'cdp': 'CDP',
}

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  critical: '极高风险',
}
