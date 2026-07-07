import type { FinanceData } from '../types'
import type { Dashboard } from '../hooks/useDashboard'
import type { Projection } from '../hooks/useProjection'
import { useLocale } from '../i18n/context'
import type { GoTab } from './AppShell'
import { HorizontalTabs, TabPanel } from './HorizontalTabs'
import { TodayView } from './TodayView'
import { OverviewView } from './OverviewView'
import type { HomeSection } from '../lib/appRoute'

export function HomeHubView({
  data,
  dashboard,
  projection,
  active,
  onChange,
  onOpenSpend,
  onGoTab,
  onGoStocks,
}: {
  data: FinanceData
  dashboard: Dashboard
  projection: Projection
  active: HomeSection
  onChange: (section: HomeSection) => void
  onOpenSpend: () => void
  onGoTab: GoTab
  onGoStocks: (snapshotId?: string) => void
}) {
  const { t } = useLocale()
  const sections: { id: HomeSection; label: string }[] = [
    { id: 'today', label: t('nav.today') },
    { id: 'overview', label: t('nav.overview') },
  ]

  return (
    <HorizontalTabs
      items={sections}
      activeId={active}
      ariaLabel={t('nav.homeSectionAria')}
      onChange={(next) => onChange(next as HomeSection)}
    >
      <TabPanel tabId="today" active={active === 'today'}>
        <TodayView
          data={data}
          dashboard={dashboard}
          onOpenSpend={onOpenSpend}
          onGoTab={onGoTab}
        />
      </TabPanel>
      <TabPanel tabId="overview" active={active === 'overview'}>
        <OverviewView
          data={data}
          projection={projection}
          dashboard={dashboard}
          onOpenSpend={onOpenSpend}
          onGoTab={onGoTab}
          onGoStocks={onGoStocks}
          tabActive={active === 'overview'}
        />
      </TabPanel>
    </HorizontalTabs>
  )
}
