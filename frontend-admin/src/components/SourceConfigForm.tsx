import { Input } from "./ui/input";
import { TagInput } from "./ui/tag-input";
import { Select } from "./ui/select";

export interface SourceConfig {
  base_url: string;
  sitemap_url: string;
  seed_urls: string[];
  include_patterns: string[];
  exclude_patterns: string[];
  max_pages: number;
}

interface SourceConfigFormProps {
  name: string;
  onNameChange: (name: string) => void;
  status: string;
  onStatusChange: (status: string) => void;
  config: SourceConfig;
  onConfigChange: (config: SourceConfig) => void;
  disabled?: boolean;
  showNameField?: boolean;
  showStatusField?: boolean;
}

export function SourceConfigForm({
  name,
  onNameChange,
  status,
  onStatusChange,
  config,
  onConfigChange,
  disabled,
  showNameField = true,
  showStatusField = true,
}: SourceConfigFormProps) {
  const updateConfig = <K extends keyof SourceConfig>(key: K, value: SourceConfig[K]) => {
    onConfigChange({ ...config, [key]: value });
  };

  return (
    <div className="space-y-4">
      {/* 基本信息 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {showNameField && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">数据源名称</label>
            <Input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="例如：OneKey 文档爬虫"
              disabled={disabled}
            />
          </div>
        )}
        {showStatusField && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">状态</label>
            <Select value={status} onChange={(e) => onStatusChange(e.target.value)} disabled={disabled}>
              <option value="active">启用</option>
              <option value="disabled">禁用</option>
            </Select>
          </div>
        )}
      </div>

      {/* 网站配置 */}
      <div className="space-y-4 rounded-lg border border-border/50 bg-background/30 p-4">
        <div className="text-sm font-medium text-foreground">网站配置</div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            网站地址 <span className="text-destructive">*</span>
          </label>
          <Input
            value={config.base_url}
            onChange={(e) => updateConfig("base_url", e.target.value)}
            placeholder="https://docs.example.com"
            disabled={disabled}
          />
          <div className="text-[11px] text-muted-foreground">爬虫的基础 URL，所有抓取的页面都应该在这个域名下</div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Sitemap URL</label>
          <Input
            value={config.sitemap_url}
            onChange={(e) => updateConfig("sitemap_url", e.target.value)}
            placeholder="https://docs.example.com/sitemap.xml"
            disabled={disabled}
          />
          <div className="text-[11px] text-muted-foreground">可选，如果网站有 sitemap.xml，可以加速发现所有页面</div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">种子页面</label>
          <TagInput
            value={config.seed_urls}
            onChange={(v) => updateConfig("seed_urls", v)}
            placeholder="输入 URL 后按回车添加"
            disabled={disabled}
          />
          <div className="text-[11px] text-muted-foreground">可选，爬虫从这些页面开始抓取，适合没有 sitemap 的网站</div>
        </div>
      </div>

      {/* 过滤规则 */}
      <div className="space-y-4 rounded-lg border border-border/50 bg-background/30 p-4">
        <div className="text-sm font-medium text-foreground">过滤规则</div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">包含规则</label>
          <TagInput
            value={config.include_patterns}
            onChange={(v) => updateConfig("include_patterns", v)}
            placeholder="例如：/docs/* 或 /guide/*"
            disabled={disabled}
          />
          <div className="text-[11px] text-muted-foreground">只抓取匹配这些模式的 URL（留空表示全部）</div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">排除规则</label>
          <TagInput
            value={config.exclude_patterns}
            onChange={(v) => updateConfig("exclude_patterns", v)}
            placeholder="例如：/api/* 或 /changelog/*"
            disabled={disabled}
          />
          <div className="text-[11px] text-muted-foreground">跳过匹配这些模式的 URL</div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">最大页面数</label>
          <Input
            type="number"
            value={config.max_pages}
            onChange={(e) => updateConfig("max_pages", parseInt(e.target.value) || 2000)}
            min={1}
            max={10000}
            disabled={disabled}
          />
          <div className="text-[11px] text-muted-foreground">单次抓取的最大页面数量，防止无限抓取</div>
        </div>
      </div>
    </div>
  );
}

// Helper to parse JSON config to SourceConfig
export function parseSourceConfig(config: Record<string, unknown>): SourceConfig {
  return {
    base_url: (config.base_url as string) || "",
    sitemap_url: (config.sitemap_url as string) || "",
    seed_urls: Array.isArray(config.seed_urls) ? config.seed_urls : [],
    include_patterns: Array.isArray(config.include_patterns) ? config.include_patterns : [],
    exclude_patterns: Array.isArray(config.exclude_patterns) ? config.exclude_patterns : [],
    max_pages: typeof config.max_pages === "number" ? config.max_pages : 2000,
  };
}

// Helper to convert SourceConfig to JSON
export function sourceConfigToJson(config: SourceConfig): Record<string, unknown> {
  return {
    base_url: config.base_url,
    sitemap_url: config.sitemap_url || undefined,
    seed_urls: config.seed_urls.length > 0 ? config.seed_urls : undefined,
    include_patterns: config.include_patterns.length > 0 ? config.include_patterns : undefined,
    exclude_patterns: config.exclude_patterns.length > 0 ? config.exclude_patterns : undefined,
    max_pages: config.max_pages,
  };
}

// Default empty config
export function getDefaultSourceConfig(): SourceConfig {
  return {
    base_url: "",
    sitemap_url: "",
    seed_urls: [],
    include_patterns: [],
    exclude_patterns: [],
    max_pages: 2000,
  };
}
