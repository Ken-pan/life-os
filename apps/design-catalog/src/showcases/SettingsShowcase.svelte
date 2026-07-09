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
