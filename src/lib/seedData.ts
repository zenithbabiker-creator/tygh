export interface SeedCategory {
  category: string;
  items: string[];
}

export const NEW_SEED_CATEGORIES: SeedCategory[] = [
  {
    category: 'سوق 21 أجهزة بركانية',
    items: [
      'شواية لحم',
      'ثلاجة حلويات',
      'ماكينة شاورما كهرباء',
      'مضارب',
      'آيس ميكر'
    ]
  },
  {
    category: 'عام',
    items: [
      'طاولة السندوتش',
      'صواني قرص',
      'ميزان ساعة',
      'شواية مشكل',
      'حوضات',
      'ديسبنسر',
      'صحن السندوتش',
      'كرتونة زجاج',
      'شيخ الشواية',
      'فرامة أكياس + أخشاب',
      'شاورما دجاج',
      'غلاية لتر',
      'مبرد عصير',
      'منشر لحوم',
      'غلاية لتر كهرباء',
      'شواية عرض السندوتش',
      'بسكيت سمك',
      'شواية فراخ',
      'كرتونة صواني',
      'غلاية غاز',
      'قاطع سيخ شتراك صغير',
      'عصارة برتقال'
    ]
  },
  {
    category: 'الأجهزة',
    items: [
      'طاولة السندوتش',
      'طباخة 2 شعلة فول',
      'م. السندوتش مرضى',
      'ماكينة بطاطس',
      'مبرد غاز',
      'فريزر هاير جديد',
      'ماكينة سمك',
      'شواية فراخ دوار',
      'غلاية لتر كهرباء',
      'ماكينة بروست ضغط',
      'صندل في مكان نائي يصعب الوصول إليه'
    ]
  },
  {
    category: 'المخزن الشروق',
    items: [
      'شوايه فحم',
      'شاورما دبل',
      'غلايه غاز',
      'سخانات بروست أحمر',
      'فرن طبقة غاز',
      'مضرب نابوليتان',
      'بوفيه',
      'قلاب لحوم',
      'مسخنات بروست',
      'توستر',
      'كرتونه تقطيع بطاطس',
      'كرتونه ثلج',
      'قلايه 2 عين غاز',
      'وافل مدور + مربع',
      'ايس ميكر كيلو',
      'منشار لحمه',
      'كسارة ثلج',
      'ماكينه كاشير',
      'بروست',
      'فرن طابق',
      'شوايه لحم',
      'غلايه كهرباء لتر'
    ]
  },
  {
    category: 'مخزن العمدة غرب',
    items: [
      'حوض عين',
      'راس شاورما',
      'ثلاجة حلويات',
      'شواية فحم',
      'ثلاجة عرض السندوتش',
      'مفرمة',
      'سخان بروست',
      'كابتشينو',
      'خلاط لتر',
      'سخانة منزلية',
      'مسن بروست',
      'مفرمة لحم',
      'خلاط لتر ك',
      'كسارة ثلج',
      'كبسة دبل مفرد',
      'قلاية مفرد غاز',
      'كبس سمك',
      'سخان ماء بويلر',
      'ماكينة تتبيل بروست',
      'كرتونة صحون',
      'وافل مربع',
      'فرن مدور'
    ]
  }
];

export interface InitialProductItem {
  id: string;
  code: string;
  name: string;
  category: string;
  stock: number;
  minStock: number;
  unit: string;
  price: number;
  description: string;
  updatedAt: string;
}

export function getDefaultItemPrice(itemName: string, category?: string): number {
  const name = itemName.trim();
  if (name.includes('فريزر') || name.includes('ثلاجة حلويات') || name.includes('ثلاجة عرض')) return 24000;
  if (name.includes('بروست ضغط') || name.includes('ماكينة بروست')) return 28000;
  if (name.includes('شاورما كهرباء') || name.includes('شاورما دبل') || name.includes('راس شاورما') || name.includes('شاورما دجاج')) return 16500;
  if (name.includes('آيس ميكر') || name.includes('ايس ميكر')) return 18500;
  if (name.includes('شواية لحم') || name.includes('شوايه لحم') || name.includes('شواية مشكل') || name.includes('شواية فراخ')) return 13500;
  if (name.includes('شواية فحم') || name.includes('شوايه فحم')) return 9500;
  if (name.includes('فرن طبقة') || name.includes('فرن طابق') || name.includes('فرن مدور')) return 17500;
  if (name.includes('ماكينة بطاطس') || name.includes('قلايه 2 عين') || name.includes('قلاية مفرد')) return 8500;
  if (name.includes('مفرمة لحم') || name.includes('مفرمة') || name.includes('قلاب لحوم')) return 9800;
  if (name.includes('منشار لحمه') || name.includes('منشر لحوم')) return 11000;
  if (name.includes('ماكينه كاشير')) return 14500;
  if (name.includes('ماكينة سمك') || name.includes('بسكيت سمك') || name.includes('كبس سمك')) return 7800;
  if (name.includes('طباخة') || name.includes('غلاية غاز') || name.includes('غلايه غاز') || name.includes('غلاية لتر')) return 6200;
  if (name.includes('مبرد عصير') || name.includes('مبرد غاز') || name.includes('سخان ماء')) return 8900;
  if (name.includes('طاولة السندوتش') || name.includes('بوفيه')) return 7500;
  if (name.includes('سخان بروست') || name.includes('سخانات بروست') || name.includes('مسخنات بروست')) return 5800;
  if (name.includes('خلاط') || name.includes('عصارة برتقال') || name.includes('كابتشينو')) return 4200;
  if (name.includes('مضرب') || name.includes('مضارب') || name.includes('توستر') || name.includes('وافل')) return 3800;
  if (name.includes('كسارة ثلج') || name.includes('ميزان ساعة') || name.includes('ديسبنسر')) return 2900;
  if (name.includes('حوض') || name.includes('حوضات')) return 3500;
  if (name.includes('كرتونة') || name.includes('صواني') || name.includes('صحن')) return 1500;
  return 4500;
}

/**
 * Builds the comprehensive list of 82 initial products
 */
export function generateInitialProducts(): InitialProductItem[] {
  const products: InitialProductItem[] = [];
  let seq = 1;
  const now = new Date().toISOString();

  for (const cat of NEW_SEED_CATEGORIES) {
    for (const itemName of cat.items) {
      const codeNum = 100 + seq;
      const price = getDefaultItemPrice(itemName, cat.category);
      products.push({
        id: String(seq),
        code: `NOSSER-${codeNum}`,
        name: itemName,
        category: cat.category,
        stock: 10,
        minStock: 5,
        unit: 'وحدة',
        price,
        description: `صنف معتمد: ${itemName} - قسم ${cat.category}`,
        updatedAt: now,
      });
      seq++;
    }
  }

  return products;
}

export const INITIAL_PRODUCTS: InitialProductItem[] = generateInitialProducts();
