<script lang="ts">
  interface Props {
    diagnostics: string[];
  }
  let { diagnostics }: Props = $props();
</script>

{#if diagnostics.length}
  <aside class="theme-notice" data-state="warning" role="status">
    <strong>Some themes were not loaded.</strong>
    <ul class="theme-notice-list">
      {#each diagnostics as diagnostic (diagnostic)}<li>{diagnostic}</li>{/each}
    </ul>
  </aside>
{/if}
