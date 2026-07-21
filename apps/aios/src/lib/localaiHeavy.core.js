/** Models that swap llama-swap onto the heavy MLX worker (must not pile up). */
export function isHeavyLocalModel(model) {
  const id = String(model || '')
  return (
    id === 'llm-fast' ||
    id === 'llm-quality' ||
    id.startsWith('vlm-') ||
    id.startsWith('image-')
  )
}
