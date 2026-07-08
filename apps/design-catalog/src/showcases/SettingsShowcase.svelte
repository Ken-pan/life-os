<script>
  import SettingsRow from '@life-os/platform-web/svelte/settings/row'
  import SettingsActionRow from '@life-os/platform-web/svelte/settings/action-row'
  import SettingsToggle from '@life-os/platform-web/svelte/settings/toggle'
  import SettingsToggleRow from '@life-os/platform-web/svelte/settings/toggle-row'
  import SettingsSegment from '@life-os/platform-web/svelte/settings/segment'
  import SettingsSection from '@life-os/platform-web/svelte/settings/section'
  import SettingsButtonGroup from '@life-os/platform-web/svelte/settings/button-group'
  import SettingsFileButton from '@life-os/platform-web/svelte/settings/file-button'
  import { SEGMENT_OPTIONS } from '../fixtures/settings.js'

  let toggleOn = $state(true)
  let segment = $state('week')
</script>

<section class="catalog-section" data-testid="showcase-settings">
  <h2 class="catalog-section__title">Settings components</h2>
  <div class="catalog-panel catalog-grid">
    <div class="catalog-state-block">
      <p class="catalog-state-label">Default</p>
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
    </div>
    <div class="catalog-state-block">
      <p class="catalog-state-label">Disabled</p>
      <SettingsSection title="Disabled row">
        <SettingsToggleRow label="Locked" checked={false} disabled={true} />
        <SettingsActionRow
          label="Export"
          buttonLabel="Export"
          disabled={true}
        />
      </SettingsSection>
    </div>
    <div class="catalog-state-block">
      <p class="catalog-state-label">Segment + actions</p>
      <SettingsSection title="View">
        <SettingsSegment
          options={SEGMENT_OPTIONS}
          value={segment}
          onchange={(v) => (segment = v)}
          ariaLabel="Range"
        />
        <SettingsButtonGroup>
          <button type="button" class="btn-secondary">Cancel</button>
          <button type="button" class="btn-primary">Save</button>
        </SettingsButtonGroup>
        <SettingsFileButton label="Import" onchange={() => {}} />
      </SettingsSection>
    </div>
    <div class="catalog-state-block">
      <p class="catalog-state-label">Destructive action</p>
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
    </div>
    <div class="catalog-state-block">
      <p class="catalog-state-label">Custom slot</p>
      <SettingsRow label="Slot" desc="Children in control column">
        {#snippet children()}
          <SettingsToggle checked={false} ariaLabel="Custom" />
        {/snippet}
      </SettingsRow>
    </div>
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
