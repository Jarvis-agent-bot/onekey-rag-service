// Chain information
export interface ChainInfo {
  chain_id: number
  name: string
  native_token: string
  explorer_url: string
}

// Analyze options
export interface AnalyzeOptions {
  include_explanation?: boolean
  include_trace?: boolean
  language?: 'zh' | 'en'
}

// Analyze request
export interface AnalyzeRequest {
  chain_id: number
  tx_hash: string
  options?: AnalyzeOptions
}

// Gas information
export interface GasInfo {
  gas_used: string
  gas_price: string
  fee_paid: string
}

// Decoded method
export interface DecodedMethod {
  signature: string
  selector: string
  name: string
  inputs: MethodInput[]
  abi_source: 'registry' | 'explorer' | 'signature_db' | 'unknown'
  abi_ref?: string
}

export interface MethodInput {
  name: string
  type: string
  value: unknown
}

// Decoded event
export interface DecodedEvent {
  name: string
  address: string
  log_index: number
  topics: string[]
  args: Record<string, unknown>
  event_type: string
}

// Behavior result
export type BehaviorType =
  | 'swap'
  | 'bridge'
  | 'stake'
  | 'unstake'
  | 'lend'
  | 'borrow'
  | 'repay'
  | 'liquidity_add'
  | 'liquidity_remove'
  | 'mint'
  | 'burn'
  | 'nft_trade'
  | 'transfer'
  | 'approve'
  | 'claim'
  | 'airdrop'
  | 'wrap'
  | 'unwrap'
  | 'unknown'

export interface BehaviorResult {
  type: BehaviorType
  confidence: 'high' | 'medium' | 'low'
  evidence: string[]
  details: Record<string, unknown>
}

// Risk flag
export interface RiskFlag {
  type: string
  severity: 'low' | 'medium' | 'high'
  evidence: string
  description: string
}

// Source information
export interface SourcesInfo {
  tx_receipt: string
  logs: string
  abi: string
}

export interface DiagnosticsInfo {
  abi: {
    status: string
    reason?: string
    source?: string
    ref?: string
    error?: string
  }
  method: {
    status: string
    reason?: string
    selector?: string
  }
  events: {
    status: string
    reason?: string
    logs_count?: number
  }
}

// Parse result
export interface ParseResult {
  version: string
  tx_hash: string
  chain_id: number
  block_number: number | null
  timestamp: number | null
  from: string
  to: string | null
  nonce: number | null
  tx_type: number | null
  value: string
  input: string
  gas: GasInfo
  status: 'success' | 'failed'
  method: DecodedMethod | null
  events: DecodedEvent[]
  behavior: BehaviorResult
  risk_flags: RiskFlag[]
  sources?: SourcesInfo
  diagnostics?: DiagnosticsInfo
}

// RAG explanation result
export type RiskLevel = 'low' | 'medium' | 'high' | 'unknown'

export interface SourceInfo {
  url: string
  title: string
  section_path?: string
  snippet?: string
  ref?: number | null
}

export interface ExplanationResult {
  summary: string
  risk_level: RiskLevel
  risk_reasons: string[]
  actions: Array<Record<string, unknown>>
  sources: SourceInfo[]
}

// Trace step
export interface TraceStep {
  name: string
  start_time: string
  end_time: string | null
  duration_ms: number | null
  input: Record<string, unknown>
  output: Record<string, unknown> | null
}

// Analyze response
export type AnalyzeStatus = 'success' | 'partial' | 'failed'

export interface AnalyzeResponse {
  trace_id: string
  status: AnalyzeStatus
  parse_result: ParseResult | null
  explanation: ExplanationResult | null
  timings: Record<string, number>
  error: string | null
  trace_log: TraceStep[] | null
}

// Parse only response
export interface ParseResponse {
  trace_id: string
  status: 'success' | 'failed'
  parse_result: ParseResult | null
  timings: Record<string, number>
  error: string | null
}

// Health check response
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy'
  version: string
  dependencies: Record<string, string>
}

