<script lang="ts">
  interface Props {
    diagnostics: string[];
  }
  let { diagnostics }: Props = $props();
</script>

{#if diagnostics.length}
  <aside class="theme-notice" role="status">
    <strong>Some themes were not loaded.</strong>
    <ul>
      {#each diagnostics as diagnostic (diagnostic)}<li>{diagnostic}</li>{/each}
    </ul>
  </aside>
{/if}
