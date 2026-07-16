<script>
  import SettingsRow from '@life-os/platform-web/svelte/settings/row'
  import SettingsActionRow from '@life-os/platform-web/svelte/settings/action-row'
  import SettingsToggle from '@life-os/platform-web/svelte/settings/toggle'
  import SettingsToggleRow from '@life-os/platform-web/svelte/settings/toggle-row'
  import SettingsSegment from '@life-os/platform-web/svelte/settings/segment'
  import SettingsSection from '@life-os/platform-web/svelte/settings/section'
  import SettingsButtonGroup from '@life-os/platform-web/svelte/settings/button-group'
  import SettingsFileButton from '@life-os/platform-web/svelte/settings/file-button'
  import SettingsStackBlock from '@life-os/platform-web/svelte/settings/stack-block'
  import { SEGMENT_OPTIONS } from '../fixtures/settings.js'
  import CatalogStateBlock from '../lib/CatalogStateBlock.svelte'

  let toggleOn = $state(true)
  let segment = $state('week')
</script>

<section class="catalog-section" data-testid="showcase-settings">
  <h2 class="catalog-section__title">Settings components</h2>
  <div class="catalog-panel catalog-grid">
    <CatalogStateBlock stateId="default" label="Default">
      <SettingsSection title="Preferences" desc="From @life-os/platform-web">
        <SettingsToggleRow
          label="Enable notifications"
          desc="Push updates"
          checked={toggleOn}
          onchange={(v) => (toggleOn = v)}
        />
        <SettingsActionRow
          label="Export"
          buttonLabel="Export"
          onclick={() => {}}
        />
      </SettingsSection>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="disabled" label="Disabled">
      <SettingsSection title="Disabled row">
        <SettingsToggleRow label="Locked" checked={false} disabled={true} />
        <SettingsActionRow
          label="Export"
          buttonLabel="Export"
          disabled={true}
        />
      </SettingsSection>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="detail:segment" label="Segment + actions">
      <SettingsSection title="View">
        <SettingsRow label="Range">
          <SettingsSegment
            options={SEGMENT_OPTIONS}
            value={segment}
            onchange={(v) => (segment = v)}
            ariaLabel="Range"
          />
        </SettingsRow>
        <SettingsStackBlock label="Actions">
          <SettingsButtonGroup>
            <button type="button" class="btn-secondary">Cancel</button>
            <button type="button" class="btn-primary">Save</button>
          </SettingsButtonGroup>
        </SettingsStackBlock>
        <SettingsRow label="Import">
          <SettingsFileButton label="Import" onchange={() => {}} />
        </SettingsRow>
      </SettingsSection>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="destructive" label="Destructive action">
      <SettingsSection title="Account">
        <SettingsActionRow
          label="Sign out"
          desc="End session on this device"
          buttonLabel="Sign out"
          variant="danger"
          onclick={() => {}}
        />
        <div class="settings-row set-row">
          <div class="pref-copy">
            <div class="sr-label pref-label">Reset data</div>
            <div class="sr-desc pref-desc">Cannot be undone</div>
          </div>
          <div class="pref-control">
            <button type="button" class="btn-danger">Reset</button>
          </div>
        </div>
      </SettingsSection>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="detail:slot" label="Custom slot">
      <SettingsRow label="Slot" desc="Children in control column">
        {#snippet children()}
          <SettingsToggle checked={false} ariaLabel="Custom" />
        {/snippet}
      </SettingsRow>
    </CatalogStateBlock>

    <!--
      回归护栏:这两个态曾在生产被用户逮到。
      1) toggle 行控件为空(如通知权限被拒)—— 标签/描述必须正常换行,不能被空控件挤成 0 宽逐字竖排。
      2) seg--wrap 多个较长选项 —— 标签必须整体换行,不能在空格处把「上下 4 日」断成「上下 4 / 日」。
      改动共享 seg/settings 样式时,这里一眼就能看出有没有回归。
    -->
    <CatalogStateBlock stateId="detail:edge" label="Edge cases (regression guards)">
      <SettingsSection title="Edge cases">
        <div class="settings-row set-row settings-row--toggle">
          <div class="pref-copy">
            <div class="sr-label pref-label">Rest reminder</div>
            <div class="sr-desc pref-desc">
              Notification permission denied — re-enable it in your browser / system settings
            </div>
          </div>
          <div class="pref-control"></div>
        </div>
        <SettingsRow label="Program (long labels)">
          {#snippet children()}
            <div class="seg seg--wrap" role="group" aria-label="Program">
              <button type="button" class="on active">四日分化</button>
              <button type="button">上下 4 日</button>
              <button type="button">PPL 6 日</button>
              <button type="button">全身 3 日</button>
            </div>
          {/snippet}
        </SettingsRow>
      </SettingsSection>
    </CatalogStateBlock>

    <!--
      组合护栏:ButtonGroup 直挂 Section(auth 表单形态,home/fitness/finance 全在用)。
      契约:.set-group 内按钮组自动补 --inset-inline,按钮左右缘必须与上方输入框对齐;
      包在 StackBlock(.set-row)里时豁免,不得双重缩进。曾因契约缺失全线错位(2026-07-15)。
    -->
    <CatalogStateBlock stateId="detail:composition" label="Composition: form + ButtonGroup in Section">
      <SettingsSection title="Account (auth form)">
        <form onsubmit={(e) => e.preventDefault()}>
          <SettingsRow label="Email">
            {#snippet children()}
              <input type="email" placeholder="you@example.com" />
            {/snippet}
          </SettingsRow>
          <SettingsRow label="Password">
            {#snippet children()}
              <input type="password" placeholder="••••••" />
            {/snippet}
          </SettingsRow>
          <SettingsButtonGroup>
            <button type="submit" class="btn-primary">Sign in</button>
          </SettingsButtonGroup>
        </form>
      </SettingsSection>
    </CatalogStateBlock>
  </div>
</section>

<style>
  .catalog-section {
    padding: 24px;
  }
  .catalog-section__title {
    margin: 0 0 20px;
    font-size: 22px;
  }
</style>
