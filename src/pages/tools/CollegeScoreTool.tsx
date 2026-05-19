import { useState } from 'react'
import { Card } from 'antd'
import CollegeScoreNormalTool from './CollegeScoreNormalTool'
import CollegeScoreArtTool from './CollegeScoreArtTool'

type CollegeScoreTabKey = 'normal' | 'art'

const COLLEGE_SCORE_TABS = [
  {
    key: 'normal',
    tab: '普通类',
  },
  {
    key: 'art',
    tab: '艺体类',
  },
]

export default function CollegeScoreTool() {
  const [activeTabKey, setActiveTabKey] = useState<CollegeScoreTabKey>('normal')

  return (
    <Card
      title="院校分提取"
      activeTabKey={activeTabKey}
      tabList={COLLEGE_SCORE_TABS}
      onTabChange={(key) => setActiveTabKey(key as CollegeScoreTabKey)}
    >
      <div style={{ display: activeTabKey === 'normal' ? 'block' : 'none' }}>
        <CollegeScoreNormalTool embedded />
      </div>

      <div style={{ display: activeTabKey === 'art' ? 'block' : 'none' }}>
        <CollegeScoreArtTool embedded />
      </div>
    </Card>
  )
}
