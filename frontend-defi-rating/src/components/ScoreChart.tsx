import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts'
import type { ScoreDetails } from '../types'

interface ScoreChartProps {
  scores: ScoreDetails
}

const SCORE_LABELS: Record<keyof ScoreDetails, string> = {
  contract_security: '合约安全',
  team: '团队背景',
  tokenomics: '代币经济',
  operation: '运营历史',
}

export default function ScoreChart({ scores }: ScoreChartProps) {
  if (!scores) {
    return <div className="h-[300px] flex items-center justify-center text-gray-400">暂无评分数据</div>
  }

  const data = Object.entries(scores).map(([key, value]) => ({
    subject: SCORE_LABELS[key as keyof ScoreDetails],
    score: value?.score ?? 0,
    fullMark: 100,
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={data}>
        <PolarGrid />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
        <Radar
          name="评分"
          dataKey="score"
          stroke="#3b82f6"
          fill="#3b82f6"
          fillOpacity={0.5}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}