// History item (for future use)
export interface HistoryItem {
  trace_id: string
  chain_id: number
  tx_hash: string
  behavior_type: string | null
  risk_level: RiskLevel | null
  status: AnalyzeStatus
  created_at: string
  total_ms: number | null
}

export interface HistoryResponse {
  items: HistoryItem[]
  total: number
  page: number
  page_size: number
}

// ==================== 新增：Calldata 解码 ====================

export interface DecodeCalldataRequest {
  calldata: string
  chain_id?: number
  to_address?: string
  from_address?: string
  value?: string
}

export interface DecodedCalldata {
  selector: string
  raw_data: string
  function_name: string
  function_signature: string
  inputs: MethodInput[]
  behavior_type: BehaviorType
  risk_level: RiskLevel
  risk_flags: RiskFlag[]
  warnings: string[]
  possible_signatures: string[]
  contract_type: string | null
}

export interface FormattedCalldata {
  function: {
    name: string
    selector: string
    signature: string
  }
  parameters: Array<{
    name: string
    type: string
    value: unknown
    display?: string
  }>
  analysis: {
    behavior: string
    risk_level: string
    warnings: string[]
  }
}

export interface DecodeCalldataResponse {
  trace_id: string
  status: 'success' | 'partial' | 'failed'
  result: DecodedCalldata | null
  formatted: FormattedCalldata | null
  error: string | null
  timings: Record<string, number>
}

// ==================== 新增：交易模拟 ====================

export interface SimulateRequest {
  chain_id: number
  from_address: string
  to_address: string
  data: string
  value?: string
  gas_limit?: number
}

export interface TokenTransfer {
  token_address: string
  from_address: string
  to_address: string
  amount: string
  symbol: string
  decimals: number
  formatted_amount: string
}

export interface AssetChange {
  address: string
  token: string
  symbol: string
  decimals: number
  change: string
  formatted_change: string
  direction: 'in' | 'out'
}

export interface SimulationResult {
  success: boolean
  gas_used: number
  return_data: string
  error_message: string
  token_transfers: TokenTransfer[]
  asset_changes: AssetChange[]
  risk_flags: RiskFlag[]
  warnings: string[]
}

export interface SimulateResponse {
  trace_id: string
  status: 'success' | 'failed'
  result: SimulationResult | null
  error: string | null
  timings: Record<string, number>
}

// ==================== 新增：签名解析 ====================

export interface DecodeSignatureRequest {
  data: Record<string, unknown> | string
  chain_id?: number
}

export interface EIP712Domain {
  name: string
  version: string
  chain_id: number | null
  verifying_contract: string
  salt: string
}

export interface SignatureAnalysis {
  signature_type: 'eip712' | 'personal_sign' | 'eth_sign' | 'unknown'
  primary_type: string
  domain: EIP712Domain | null
  message: Record<string, unknown>
  formatted_message: string
  action_type: string
  action_description: string
  affected_assets: Array<{
    type: string
    token?: string
    spender?: string
    amount?: string
  }>
  risk_level: RiskLevel
  risk_flags: RiskFlag[]
  warnings: string[]
  expires_at: string | null
  spender: string
}

export interface DecodeSignatureResponse {
  trace_id: string
  status: 'success' | 'failed'
  result: SignatureAnalysis | null
  summary: string | null
  error: string | null
}

// ==================== 新增：智能分析 ====================

export type InputType = 'tx_hash' | 'calldata' | 'signature' | 'unknown'

export interface SmartAnalyzeRequest {
  input: string
  chain_id?: number
  context?: {
    to_address?: string
    from_address?: string
    value?: string
  }
  options?: AnalyzeOptions
}

export interface SmartAnalyzeResponse {
  trace_id: string
  input_type: InputType
  status: AnalyzeStatus
  tx_result: ParseResult | null
  decode_result: DecodedCalldata | null
  signature_result: SignatureAnalysis | null
  explanation: ExplanationResult | null
  error: string | null
  timings: Record<string, number>
}
