const UNIT_WORDS = ['كيلو جرام','كيلوجرام','كيلو غرام','كيلو','جرام','غرام','مل','ملليلتر','مليلتر','لتر','ملعقة كبيرة','ملعقة صغيرة','ملعقة طعام','ملعقة شاي','ملعقة','ملاعق كبيرة','ملاعق صغيرة','ملاعق','كوب','أكواب','كأس','كؤوس','فنجان','فناجين','بيالة','صحن','زبدية','طاسة','حبة','حبات','حبّة','قطعة','قطع','رأس','رؤوس','فص','فصوص','عود','أعواد','شريحة','شرائح','ورقة','أوراق','ظرف','أظرف','علبة','علب','كيس','أكياس','عبوة','عبوات','ربطة','حزمة','رشة','رشات','نصف','ربع','ثلث','ثمن','كبيرة','صغيرة','متوسطة','وسط','مطحون','مطحونة','مفروم','مفرومة','مقطع','مقطعة','مبشور','مبشورة','ناعم','ناعمة','خشن','خشنة','مجفف','مجففة','معلب','معلبة','طازج','طازجة','حسب الرغبة','حسب الحاجة','للتزيين','للدهن','للقلي','لقلي']

export function cleanIngredientLine(line: string) {
  let value = line.replace(/[0-9٠-٩½⅓¼⅕⅙⅛⅔⅖¾⅗⅜⅘⅝⅞/.]/g, ' ')
  for (const word of UNIT_WORDS) value = value.replace(new RegExp(`(^|\\s)${word}(?=\\s|$)`, 'gi'), ' ')
  return value.replace(/[()\-–—،,:;*•]/g, ' ').replace(/\s+/g, ' ').trim()
}
export function cleanRecipeText(text: string) { return text.split('\n').map(cleanIngredientLine).filter((item) => item.length > 1) }
export function normalizeIngredient(name: string) { return cleanIngredientLine(name).toLocaleLowerCase('ar').replace(/ة/g, 'ه').trim() }
export function mergeIngredientNames(names: string[]) {
  const seen = new Map<string, string>()
  names.forEach((name) => { const cleaned = cleanIngredientLine(name) || name.trim(); const key = normalizeIngredient(name) || cleaned; if (key) seen.set(key, seen.get(key) ?? cleaned) })
  return [...seen.values()]
}
