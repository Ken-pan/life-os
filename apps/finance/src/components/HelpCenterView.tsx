import type { GoTab } from './AppShell'
import { GettingStartedChecklist } from './GettingStartedChecklist'
import { useLocale } from '../i18n/context'
import { NavRouteReference } from './settings/AnalyticsPanel'

export function HelpCenterView({ onGoTab }: { onGoTab: GoTab }) {
  const { t } = useLocale()

  return (
    <div className="grid gap-4 help-center">
      <div className="card">
        <h3>{t('help.centerTitle')}</h3>
        <p className="muted-note">{t('help.centerIntro')}</p>
      </div>

      <GettingStartedChecklist onGoTab={onGoTab} />

      <NavRouteReference />

      <div className="card">
        <h3>{t('help.treeTestTitle')}</h3>
        <p className="muted-note">{t('help.treeTestIntro')}</p>
        <ul className="help-task-list">
          <li>{t('help.treeTestTask1')}</li>
          <li>{t('help.treeTestTask2')}</li>
          <li>{t('help.treeTestTask3')}</li>
        </ul>
        <p className="muted-note text-sm mt-2">{t('help.treeTestDocHint')}</p>
      </div>
    </div>
  )
}
