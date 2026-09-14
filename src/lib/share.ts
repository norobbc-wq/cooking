export async function shareShoppingList(title: string, items: string[]) {
  const text = `🛒 قائمة التسوّق: ${title}\n\n${items.map((item) => `• ${item}`).join('\n')}`
  if (navigator.share) { await navigator.share({ title: 'مطبخنا', text }); return }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
}
