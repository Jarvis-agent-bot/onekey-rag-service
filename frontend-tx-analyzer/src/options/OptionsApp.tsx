import { useState, useEffect } from 'react'
import { Shield, Save, RotateCcw, Trash2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { ExtensionSettings } from '@/types/extension'
import { DEFAULT_SETTINGS } from '@/types/extension'

export function OptionsApp() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [historyCount, setHistoryCount] = useState(0)

  useEffect(() => {
    loadSettings()
    loadHistoryCount()
  }, [])

  const loadSettings = async () => {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' })
    if (response && !response.error) {
      setSettings({ ...DEFAULT_SETTINGS, ...response })
    }
  }

  const loadHistoryCount = async () => {
    const storage = await chrome.storage.local.get('tx_analyzer_history')
    setHistoryCount((storage.tx_analyzer_history || []).length)
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await chrome.runtime.sendMessage({
        type: 'SAVE_SETTINGS',
        payload: settings,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      console.error('Failed to save settings:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS)
  }

  const handleClearHistory = async () => {
    if (confirm('确认清空所有分析历史吗？')) {
      await chrome.storage.local.remove('tx_analyzer_history')
      setHistoryCount(0)
    }
  }

  const updateSetting = <K extends keyof ExtensionSettings>(
    key: K,
    value: ExtensionSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">TX Analyzer 设置</h1>
            <p className="text-muted-foreground">
              配置交易分析偏好与拦截策略
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* API Settings */}
          <Card>
            <CardHeader>
              <CardTitle>API 配置</CardTitle>
              <CardDescription>
                配置交易分析后端接口
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apiEndpoint">API 地址</Label>
                <Input
                  id="apiEndpoint"
                  value={settings.apiEndpoint}
                  onChange={(e) => updateSetting('apiEndpoint', e.target.value)}
                  placeholder={DEFAULT_SETTINGS.apiEndpoint}
                />
                <p className="text-xs text-muted-foreground">
                  TX Analyzer 后端服务基础地址（不含 /api 前缀）
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Behavior Settings */}
          <Card>
            <CardHeader>
              <CardTitle>拦截行为</CardTitle>
              <CardDescription>
                控制插件的拦截与分析方式
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>交易拦截</Label>
                  <p className="text-sm text-muted-foreground">
                    在签名前拦截交易进行分析
                  </p>
                </div>
                <Switch
                  checked={settings.interceptEnabled}
                  onCheckedChange={(checked) => updateSetting('interceptEnabled', checked)}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>自动分析</Label>
                  <p className="text-sm text-muted-foreground">
                    自动分析被拦截的交易
                  </p>
                </div>
                <Switch
                  checked={settings.autoAnalyze}
                  onCheckedChange={(checked) => updateSetting('autoAnalyze', checked)}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>通知提示</Label>
                  <p className="text-sm text-muted-foreground">
                    高风险交易触发通知
                  </p>
                </div>
                <Switch
                  checked={settings.showNotifications}
                  onCheckedChange={(checked) => updateSetting('showNotifications', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Language Settings */}
          <Card>
            <CardHeader>
              <CardTitle>语言</CardTitle>
              <CardDescription>
                选择分析解释的语言
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="language">解释语言</Label>
                <Select
                  value={settings.language}
                  onValueChange={(value) => updateSetting('language', value as 'zh' | 'en')}
                >
                  <SelectTrigger id="language" className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zh">中文</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Data Management */}
          <Card>
            <CardHeader>
              <CardTitle>数据管理</CardTitle>
              <CardDescription>
                管理本地分析记录
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>分析历史</Label>
                  <p className="text-sm text-muted-foreground">
                    本地已保存 {historyCount} 条记录
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleClearHistory}
                  disabled={historyCount === 0}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  清空历史
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              恢复默认
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {saved ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  已保存
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  保存设置
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-sm text-muted-foreground">
          <p>TX Analyzer v1.0.0</p>
          <p>由 OneKey RAG 驱动</p>
        </div>
      </div>
    </div>
  )
}
