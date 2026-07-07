import type { GoTab } from './AppShell'
import { useLocale } from '../i18n/context'
import { trackFunnel, FUNNEL_EVENTS } from '../lib/analytics'

const STEPS = [
  { key: 'accounts', tab: 'accounts' as const },
  { key: 'fixed', tab: 'history' as const, section: 'fixed' as const },
  { key: 'import', tab: 'review' as const, section: 'import' as const },
] as const

export function GettingStartedChecklist({ onGoTab }: { onGoTab: GoTab }) {
  const { t } = useLocale()

  return (
    <div className="card getting-started">
      <h3 className="mb-2">{t('onboarding.title')}</h3>
      <p className="muted-note mb-3">{t('onboarding.subtitle')}</p>
      <ol className="getting-started-steps">
        {STEPS.map((step, index) => (
          <li key={step.key}>
            <button
              type="button"
              className="getting-started-step"
              onClick={() => {
                trackFunnel(FUNNEL_EVENTS.onboardingStep, { step: step.key })
                onGoTab(step.tab, 'section' in step ? step.section : undefined)
              }}
            >
              <span className="getting-started-step-index">{index + 1}</span>
              <span>
                <strong>{t(`onboarding.step.${step.key}.title`)}</strong>
                <span className="meta block">
                  {t(`onboarding.step.${step.key}.hint`)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
